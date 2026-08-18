/* ===== Initial demo data ===== */
window.MKR = window.MKR || {};
(function(){
  const S = {};

  // Three-portal demo accounts (PROFILE DATA ONLY — no passwords here).
  // Credentials live in Supabase Auth; create the matching Auth users + profiles
  // rows via the dashboard or MKR.setup.createDemoAccounts(). See SECURITY.md.
  // `skills` is what the AI roster plans around — see js/roster.js.
  S.USERS = [
    {id:'u_boss', role:'owner',   name:'James Carter', username:'boss', status:'active'},
    {id:'u_mgr',  role:'manager', name:'Maria Lopez',  username:'mgr',  status:'active',
      skills:['open','close','lead','floor'], availability:{0:'all',1:'all',2:'all',3:'all',4:'all',5:'off',6:'off'}},
    // Staff
    {id:'u_amy',  role:'staff', name:'Amy',  username:'amy',  status:'active',
      age:22, employment:'casual', position:'Front of House', onboarded:true,
      skills:['open','floor','coffee'], availability:{0:'am',1:'am',2:'am',3:'am',4:'am',5:'all',6:'off'}},
    {id:'u_kevin',role:'staff', name:'Kevin',username:'kevin',status:'active',
      age:31, employment:'parttime', position:'Kitchen', onboarded:true,
      skills:['kitchen','close'], availability:{0:'pm',1:'off',2:'pm',3:'pm',4:'pm',5:'pm',6:'all'}},
    {id:'u_leo',  role:'staff', name:'Leo',  username:'leo',  status:'active',
      age:19, employment:'casual', position:'Kitchen', onboarded:false,
      skills:['kitchen','floor'], availability:{0:'all',1:'pm',2:'off',3:'all',4:'off',5:'all',6:'all'}},
  ];

  S.SETTINGS = {
    shopName:'My Kitchen · Melbourne',
    operatingHours:{open:'09:00', close:'22:00'},   // venue opening / closing time
    // Configurable shift slots the roster plans against
    shiftSlots:[
      {label:'Morning', start:'09:00', end:'15:00', k:'am'},
      {label:'Evening', start:'15:00', end:'22:00', k:'pm'},
    ],
    // Custom roles / departments staff can be assigned to
    customRoles:['Kitchen','Front of House','Cashier','Dishwasher','Head Chef'],
    // Role-based FIXED operating hours (departments that run the whole day)
    roleShifts:{ 'Kitchen':{start:'09:00', end:'22:00', fixed:true} },
    dailyTasks:['Fridge temperature check','Deep clean kitchen','Prep check','Mop floors','Closing fridge stocktake photo'],
    // Rostering preferences — `asked:false` makes the AI run its questionnaire
    // the first time someone taps auto-roster, rather than guessing.
    rosterPrefs:{ asked:false },
  };

  // Default kitchen / venue (multi-tenant root) — already set up and approved.
  S.KITCHENS = [
    {id:'k_main', name:'My Kitchen · Melbourne', location:'Melbourne, VIC', status:'active',
     ownerId:'u_boss', primary:true, setupComplete:true, logo:null,
     phone:'03 9000 0000', email:'hello@mykitchen.au', website:'https://mykitchen.au',
     // The shelves a small venue actually walks past, in that order — not an
     // alphabetised taxonomy. Sample data has to look like someone's real list
     // or the feature reads as a spreadsheet column.
     stockCategories:['Meat','Veg','Dry store','Packaging'],
     operatingHours:{open:'09:00', close:'22:00'}, createdAt:Date.now()-90*24*3600e3},
    // A second venue, so the branch switcher exists in the sample data at all.
    // Deliberately quieter than the first — the point of looking at two branches
    // is that they are not the same, and a clone teaches the owner nothing.
    {id:'k_south', name:'My Kitchen · Southbank', location:'Southbank, VIC', status:'active',
     ownerId:'u_boss', primary:false, setupComplete:true, logo:null,
     phone:'03 9000 1111', email:'southbank@mykitchen.au', website:'https://mykitchen.au',
     stockCategories:['Meat','Veg','Dry store','Packaging'],
     operatingHours:{open:'11:00', close:'23:00'}, createdAt:Date.now()-30*24*3600e3},
  ];

  S.SUPPLIERS = [
    {id:'sup_veg',  name:'Vic Fresh Produce', contact:'Tony',   phone:'0412 000 111', email:'orders@vicfresh.au',
     website:'https://vicfreshproduce.com.au', address:'Unit 4, 120 Footscray Rd, West Melbourne VIC',
     abn:'54 221 990 118', account:'MYK-0412', deliveryDays:[2,5], cutoff:'18:00', minOrder:80, terms:'7 days',
     note:'Delivers Tue & Fri before 9am'},
    {id:'sup_meat', name:'Southbank Meats',   contact:'Dana',   phone:'0413 222 333', email:'sales@sbmeats.au',
     website:'https://southbankmeats.com.au', address:'7 Gordon St, South Melbourne VIC',
     abn:'19 604 337 002', account:'SBM-1188', deliveryDays:[1,4], cutoff:'15:00', minOrder:150, terms:'14 days',
     note:'Order by 3pm for next-day'},
    {id:'sup_dry',  name:'Asia Wholesale',    contact:'Mr Lim', phone:'0455 444 555', email:'lim@asiawholesale.au',
     website:'https://asiawholesale.com.au', address:'23 Hallam Rd, Springvale VIC',
     abn:'77 118 245 630', account:'AW-3390', deliveryDays:[3], cutoff:'12:00', minOrder:200, terms:'30 days',
     note:'Chopsticks, containers, dry goods — cheapest in bulk'},
    // The Saturday market run — cash, no account, but sometimes much cheaper.
    // It exists so the price page can answer "could I have paid less?".
    {id:'sup_mkt',  name:'Queen Vic Market run', contact:'—',  phone:'', email:'',
     website:'https://qvm.com.au', address:'Queen Victoria Market, Melbourne VIC',
     abn:'', account:'', deliveryDays:[6], cutoff:'', minOrder:0, terms:'Cash on the day',
     note:'Saturday morning run — cash, pick it up yourself'},
  ];

  // Raw materials plus the tools that quietly run out. Two kinds: perishable
  // (goes off, has a shelf life) and non-perishable (doesn't).
  S.INVENTORY = [
    // Pack sizes are the ones an Australian venue actually gets quoted: the veg
    // run comes in crates, the dry store in cartons, and the butcher weighs to
    // order — so beef, chicken and herbs deliberately have no pack, which is
    // what makes this sample show both routes through the back door.
    {id:'itm_beef',   name:'Beef brisket',  kind:'perishable', unit:'kg',    qty:12,   safety:4,   price:18.90, shelfLifeDays:4,  leadTimeDays:1, supplierId:'sup_meat', category:'Meat'},
    {id:'itm_chick',  name:'Chicken thigh', kind:'perishable', unit:'kg',    qty:9,    safety:4,   price:11.50, shelfLifeDays:3,  leadTimeDays:1, supplierId:'sup_meat', category:'Meat'},
    {id:'itm_noodle', name:'Rice noodles',  kind:'perishable', unit:'kg',    qty:15,   safety:5,   price:4.20,  shelfLifeDays:14, leadTimeDays:2, supplierId:'sup_dry', category:'Dry store', packLabel:'carton', packSize:13},
    {id:'itm_tom',    name:'Tomatoes',      kind:'perishable', unit:'kg',    qty:6,    safety:3,   price:5.80,  shelfLifeDays:5,  leadTimeDays:2, supplierId:'sup_veg', category:'Veg', packLabel:'crate',  packSize:3},
    {id:'itm_herb',   name:'Fresh herbs',   kind:'perishable', unit:'bunch', qty:10,   safety:6,   price:2.40,  shelfLifeDays:3,  leadTimeDays:2, supplierId:'sup_veg', category:'Veg'},
    {id:'itm_oil',    name:'Cooking oil',   kind:'durable',    unit:'L',     qty:22,   safety:8,   price:3.60,  leadTimeDays:3, supplierId:'sup_dry', category:'Dry store', packLabel:'drum',   packSize:20},
    {id:'itm_chop',   name:'Chopsticks',    kind:'durable',    unit:'pairs', qty:1400, safety:500, price:0.035, leadTimeDays:5, supplierId:'sup_dry', category:'Packaging', packLabel:'carton', packSize:3000},
    {id:'itm_box',    name:'Takeaway containers', kind:'durable', unit:'pcs', qty:320, safety:150, price:0.22,  leadTimeDays:5, supplierId:'sup_dry', category:'Packaging', packLabel:'carton', packSize:500},
    {id:'itm_glove',  name:'Food-prep gloves',    kind:'durable', unit:'box', qty:4,   safety:3,   price:9.90,  leadTimeDays:3, supplierId:'sup_dry', category:'Dry store', packLabel:'carton', packSize:4},
  ];

  /* ---------- six weeks of trading, simulated once ----------
     A brand-new venue with no purchases and no counts can't show a receipt, a
     price trend or a usage forecast — every one of those pages is derived from
     history. So the demo venue gets a believable six weeks of it: deliveries on
     the days each supplier actually runs, a Monday count every week, and prices
     that move the way produce prices really move (tomatoes spiking this week,
     oil easing off).

     Everything is generated from one simulation so the numbers agree with each
     other: what you counted, plus what the dockets say you bought, minus what
     you counted next time IS the usage the forecast reports. Nothing is typed
     in twice, so nothing can contradict.                                       */
  const DAYMS = 864e5;

  // What each item costs per week, newest week first (index 0 = the last 7 days).
  const PRICES = {
    itm_beef:  [19.60, 18.90, 18.90, 18.60, 18.40, 18.40, 18.20],
    itm_chick: [11.50, 11.50, 11.20, 11.20, 11.00, 11.00, 11.00],
    itm_tom:   [ 7.20,  6.10,  5.90,  5.80,  5.60,  5.50,  5.50],   // a wet fortnight up north
    itm_herb:  [ 2.90,  2.55,  2.50,  2.40,  2.40,  2.35,  2.35],
    itm_noodle:[ 4.20,  4.20,  4.05,  4.05,  4.05,  3.95,  3.95],
    itm_oil:   [ 3.35,  3.60,  3.60,  3.55,  3.55,  3.50,  3.50],   // came back down
    itm_chop:  [0.035, 0.035, 0.033, 0.033, 0.033, 0.033, 0.033],
    itm_box:   [ 0.24,  0.22,  0.22,  0.22,  0.21,  0.21,  0.21],
    itm_glove: [ 9.90,  9.90,  9.50,  9.50,  9.50,  9.20,  9.20],
  };
  // Who delivers what, on which weekday (0=Sun), how much lands each time, and
  // roughly how much the kitchen gets through in a day. `every` is in weeks.
  const PLAN = {
    itm_beef:  {sup:'sup_meat', days:[1,4],           qty:12,   use:3.4},
    itm_chick: {sup:'sup_meat', days:[1,4],           qty:10,   use:2.9},
    itm_tom:   {sup:'sup_veg',  days:[2,5],           qty:9,    use:2.5},
    itm_herb:  {sup:'sup_veg',  days:[2,5],           qty:7,    use:2.0},
    itm_noodle:{sup:'sup_dry',  days:[3], every:2,    qty:26,   use:1.8},
    itm_oil:   {sup:'sup_dry',  days:[3], every:2,    qty:20,   use:1.4},
    itm_glove: {sup:'sup_dry',  days:[3], every:2,    qty:4,    use:0.28},
    itm_chop:  {sup:'sup_dry',  days:[3], every:4,    qty:3000, use:95},
    itm_box:   {sup:'sup_dry',  days:[3], every:4,    qty:1500, use:48},
  };
  // The one-off cash run, three weeks back — cheaper than the usual supplier,
  // which is exactly the comparison the price page is there to make.
  const MARKET_RUN = {weeks:3, dow:6, sup:'sup_mkt',
    lines:[{id:'itm_tom', qty:8, price:4.90}, {id:'itm_herb', qty:6, price:2.10}]};

  const INVOICE = {sup_veg:'VF-', sup_meat:'SBM-', sup_dry:'AW-', sup_mkt:'CASH-'};
  const PAID    = {sup_veg:'Bank transfer', sup_meat:'Account · 14 days', sup_dry:'Bank transfer', sup_mkt:'Cash'};
  // GST only where a docket really carries it: basic food is GST-free in
  // Australia, packaging and consumables are not. This records what the docket
  // says — the app still does no tax work of its own.
  const GSTABLE = {itm_chop:1, itm_box:1, itm_glove:1, itm_oil:1};

  // Deterministic wobble so quantities and counts don't come out suspiciously
  // even, while the same device always rebuilds the same history.
  function wobble(n){ const x = Math.sin(n*12.9898)*43758.5453; return x - Math.floor(x); }
  const r2 = (n)=> Math.round(n*100)/100;

  S.buildHistory = function(){
    const end = new Date(); end.setHours(8,30,0,0);
    const purchases = [], stocktakes = [], deliveries = [], priceHistory = {}, level = {}, seq = {};
    // Opening shelf: enough of each thing to reach its first delivery, so the
    // simulation doesn't start by running the venue out of chopsticks.
    Object.keys(PLAN).forEach(id=>{
      const p = PLAN[id];
      level[id] = r2(Math.max(p.use*4, p.qty*0.6));
      priceHistory[id] = [];
    });

    const priceAt = (id, wk)=> (PRICES[id]||[])[Math.min(wk, (PRICES[id]||[]).length-1)] || 0;
    // Same rule as MKR.stock's own price log: only record an actual change.
    function logPrice(id, price, ts, supplierId, note){
      const h = priceHistory[id], last = h[h.length-1];
      if(!last || r2(last.price)!==r2(price)) h.push({ts, price:r2(price), supplierId, note});
    }

    for(let ago=41; ago>=0; ago--){
      const ts = end.getTime() - ago*DAYMS;
      const day = new Date(ts), dow = day.getDay(), wk = Math.floor(ago/7);

      // Monday morning count, before the day's delivery lands. The counted
      // figure runs a touch under the book figure — trim, spillage, the odd
      // portion nobody wrote down. That gap is real and the forecast should see it.
      if(dow===1 && ago<35){
        const lines = Object.keys(PLAN).map(id=>{
          const counted = r2(Math.max(0, level[id] * (1 - wobble(ago+id.length)*0.04)));
          const expected = r2(level[id]);
          return {itemId:id, name:(S.INVENTORY.find(i=>i.id===id)||{}).name||'', counted, expected, diff:r2(counted-expected)};
        });
        lines.forEach(l=>{ level[l.itemId] = l.counted; });
        stocktakes.push({id:'stk_seed_'+ago, ts: ts - 30*60e3, by:'Maria Lopez',
          note:'Monday morning count', lines, kitchenId:'k_main'});
      }

      // Deliveries, grouped into one docket per supplier per day — which is how
      // they arrive and how they get paid.
      const bySup = {};
      Object.entries(PLAN).forEach(([id, p])=>{
        if(!p.days.includes(dow)) return;
        if(p.every && (wk % p.every)!==0) return;
        // Order sizes wobble week to week, but an item sold by the carton can
        // only wobble in whole cartons — nobody was ever delivered 2.19 of one.
        // Rounding to the pack is what makes the sample dockets read like paper.
        const it = S.INVENTORY.find(i=>i.id===id) || {};
        const raw = p.qty * (0.9 + wobble(ago*7+id.length)*0.2);
        const qty = it.packSize > 0
          ? r2(Math.max(1, Math.round(raw / it.packSize)) * it.packSize)
          : r2(raw);
        (bySup[p.sup] = bySup[p.sup] || []).push({id, qty, price:priceAt(id, wk)});
      });
      if(wk===MARKET_RUN.weeks && dow===MARKET_RUN.dow)
        bySup[MARKET_RUN.sup] = MARKET_RUN.lines.map(l=>({...l}));

      Object.entries(bySup).forEach(([supId, ls])=>{
        const lines = ls.map(l=>{
          const it = S.INVENTORY.find(i=>i.id===l.id) || {};
          level[l.id] = r2((level[l.id]||0) + l.qty);
          logPrice(l.id, l.price, ts, supId, 'delivery');
          const row = {itemId:l.id, name:it.name||'', unit:it.unit||'', qty:l.qty,
                       unitPrice:r2(l.price), amount:r2(l.qty*l.price)};
          // A regular supplier delivery arrives in the packs they quote, and the
          // docket prices it that way. The Saturday market run doesn't — that is
          // loose produce paid for in cash, so it carries no pack figures and
          // the receipt shows it in kilos, which is how the paper really read.
          if(it.packSize > 0 && supId !== MARKET_RUN.sup){
            row.packSize  = it.packSize;
            row.packLabel = it.packLabel || 'pack';
            row.packQty   = r2(l.qty / it.packSize);
            row.packPrice = r2(l.price * it.packSize);
          }
          return row;
        });
        const sub = r2(lines.reduce((t,l)=>t+l.amount, 0));
        const gst = r2(lines.filter(l=>GSTABLE[l.itemId]).reduce((t,l)=>t+l.amount, 0) * 0.1);
        const fee = supId==='sup_dry' ? 15 : 0;
        seq[supId] = (seq[supId]||0) + 1;
        const pid = 'pur_seed_'+ago+'_'+supId, did = 'dlv_seed_'+ago+'_'+supId;
        const who = dow===1 || dow===4 ? 'Maria Lopez' : 'James Carter';
        const invoiceNo = INVOICE[supId] + (supId==='sup_mkt' ? day.getDate() : (1000 + seq[supId]));

        // Goods only ever enter through the back door, so every docket in the
        // history has the delivery it was checked in on. Two of them came up
        // short — that happens, and the app should look like it happens.
        const shortOne = (ago===9 || ago===23) && lines.length>1;
        purchases.push({
          id:pid, ts, supplierId:supId, invoiceNo, payMethod: PAID[supId], fee, gst, sub,
          total: r2(sub+gst+fee),
          note: supId==='sup_mkt' ? 'Saturday market run — paid cash' : '',
          by: who, deliveryId: did,
          lines: lines.map((l,i)=>({...l, ordered: shortOne && i===1 ? r2(l.qty*1.25) : l.qty,
                                    condition: shortOne && i===1 ? 'short' : 'ok'})),
          kitchenId:'k_main',
        });
        deliveries.push({
          id:did, ts: ts - 20*60e3, status:'confirmed', supplierId:supId,
          supplierName:(S.SUPPLIERS.find(s=>s.id===supId)||{}).name||'',
          docketNo:invoiceNo, payMethod:PAID[supId], fee, gst,
          receivedBy:who, confirmedAt:ts, purchaseId:pid,
          // A chilled delivery gets a probe reading; the dry run doesn't.
          tempC: supId==='sup_meat' ? 2.5 : (supId==='sup_veg' ? 4 : null),
          note: shortOne ? 'One line short — driver said it would come Friday' : '',
          lines: lines.map((l,i)=>({itemId:l.itemId, name:l.name, unit:l.unit,
            ordered: shortOne && i===1 ? r2(l.qty*1.25) : l.qty, received:l.qty,
            unitPrice:l.unitPrice, condition: shortOne && i===1 ? 'short' : 'ok', note:'',
            ...(l.packSize>0 ? {packSize:l.packSize, packLabel:l.packLabel,
                                packQty:l.packQty, packPrice:l.packPrice} : {})})),
          kitchenId:'k_main',
        });
      });

      // What the kitchen got through that day. Friday and Saturday are heavier.
      const busy = (dow===5 || dow===6) ? 1.35 : 1;
      Object.entries(PLAN).forEach(([id, p])=>{
        const used = p.use * busy * (0.75 + wobble(ago*3+id.length*2)*0.5);
        level[id] = r2(Math.max(0, (level[id]||0) - used));
      });
    }

    // Opening price, so the first delivery reads as a change rather than as the
    // beginning of time.
    Object.keys(priceHistory).forEach(id=>{
      const first = priceHistory[id][0];
      if(first) priceHistory[id].unshift({ts: end.getTime()-45*DAYMS, price: r2(priceAt(id,6)*0.98), note:'opening price'});
    });

    const lastCount = stocktakes.length ? stocktakes[stocktakes.length-1].ts : null;
    return {purchases, stocktakes, deliveries, priceHistory, level, lastCount};
  };

  S.SOPS = [
    {id:'sop_fridge', title:'Fridge temperature check', category:'Food safety', version:1,
     why:'A fridge drifting above 5°C overnight can cost you a whole delivery.',
     steps:['Check the display on each fridge and freezer','Write the reading into today\'s task','Fridges must read 5°C or below, freezers −18°C or below','If a reading is out, move the stock to another unit and tell the manager straight away']},
    {id:'sop_close',  title:'Closing the kitchen', category:'Opening & closing', version:1,
     why:'Everything the opener needs is decided by how you left it.',
     steps:['Turn the fryer off at the wall and let the oil cool','Wipe down all benches and the pass','Empty and rinse the bins, take the bags out','Check the walk-in door is properly latched','Photograph the fridge stocktake for the closing task','Lights, gas, back door — then set the alarm']},
    {id:'sop_delivery', title:'Taking a delivery', category:'Equipment', version:1,
     why:'The five minutes at the back door is your only chance to catch a short or warm delivery.',
     steps:['Open Deliveries on your phone before the driver leaves','Count every line — enter what actually arrived, not what was ordered','Check chilled items with a probe and record the temperature','Photograph anything damaged','Mark short or damaged lines before you sign']},
  ];

  // This week's roster (Monday as the start, relative to today)
  function weekStart(){ const d=new Date(); const day=(d.getDay()+6)%7; d.setHours(0,0,0,0); d.setDate(d.getDate()-day); return d; }
  function dayTs(offset){ const d=weekStart(); d.setDate(d.getDate()+offset); return d.getTime(); }
  S.weekStart = weekStart; S.dayTs = dayTs;
  const thisWeek = ()=> MKR.util.isoDate(weekStart());

  S.SHIFTS = [
    {id:'s1', staffId:'u_amy',   day:0, start:'09:00', end:'15:00', slot:'am'},
    {id:'s2', staffId:'u_kevin', day:0, start:'15:00', end:'22:00', slot:'pm'},
    {id:'s3', staffId:'u_amy',   day:1, start:'09:00', end:'15:00', slot:'am'},
    {id:'s4', staffId:'u_leo',   day:1, start:'15:00', end:'22:00', slot:'pm'},
    {id:'s5', staffId:'u_amy',   day:2, start:'09:00', end:'15:00', slot:'am'},
    {id:'s6', staffId:'u_kevin', day:2, start:'15:00', end:'22:00', slot:'pm'},
    {id:'s7', staffId:'u_leo',   day:3, start:'10:00', end:'18:00', slot:'am'},
    {id:'s8', staffId:'u_amy',   day:4, start:'09:00', end:'15:00', slot:'am'},
    {id:'s9', staffId:'u_kevin', day:5, start:'12:00', end:'22:00', slot:'pm'},
    {id:'s10',staffId:'u_leo',   day:5, start:'12:00', end:'22:00', slot:'pm'},
  ];

  /* A device seeded before the history existed has the demo shelf but no
     dockets and no counts, so every derived page reads empty. Fill it in once —
     and only for the demo venue: the guard is the demo item ids plus an empty
     purchases table, neither of which can be true of a real kitchen. */
  async function backfillHistory(){
    if(await MKR.db.meta('seededHistory')) return;
    const inv = await MKR.db.getAll('inventory');
    const isDemo = inv.some(i=>i.id==='itm_beef') && inv.some(i=>i.id==='itm_chop');
    const purch = await MKR.db.getAll('purchases');
    if(!isDemo || purch.length){ await MKR.db.meta('seededHistory', true); return; }
    const hist = S.buildHistory();
    for(const s of S.SUPPLIERS) await MKR.db.put('suppliers', {...s, kitchenId:'k_main'});
    for(const p of hist.purchases)  await MKR.db.put('purchases', p);
    for(const t of hist.stocktakes) await MKR.db.put('stocktakes', t);
    for(const v of hist.deliveries) await MKR.db.put('deliveries', v);
    for(const x of S.INVENTORY){
      const h = hist.priceHistory[x.id]||[];
      await MKR.db.put('inventory', {id:x.id,
        qty: hist.level[x.id] != null ? hist.level[x.id] : x.qty,
        price: h.length ? h[h.length-1].price : x.price,
        priceHistory: h.length ? h : undefined, lastCountAt: hist.lastCount});
    }
    await MKR.db.meta('seededHistory', true);
  }

  S.ensure = async function(){
    const seeded = await MKR.db.meta('seeded');
    if(seeded) return await backfillHistory();      // already seeded → only top up what's missing
    const wk = thisWeek();
    const hist = S.buildHistory();
    for(const k of S.KITCHENS) await MKR.db.put('kitchens', {...k});
    for(const u of S.USERS) await MKR.db.put('users', {...u, kitchenId:'k_main'});
    for(const s of S.SHIFTS) await MKR.db.put('shifts', {...s, week:wk});
    for(const x of S.SUPPLIERS) await MKR.db.put('suppliers', {...x, kitchenId:'k_main'});
    for(const x of S.INVENTORY) await MKR.db.put('inventory', {...x,
      qty: hist.level[x.id] != null ? hist.level[x.id] : x.qty,
      price: (hist.priceHistory[x.id]||[]).length ? hist.priceHistory[x.id].slice(-1)[0].price : x.price,
      priceHistory: (hist.priceHistory[x.id]||[]).length ? hist.priceHistory[x.id]
                    : [{ts:Date.now()-14*864e5, price:x.price, note:'opening price'}],
      lastCountAt: hist.lastCount, kitchenId:'k_main'});
    for(const p of hist.purchases)  await MKR.db.put('purchases', p);
    for(const t of hist.stocktakes) await MKR.db.put('stocktakes', t);
    for(const v of hist.deliveries) await MKR.db.put('deliveries', v);
    for(const x of S.SOPS) await MKR.db.put('sops', {...x, updatedAt:Date.now(), kitchenId:'k_main'});
    await MKR.db.meta('settings', S.SETTINGS);
    await MKR.db.meta('brand', {name:S.SETTINGS.shopName, avatar:null});
    // Today's task instances
    for(let i=0;i<S.SETTINGS.dailyTasks.length;i++)
      await MKR.db.put('tasks', {id:'t'+i, name:S.SETTINGS.dailyTasks[i], date:MKR.util.todayISO(), done:false, photo:null, by:null});
    // One sample audit entry
    await MKR.db.put('audit', {id:'a0', ts:Date.now()-3600e3, action:'stock.count', desc:'Opening stocktake', actor:'Maria Lopez', actorRole:'manager', frozen:true});
    await MKR.db.meta('seeded', true);
    await MKR.db.meta('seededHistory', true);
  };

  // One-tap reset (debug)
  S.reset = async function(){
    await MKR.db.wipe();
    location.reload();
  };

  MKR.seed = S;
})();
