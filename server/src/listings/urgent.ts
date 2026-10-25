/** Pure urgent-deal rules; byte-identical browser copy. Amounts are minor units. */
export const URGENT_TYPES = ["sell", "buy", "help", "ride", "giveaway"] as const;
export type UrgentType = (typeof URGENT_TYPES)[number];
export const URGENT_DURATIONS = {
  sell: { options: [15, 30, 60, 180, 360, 720, 1440], default: 360 },
  buy: { options: [60, 180, 360, 1440], default: 360 },
  help: { options: [15, 30, 60, 180], default: 60 },
  ride: { options: [30, 60, 180], default: 60 },
  giveaway: { options: [180, 360, 1440], default: 360 },
};
export const STEPS: Record<number, number> = {15:3,30:4,60:5,180:6,360:8,720:9,1440:10};
export const DROP_WINDOW = 0.85;
export const STEP_WEIGHT_RATIO = 1.5;
export const MAX_START_TO_FLOOR = 1.5;
export const MIN_FLOOR_MINOR = 10000;
export const HOLD_OPTIONS = [15,30,60] as const;
export const AUTO_HOLD = 30;
export const DEFAULT_START_SHARE = 0.75;
export const DEFAULT_FLOOR_SHARE = 0.55;
export const NEW_ACCOUNT_MAX_ACTIVE = 1;
export const ACTIVE_MAX = 3;
const time = (value: Date | string | number) => new Date(value).getTime();
export function shouldCloseExpiredLot(input: {lotExpiresAt:Date|string|number; activeReservationExpiresAt?:Date|string|number|null; now:Date|string|number}) {
  return time(input.lotExpiresAt) <= time(input.now)
    && (input.activeReservationExpiresAt == null || time(input.activeReservationExpiresAt) <= time(input.now));
}
export function priceAt(input: {start:number; floor:number; createdAt:Date|string|number; expiresAt:Date|string|number; steps:number}, now:Date|string|number = Date.now()) {
  const created = time(input.createdAt), end = time(input.expiresAt);
  const steps = Math.max(1, Math.trunc(input.steps));
  const interval = Math.max(1, (end-created)*DROP_WINDOW/steps);
  const stepIndex = Math.min(steps, Math.max(0, Math.floor((time(now)-created)/interval)));
  const share = (STEP_WEIGHT_RATIO**stepIndex-1)/(STEP_WEIGHT_RATIO**steps-1);
  const raw = input.start-(input.start-input.floor)*share;
  // Prices >= 100,000 RUB round to 10 RUB; other prices to 1 RUB.
  const unit = raw >= 10_000_000 ? 1000 : 100;
  const priceMinor = stepIndex === steps ? input.floor : stepIndex === 0 ? input.start : Math.max(input.floor, Math.min(input.start, Math.round(raw/unit)*unit));
  return { priceMinor, nextDropAt: stepIndex < steps ? new Date(created+interval*(stepIndex+1)).toISOString() : null,
    lastDropAt: new Date(created+interval*stepIndex).toISOString(), stepIndex, steps };
}
export function floorHintPct(start:number, floor:number) { return start > 0 ? Math.floor(floor/start*10)*10 : 0; }
export function validateSell({start,floor}: {start:number;floor:number;market?:number}, _trustLevel?:string) {
  if (floor > start) return "FLOOR_ABOVE_START";
  if (start > MAX_START_TO_FLOOR*floor) return "START_TOO_HIGH";
  if (floor < MIN_FLOOR_MINOR) return "FLOOR_TOO_LOW";
  return null;
}
export function suggestPrices(market:number) { return {start:Math.round(market*DEFAULT_START_SHARE), floor:Math.round(market*DEFAULT_FLOOR_SHARE)}; }
export function normalizeTitleKey(title:string) { return title.normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/ё/g,"е").replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," "); }
export function reservationBan(noShowsBySellerLast30d: readonly string[]) { return new Set(noShowsBySellerLast30d).size >= 2; }
export interface AutoBid { buyerId:string; maxPriceMinor:number; status:string; createdAt:Date|string|number }
export function pickAutoBidWinner<T extends AutoBid>(bids:readonly T[], currentPrice:number):T|null {
  return [...bids].filter(b=>b.status === "active" && b.maxPriceMinor >= currentPrice)
    .sort((a,b)=>b.maxPriceMinor-a.maxPriceMinor || time(a.createdAt)-time(b.createdAt) || a.buyerId.localeCompare(b.buyerId))[0] ?? null;
}
