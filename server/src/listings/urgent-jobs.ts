import type { PoolClient } from "pg";
import { query, transaction } from "../db.ts";
import { publishUserEvent } from "../ws/notifications.ts";
import { AUTO_HOLD, priceAt, STEPS, pickAutoBidWinner, reservationBan, shouldCloseExpiredLot } from "./urgent.ts";

export interface UrgentLot { id:string; category:string; author_id:string; title:string; state:string; urgent_type:string|null; price_start_minor:number|null; price_floor_minor:number|null; created_at:Date; expires_at:Date; is_seed:boolean }
export function lotPrice(lot:UrgentLot, now:Date = new Date()) {
  return priceAt({start:lot.price_start_minor ?? 0, floor:lot.price_floor_minor ?? 0, createdAt:lot.created_at, expiresAt:lot.expires_at,
    steps:STEPS[Math.round((lot.expires_at.getTime()-lot.created_at.getTime())/60000)] ?? 8}, now);
}
export async function expireReservations(client?:PoolClient, listingId?:string) {
  const sql = "UPDATE listing_reservations SET status = 'expired' WHERE status = 'active' AND expires_at <= now() AND ($1::uuid IS NULL OR listing_id = $1)";
  if (client) await client.query(sql,[listingId ?? null]); else await query(sql,[listingId ?? null]);
}
export async function urgentEvent(client:PoolClient, listingId:string, userId:string|null, kind:string, meta:object = {}) {
  await client.query("INSERT INTO listing_events (listing_id,user_id,kind,meta) VALUES ($1,$2,$3,$4::jsonb)",[listingId,userId,kind,JSON.stringify(meta)]);
}
export async function insertUrgentNotification(client:PoolClient, userId:string, kind:string, payload:Record<string,unknown>) {
  if (kind === 'urgent_reserved' || kind === 'urgent_auto_reserved') {
    await client.query("DELETE FROM notifications WHERE user_id=$1 AND kind=$2 AND payload->>'listingId'=$3",[userId,kind,payload['listingId']]);
  }
  const result = await client.query<{id:string;created_at:Date}>(`INSERT INTO notifications (user_id,kind,payload) VALUES ($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING id,created_at`,[userId,kind,JSON.stringify(payload)]);
  const row = result.rows[0];
  return row ? {userId, notification:{id:row.id,kind,payload,readAt:null,createdAt:row.created_at.toISOString()}} : null;
}
export function deliverUrgent(notices:Awaited<ReturnType<typeof insertUrgentNotification>>[]) {
  for (const notice of notices) if (notice) {
    try { publishUserEvent(notice.userId,{type:"notification",notification:notice.notification}); }
    catch(error) { console.error("[urgent] websocket",error); }
  }
}
export async function buyerAllowed(client:PoolClient, buyerId:string, authorId:string) {
  const result = await client.query(`SELECT u.phone_verified, u.deleted_at, u.blocked_at,
    EXISTS(SELECT 1 FROM blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)) AS blocked
    FROM users u WHERE u.id=$1`,[buyerId,authorId]);
  const user = result.rows[0];
  if (!user || !user.phone_verified || user.deleted_at || user.blocked_at || user.blocked || buyerId === authorId) return false;
  const shows = await client.query<{author_id:string}>(`SELECT DISTINCT l.author_id FROM listing_reservations r JOIN listings l ON l.id=r.listing_id
    WHERE r.buyer_id=$1 AND r.status='no_show' AND EXISTS(SELECT 1 FROM listing_events e WHERE e.listing_id=l.id AND e.user_id=$1 AND e.kind='no_show' AND e.created_at >= now()-interval '30 days')`,[buyerId]);
  return !reservationBan(shows.rows.map(r=>r.author_id));
}
export async function reserveLot(client:PoolClient, lot:UrgentLot, buyerId:string, minutes:number, source:"manual"|"auto") {
  const price = lotPrice(lot).priceMinor;
  const result = await client.query<{id:string;expires_at:Date}>(`INSERT INTO listing_reservations (listing_id,buyer_id,price_minor,source,expires_at)
    VALUES ($1,$2,$3,$4,now()+make_interval(mins=>$5::int)) RETURNING id,expires_at`,[lot.id,buyerId,price,source,minutes]);
  let conversationId = (await client.query<{conversation_id:string}>("SELECT conversation_id FROM listing_responses WHERE listing_id=$1 AND user_id=$2",[lot.id,buyerId])).rows[0]?.conversation_id;
  if (!conversationId) {
    conversationId = (await client.query<{id:string}>("INSERT INTO conversations (match_id) VALUES (NULL) RETURNING id")).rows[0]?.id;
    if (!conversationId) throw new Error("Conversation creation failed");
    await client.query("INSERT INTO conversation_participants (conversation_id,user_id) VALUES ($1,$2),($1,$3)",[conversationId,buyerId,lot.author_id]);
    await client.query("INSERT INTO listing_responses (listing_id,user_id,conversation_id) VALUES ($1,$2,$3)",[lot.id,buyerId,conversationId]);
  }
  // Existing messages schema has text kind only; seller-authored service text, tagged in event.
  await client.query("INSERT INTO messages (conversation_id,author_id,kind,text) VALUES ($1,$2,'text',$3)",
    [conversationId,lot.author_id,`Бронь на ${minutes} минут по цене ${new Intl.NumberFormat('ru-RU').format(price/100)} ₽. Договоритесь о встрече`]);
  await client.query("UPDATE conversations SET last_message_at = now() WHERE id = $1",[conversationId]);
  await urgentEvent(client,lot.id,buyerId,source === 'auto' ? 'auto_reserve' : 'reserve',{priceMinor:price,minutes,conversationId});
  return {reservationId:result.rows[0]?.id,expiresAt:result.rows[0]?.expires_at.toISOString(),priceMinor:price,source,conversationId};
}
let running = false;
export async function runUrgentJobs() {
  if (running) return;
  running = true;
  try {
    const notices = await transaction(async client => {
      // Cross-process guard: PM2 workers cannot run the same batch concurrently.
      const lock = await client.query<{locked:boolean}>("SELECT pg_try_advisory_xact_lock(310031) AS locked");
      if (!lock.rows[0]?.locked) return [];
      const lots = await client.query<UrgentLot>("SELECT * FROM listings WHERE category='urgent' AND state='active' AND outcome IS NULL ORDER BY id FOR UPDATE SKIP LOCKED");
      const pending:Awaited<ReturnType<typeof insertUrgentNotification>>[] = [];
      for (const lot of lots.rows) {
        await expireReservations(client,lot.id);
        const held = await client.query<{expires_at:Date}>("SELECT expires_at FROM listing_reservations WHERE listing_id=$1 AND status='active' AND expires_at>now()",[lot.id]);
        if (lot.expires_at.getTime() <= Date.now()) {
          if(lot.urgent_type!=='sell') continue;
          if (!shouldCloseExpiredLot({lotExpiresAt:lot.expires_at,activeReservationExpiresAt:held.rows[0]?.expires_at,now:Date.now()})) continue;
          await client.query("UPDATE listings SET state='closed',outcome='expired',closed_at=now(),updated_at=now() WHERE id=$1",[lot.id]);
          await client.query("UPDATE listing_reservations SET status='expired' WHERE listing_id=$1 AND status='active'",[lot.id]);
          await client.query("UPDATE listing_bids SET status='cancelled' WHERE listing_id=$1 AND status='active'",[lot.id]);
          await urgentEvent(client,lot.id,lot.author_id,'expired');
          pending.push(await insertUrgentNotification(client,lot.author_id,'urgent_expired_relist',{listingId:lot.id,message:'Срок истёк. Можно перезапустить объявление.'}));
          continue;
        }
        if (lot.urgent_type==='sell' && !held.rowCount && !lot.is_seed) {
          const result = await client.query<{buyer_id:string;max_price_minor:number;status:string;created_at:Date}>("SELECT * FROM listing_bids WHERE listing_id=$1 AND status='active'",[lot.id]);
          const bids = result.rows.map(b=>({buyerId:b.buyer_id,maxPriceMinor:b.max_price_minor,status:b.status,createdAt:b.created_at}));
          let winner = pickAutoBidWinner(bids,lotPrice(lot).priceMinor);
          while (winner && !(await buyerAllowed(client,winner.buyerId,lot.author_id))) {
            bids.splice(bids.indexOf(winner),1); winner=pickAutoBidWinner(bids,lotPrice(lot).priceMinor);
          }
          if (winner) {
            const reserved = await reserveLot(client,lot,winner.buyerId,AUTO_HOLD,'auto');
            await client.query("UPDATE listing_bids SET status='won' WHERE listing_id=$1 AND buyer_id=$2",[lot.id,winner.buyerId]);
            for (const userId of [winner.buyerId,lot.author_id]) pending.push(await insertUrgentNotification(client,userId,'urgent_auto_reserved',{listingId:lot.id,...reserved}));
          }
        }
        const remaining = lot.expires_at.getTime()-Date.now();
        if (lot.expires_at.getTime()-lot.created_at.getTime() >= 3600000 && remaining <= 1800000) {
          const watchers = await client.query<{user_id:string}>(`SELECT w.user_id FROM listing_watchers w JOIN users u ON u.id=w.user_id
            WHERE w.listing_id=$1 AND u.deleted_at IS NULL AND u.blocked_at IS NULL AND NOT EXISTS
            (SELECT 1 FROM blocks b WHERE (b.user_id=w.user_id AND b.blocked_id=$2) OR (b.user_id=$2 AND b.blocked_id=w.user_id))`,[lot.id,lot.author_id]);
          for (const watcher of watchers.rows) pending.push(await insertUrgentNotification(client,watcher.user_id,'urgent_final_call',{listingId:lot.id}));
        }
      }
      return pending;
    });
    deliverUrgent(notices);
  } catch(error) { console.error('[urgent-jobs]',error); }
  finally { running=false; }
}
