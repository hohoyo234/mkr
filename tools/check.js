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
  assert.equal(lab2.actual, 292.5 + off.hours*30, 'clocked cost is not worked hours at the rate that applied');
  assert.equal(lab2.planned, lab.planned, 'clocking on changed what had been planned');

  console.log('all good');
})().catch(e=>{ console.error(e.message); process.exit(1); });
