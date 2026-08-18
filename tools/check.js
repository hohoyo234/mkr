#!/usr/bin/env node
/* Smoke check for the logic that used to be wrong on a clock east of Greenwich.
   Run from the repo root, in a timezone where UTC is still on yesterday:
       TZ=Australia/Melbourne node tools/check.js
   No framework: it throws on the first thing that breaks. */
const fs = require('fs'), assert = require('assert');

// --- the thinnest browser the modules will accept -------------------------
global.window = global;
global.navigator = { onLine:true };
global.document = { createElement:()=>({ innerHTML:'', content:{firstElementChild:null} }),
                    querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){},
                    body:{ classList:{add(){},remove(){},toggle(){}} } };
global.addEventListener = ()=>{};
const load = (f)=> (0, eval)(fs.readFileSync(f, 'utf8'));

// --- in-memory database ---------------------------------------------------
const tables = {}, metas = {};
const MKRdb = {
  async getAll(t){ return Object.values(tables[t] || {}); },
  async get(t,id){ return (tables[t]||{})[id] || null; },
  async put(t,obj){ tables[t] = tables[t] || {};
    const id = obj.id || 'id'+Math.random().toString(36).slice(2);
    return tables[t][id] = {...(tables[t][id]||{}), ...obj, id}; },
  async meta(k,v){ if(v===undefined) return metas[k]; metas[k]=v; return v; },
  on(){ return ()=>{}; },
};

load('js/util.js');
window.MKR.db = MKRdb;
window.MKR.auth = { current:()=>({id:'u_amy', name:'Amy', kitchenId:'k_main'}) };
const raised = [];
window.MKR.alerts = { async raise(o){ raised.push(o); return o; } };
window.MKR.audit = { async log(){} };
load('js/tasks.js');
load('js/ui.js');
load('js/roster.js');
load('js/stock.js');

const U = window.MKR.util, T = window.MKR.tasks, S = window.MKR.stock, R = window.MKR.roster;

