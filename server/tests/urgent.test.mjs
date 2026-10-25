import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {priceAt,STEPS,URGENT_DURATIONS,validateSell,floorHintPct,reservationBan,pickAutoBidWinner,normalizeTitleKey,suggestPrices,HOLD_OPTIONS,AUTO_HOLD,ACTIVE_MAX,NEW_ACCOUNT_MAX_ACTIVE,shouldCloseExpiredLot} from '../src/listings/urgent.ts';
const base={start:150000,floor:100000,createdAt:0,expiresAt:3600000,steps:5};
test('expired lot without reservation closes',()=>assert.equal(shouldCloseExpiredLot({lotExpiresAt:1000,now:2000}),true));
test('expired lot with ongoing reservation stays active',()=>assert.equal(shouldCloseExpiredLot({lotExpiresAt:1000,activeReservationExpiresAt:3000,now:2000}),false));
test('expired lot closes once reservation ends',()=>assert.equal(shouldCloseExpiredLot({lotExpiresAt:1000,activeReservationExpiresAt:2000,now:2000}),true));
test('unexpired lot does not close',()=>assert.equal(shouldCloseExpiredLot({lotExpiresAt:3000,now:2000}),false));
test('client copy is byte-identical',()=>assert.equal(readFileSync(new URL('../src/listings/urgent.ts',import.meta.url),'utf8'),readFileSync(new URL('../../src/features/nearby/urgent.ts',import.meta.url),'utf8')));
for(const [minutes,steps] of Object.entries(STEPS)) test(`price boundaries for ${minutes} minutes`,()=>{
  const lot={...base,expiresAt:Number(minutes)*60000,steps};
  const interval=lot.expiresAt*.85/steps;
  assert.equal(priceAt(lot,-1).priceMinor,150000);
  assert.equal(priceAt(lot,interval-1).stepIndex,0);
  for(let k=1;k<=steps;k++){
    const at=priceAt(lot,interval*k+.01);
    assert.equal(at.stepIndex,k);
    assert.equal(at.lastDropAt,new Date(interval*k).toISOString());
    assert.equal(at.nextDropAt,k===steps?null:new Date(interval*(k+1)).toISOString());
  }
  assert.equal(priceAt(lot,lot.expiresAt*.85+1).priceMinor,100000);
  assert.equal(priceAt(lot,lot.expiresAt+1).priceMinor,100000);
});
test('drop sizes increase by weighted steps',()=>{
  const prices=Array.from({length:6},(_,k)=>priceAt(base,base.expiresAt*.85/5*k+.01).priceMinor);
  const drops=prices.slice(1).map((p,k)=>prices[k]-p);
  for(let k=1;k<drops.length;k++) assert.ok(drops[k]>drops[k-1]);
  assert.equal(drops.reduce((a,b)=>a+b),50000);
  const expected=50000/(1+1.5+2.25+3.375+5.0625);
  assert.ok(Math.abs(drops[0]-expected)<=100);
});
test('prices round to whole rubles and large prices to 10 rubles',()=>{
  assert.equal(priceAt(base,1000000).priceMinor%100,0);
  const large=priceAt({...base,start:15000000,floor:10000000},1000000);
  assert.equal(large.priceMinor%1000,0);
});
test('floor above start rejected',()=>assert.equal(validateSell({start:10000,floor:10100}),'FLOOR_ABOVE_START'));
test('start above 150 percent rejected',()=>assert.equal(validateSell({start:15001,floor:10000}),'START_TOO_HIGH'));
test('floor below 100 RUB rejected',()=>assert.equal(validateSell({start:9999,floor:9999}),'FLOOR_TOO_LOW'));
test('exact limit accepted and market ignored',()=>assert.equal(validateSell({start:15000,floor:10000,market:1},'new'),null));
test('hint rounds DOWN to tens',()=>{assert.equal(floorHintPct(15000,10000),60);assert.equal(floorHintPct(10000,10000),100);});
test('market suggestion shares',()=>assert.deepEqual(suggestPrices(100000),{start:75000,floor:55000}));
test('ban needs two distinct sellers',()=>{assert.equal(reservationBan(['a','a']),false);assert.equal(reservationBan(['a','b']),true);assert.equal(reservationBan([]),false);});
test('auto winner highest eligible active bid, then earliest',()=>{
  const bids=[{buyerId:'a',maxPriceMinor:20000,status:'active',createdAt:2},{buyerId:'b',maxPriceMinor:20000,status:'active',createdAt:1},{buyerId:'c',maxPriceMinor:30000,status:'cancelled',createdAt:0}];
  assert.equal(pickAutoBidWinner(bids,20000)?.buyerId,'b');assert.equal(pickAutoBidWinner(bids,20001),null);
  assert.equal(pickAutoBidWinner([...bids,{buyerId:'d',maxPriceMinor:25000,status:'active',createdAt:3}],20000)?.buyerId,'d');
});
test('title normalization removes formatting and case',()=>{assert.equal(normalizeTitleKey('  ПРОДАМ! Ёлку  '),'продам елку');assert.equal(normalizeTitleKey('Продам---ёлку'),normalizeTitleKey('ПРОДАМ ёлку'));});
test('sell durations and default',()=>assert.deepEqual(URGENT_DURATIONS.sell,{options:[15,30,60,180,360,720,1440],default:360}));
test('buy durations',()=>assert.deepEqual(URGENT_DURATIONS.buy.options,[60,180,360,1440]));
test('help durations',()=>assert.deepEqual(URGENT_DURATIONS.help.options,[15,30,60,180]));
test('ride durations',()=>assert.deepEqual(URGENT_DURATIONS.ride.options,[30,60,180]));
test('giveaway durations',()=>assert.deepEqual(URGENT_DURATIONS.giveaway.options,[180,360,1440]));
test('hold options',()=>assert.deepEqual(HOLD_OPTIONS,[15,30,60]));
test('auto hold duration',()=>assert.equal(AUTO_HOLD,30));
test('new account limit',()=>assert.equal(NEW_ACCOUNT_MAX_ACTIVE,1));
test('other accounts limit',()=>assert.equal(ACTIVE_MAX,3));