(async ()=>{
  // 1. A local calendar date, not a UTC one. 09:00 in Melbourne is still
  //    yesterday in London, and that is what emptied the morning's checklist.
  const morning = Date.parse('2026-08-16T23:00:00Z');           // 2026-08-17 09:00 AEST
  if(new Date().getTimezoneOffset() < 0)                        // only meaningful east of UTC
    assert.equal(U.isoDate(morning), '2026-08-17', 'isoDate fell back to the UTC day');
  assert.equal(U.isoDate(new Date(2026,7,17,0,0,0)), '2026-08-17', 'local midnight moved');

  // 2. A week key is the MONDAY the README promises.
  assert.equal(new Date(R.weekKey(R.weekStart(0))+'T00:00:00').getDay(), 1, 'week does not start on Monday');

  // 3. The checklist republishes itself when the day turns over.
  await MKRdb.meta('settings', {dailyTasks:['Fridge temperature check','Closing stocktake photo','Mop floors']});
  let list = await T.today();
  assert.equal(list.length, 3, 'the new day opened an empty checklist');
  assert.equal((await T.today()).length, 3, 'a second read published a duplicate list');

  // 4. What a tick requires: the reading, the photo, and an alert on a warm fridge.
  const fridge = list[0], photoJob = list[1], mopping = list[2];
  assert.equal((await T.complete(fridge, {})).ok, false, 'a temperature task ticked with no reading');
  assert.equal((await T.complete(photoJob, {})).ok, false, 'a photo task ticked with no photo');
  assert.equal((await T.complete(mopping, {})).ok, true,  'an ordinary task refused a plain tick');
  assert.equal((await T.complete(photoJob, {photo:'data:image/png;base64,x'})).ok, true, 'a photo did not tick it off');
  assert.equal(raised.length, 0, 'an alert was raised by something that is not a temperature');
  assert.equal((await T.complete(fridge, {value:'3.5'})).ok, true, 'a good reading was refused');
  assert.equal(raised.length, 0, '3.5°C is a working fridge, not an alert');
  await T.checkTemp(18, 'Fridge temperature check');
  assert.equal(raised.length, 1, '18°C was filed without telling anyone');
  assert.equal(raised[0].level, 'red');

  // 5. A shelf cannot hold −5 kg, and nothing is saved until that is fixed.
  await MKRdb.put('inventory', {id:'i1', name:'Tomatoes', kind:'perishable', qty:4, unit:'kg', kitchenId:'k_main'});
  const bad = await S.saveStocktake([{itemId:'i1', counted:-5}], 'typo');
  assert.equal(bad.error, 'negative', 'a negative count went into stock');
  assert.equal((await MKRdb.get('inventory','i1')).qty, 4, 'the bad count reached inventory anyway');
  const good = await S.saveStocktake([{itemId:'i1', counted:6}], 'monday');
  assert.ok(good && !good.error && good.lines.length===1, 'a real count would not save');
  assert.equal((await MKRdb.get('inventory','i1')).qty, 6);

  // 6. What a week costs. Every figure here is the owner's own rate times hours
  //    this app already had — no award is read and no pay is calculated.
  const WK = '2026-08-17';                       // a Monday
  await R.savePrefs({defaultRate:0, weekendMult:1.5, holidayMult:2.5, extraHolidays:'2026-08-19'});
  await MKRdb.put('users', {id:'u_amy', name:'Amy', role:'staff', payRate:30});
  await MKRdb.put('users', {id:'u_bo',  name:'Bo',  role:'staff'});            // no rate on purpose
  const nine = (d)=> new Date(2026, 7, d, 9, 0, 0).getTime();
  for(const [id, day, who] of [['s_mon',0,'u_amy'], ['s_wed',2,'u_amy'], ['s_sat',5,'u_amy'], ['s_bo',0,'u_bo']])
    await MKRdb.put('shifts', {id, week:WK, day, staffId:who, start:'09:00', end:'17:00'});

  const lab = await R.labour(WK, '2026-08-23');
  assert.equal(lab.byDate['2026-08-17'].planned, 240, 'a weekday is not just the rate times the hours');
  assert.equal(lab.byDate['2026-08-19'].planned, 600, 'the public holiday multiplier did not apply');
  assert.equal(lab.byDate['2026-08-22'].planned, 360, 'the weekend multiplier did not apply');
  assert.equal(lab.planned, 1200, 'the week did not add up');
  assert.deepEqual(lab.unrated, ['Bo'], 'someone rostered with no rate was not named');
  assert.ok(R.holidayName('2026-11-03'), 'Melbourne Cup is not in the Victorian holiday table');
  assert.ok(R.holidaysCovered('2026') && !R.holidaysCovered('2031'), 'an unlisted year was reported as covered');

  // 7. The divisor bug the food cost % had, in its labour form: a week of roster
  //    over the two days you entered takings for is not a labour percentage.
  assert.equal(R.labourOn(lab, ['2026-08-17']), 240, 'one day of labour picked up the whole week');

  // 8. Hours worked. No clock-off is read as the rostered finish; a clock-off is
  //    the real gap, and it closes the same row rather than opening a new one.
  const sat = await MKRdb.get('shifts', 's_sat');
  await MKRdb.put('clockins', {id:'ck1', shiftId:'s_sat', staffId:'u_amy', clockTs:nine(22)});
  assert.equal(R.workedHours(sat, await MKRdb.get('clockins','ck1')), 8, 'a shift never clocked off lost its rostered hours');
  await MKRdb.put('clockins', {id:'ck1', clockOutTs: nine(22) + 6.5*36e5});
  assert.equal(R.workedHours(sat, await MKRdb.get('clockins','ck1')), 6.5, 'the clock-off did not shorten the shift');

  await MKRdb.put('clockins', {id:'ck2', shiftId:'s_mon', staffId:'u_amy', clockTs:nine(17)});
  const off = await R.clockOut({id:'s_mon', week:WK, day:0, start:'09:00', end:'17:00'}, {id:'u_amy'});
  assert.ok(off && off.row.clockOutTs, 'clocking off wrote nothing');
  assert.equal((await MKRdb.getAll('clockins')).length, 2, 'clocking off opened a new row instead of closing the shift');

  const lab2 = await R.labour(WK, '2026-08-23');
  assert.equal(lab2.actual, U.round2(292.5 + U.round2(off.hours*30)), 'clocked cost is not worked hours at the rate that applied');
  assert.equal(lab2.planned, lab.planned, 'clocking on changed what had been planned');

  // 9. The fortnight cap. It counts a number the OWNER recorded against the
  //    roster; it never reads a visa. Both fortnights the week could sit in are
  //    checked, because nothing here knows where a visa fortnight starts.
  await R.savePrefs({visaCapWarn:true});
  await MKRdb.put('users', {id:'u_bo', name:'Bo', role:'staff', fortnightCap:48});
  const capless = async ()=> (await R.warnings(WK, [await MKRdb.get('users','u_bo')])).filter(w=>/in a fortnight/.test(w.title));
  assert.equal((await capless()).length, 0, 'an 8h fortnight tripped a 48h cap');

  // 50h across the previous week alone — the fortnight ending this Sunday is over.
  const PREV = '2026-08-10';
  for(const d of [0,1,2,3,4])
    await MKRdb.put('shifts', {id:'sp'+d, week:PREV, day:d, staffId:'u_bo', start:'09:00', end:'19:00'});
  const hits = await capless();
  assert.equal(hits.length, 1, 'a 58h fortnight did not raise exactly one warning');
  assert.equal(hits[0].level, 'red', 'going over the cap is not a red');
  assert.ok(/58\.0h/.test(hits[0].title), 'the warning did not name the hours: '+hits[0].title);
  assert.ok(/10 Aug/.test(hits[0].detail) && /23 Aug/.test(hits[0].detail),
    'the warning did not name the fortnight it added up: '+hits[0].detail);

  await R.savePrefs({visaCapWarn:false});
  assert.equal((await capless()).length, 0, 'switching the warning off did not switch it off');
  await R.savePrefs({visaCapWarn:true});

  // 10. Public holidays reach the roster as names, and an owner-declared date
  //     works exactly like a gazetted one.
  assert.equal(R.holidayName('2026-11-03', {}), 'Melbourne Cup');
  assert.equal(R.holidayName('2026-10-02', {}), null, 'a date nobody declared came back a holiday');
  assert.ok(R.holidayName('2026-10-02', {extraHolidays:'2026-10-02'}), 'a declared date was ignored');

  // 11. A count priced. The gap is signed, valued at the price AT THE TIME, and
  //     is NOT the bin: recorded waste already came off the book.
  await MKRdb.put('inventory', {id:'i2', name:'Beef', kind:'perishable', qty:10, unit:'kg', price:20, kitchenId:'k_main'});
  await MKRdb.put('inventory', {id:'i3', name:'Rice', kind:'nonperishable', qty:8,  unit:'kg', price:3,  kitchenId:'k_main'});
  const cnt = await S.saveStocktake([{itemId:'i2', counted:7}, {itemId:'i3', counted:9}], 'monday');
  const beef = cnt.lines.find(l=>l.itemId==='i2'), rice = cnt.lines.find(l=>l.itemId==='i3');
  assert.equal(beef.diff, -3, 'the beef gap was not counted');
  assert.equal(beef.amount, -60, '3kg of $20 beef short is not −$60');
  assert.equal(rice.amount, 3, 'a kilo found over did not come back positive');
  assert.equal(cnt.value, -57, 'the count did not net out to −$57');

  // The line keeps the price it was counted at, so re-pricing beef later cannot
  // rewrite what the owner acted on.
  await MKRdb.put('inventory', {id:'i2', price:40});
  const g = await S.shrinkSince(30);
  assert.equal(g.value, -57, 'a price rise re-valued a count that had already happened');
  assert.equal(g.legacy, 0, 'a freshly priced count was treated as legacy');
  assert.equal(g.short[0].name, 'Beef', 'the worst line is not first');

  // A count from before prices were kept still has to produce a figure, and has
  // to say that it was valued at today's price rather than that day's.
  await MKRdb.put('stocktakes', {id:'stk_old', ts:Date.now()-2*864e5, kitchenId:'k_main',
    lines:[{itemId:'i3', name:'Rice', diff:-2}]});
  const g2 = await S.shrinkSince(30);
  assert.equal(g2.legacy, 1, 'an unpriced legacy line was not flagged');
  assert.equal(g2.value, -63, 'the legacy line was not valued at today\'s price');

  // 12. A dish cost card. Coarse recipe × the price actually paid, against a
  //     menu price that is quoted GST-inclusive.
  await MKRdb.put('inventory', {id:'i4', name:'Noodles', kind:'nonperishable', qty:20, unit:'kg', price:5, kitchenId:'k_main'});
  await MKRdb.put('inventory', {id:'i2', name:'Beef', kind:'perishable', qty:7, unit:'kg', price:20,
    priceHistory:[{ts:Date.now()-5*864e5, price:20}], kitchenId:'k_main'});
  const bowl = await S.saveRecipe({name:'Beef noodle soup', price:18.7,
    lines:[{itemId:'i2', qty:0.2}, {itemId:'i4', qty:0.15}]});
  const its = await S.items();

  const inc = await S.dishCost(bowl, its, {inc:true, rate:10});
  assert.equal(inc.cost, 4.75, '0.2kg beef at $20 + 0.15kg noodles at $5 is not $4.75');
  assert.equal(inc.net, 17, 'a $18.70 GST-inclusive price is not $17.00 net');
  assert.equal(inc.pct, 27.94, 'the ratio was not taken against the ex-GST price');

  // Off the switch and the same dish reads a tenth better — which is the whole
  // reason the default is on.
  const ex = await S.dishCost(bowl, its, {inc:false, rate:10});
  assert.equal(ex.net, 18.7);
  assert.ok(ex.pct < inc.pct, 'treating the price as GST-free did not flatter the dish');

  // Beef goes up. The card has to move, and has to remember where it came from.
  await MKRdb.put('inventory', {id:'i2', price:23.6,
    priceHistory:[{ts:Date.now()-5*864e5, price:20}, {ts:Date.now(), price:23.6}]});
  const after = await S.dishCost(bowl, await S.items(), {inc:true, rate:10});
  assert.equal(after.cost, 5.47, 'an 18% beef rise did not reach the bowl');
  assert.equal(after.moved.length, 1, 'the risen ingredient was not flagged');
  assert.equal(after.was, 4.75, 'the card forgot what it cost before the rise');
  assert.ok(after.pct > after.wasPct, 'the cost percentage did not move with the price');

  console.log('all good');
})().catch(e=>{ console.error(e.message); process.exit(1); });
