/* ===== Initial demo data ===== */
window.MKR = window.MKR || {};
(function(){
  const S = {};

  // Three-portal demo accounts (PROFILE DATA ONLY — no passwords here).
  // Credentials live in Supabase Auth; create the matching Auth users + profiles
  // rows via the dashboard or MKR.setup.createDemoAccounts(). See SECURITY.md.
  // `skills` is what the AI roster plans around — see js/roster.js.
  S.USERS = [
    {id:'u_boss', role:'owner',   name:'James Carter', username:'boss', status:'active', emoji:'👑'},
    {id:'u_mgr',  role:'manager', name:'Maria Lopez',  username:'mgr',  status:'active', emoji:'📋',
      skills:['open','close','lead','floor'], availability:{0:'all',1:'all',2:'all',3:'all',4:'all',5:'off',6:'off'}},
    // Staff
    {id:'u_amy',  role:'staff', name:'Amy',  username:'amy',  status:'active', emoji:'🧑‍🍳',
      age:22, employment:'casual', position:'Front of House', onboarded:true,
      skills:['open','floor','coffee'], availability:{0:'am',1:'am',2:'am',3:'am',4:'am',5:'all',6:'off'}},
    {id:'u_kevin',role:'staff', name:'Kevin',username:'kevin',status:'active', emoji:'🧑‍🍳',
      age:31, employment:'parttime', position:'Kitchen', onboarded:true,
      skills:['kitchen','close'], availability:{0:'pm',1:'off',2:'pm',3:'pm',4:'pm',5:'pm',6:'all'}},
    {id:'u_leo',  role:'staff', name:'Leo',  username:'leo',  status:'active', emoji:'🧑‍🍳',
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
     operatingHours:{open:'09:00', close:'22:00'}, createdAt:Date.now()-90*24*3600e3},
  ];

  S.SUPPLIERS = [
    {id:'sup_veg',  name:'Vic Fresh Produce', contact:'Tony',   phone:'0412 000 111', email:'orders@vicfresh.au',   note:'Delivers Tue & Fri before 9am'},
    {id:'sup_meat', name:'Southbank Meats',   contact:'Dana',   phone:'0413 222 333', email:'sales@sbmeats.au',     note:'Order by 3pm for next-day'},
    {id:'sup_dry',  name:'Asia Wholesale',    contact:'Mr Lim', phone:'0455 444 555', email:'lim@asiawholesale.au', note:'Chopsticks, containers, dry goods — cheapest in bulk'},
  ];

  // Raw materials plus the tools that quietly run out. Two kinds: perishable
  // (goes off, has a shelf life) and non-perishable (doesn't).
  S.INVENTORY = [
    {id:'itm_beef',   name:'Beef brisket',  kind:'perishable', unit:'kg',    qty:12,   safety:4,   price:18.90, shelfLifeDays:4,  leadTimeDays:1, supplierId:'sup_meat'},
    {id:'itm_chick',  name:'Chicken thigh', kind:'perishable', unit:'kg',    qty:9,    safety:4,   price:11.50, shelfLifeDays:3,  leadTimeDays:1, supplierId:'sup_meat'},
    {id:'itm_noodle', name:'Rice noodles',  kind:'perishable', unit:'kg',    qty:15,   safety:5,   price:4.20,  shelfLifeDays:14, leadTimeDays:2, supplierId:'sup_dry'},
    {id:'itm_tom',    name:'Tomatoes',      kind:'perishable', unit:'kg',    qty:6,    safety:3,   price:5.80,  shelfLifeDays:5,  leadTimeDays:2, supplierId:'sup_veg'},
    {id:'itm_herb',   name:'Fresh herbs',   kind:'perishable', unit:'bunch', qty:10,   safety:6,   price:2.40,  shelfLifeDays:3,  leadTimeDays:2, supplierId:'sup_veg'},
    {id:'itm_oil',    name:'Cooking oil',   kind:'durable',    unit:'L',     qty:22,   safety:8,   price:3.60,  leadTimeDays:3, supplierId:'sup_dry'},
    {id:'itm_chop',   name:'Chopsticks',    kind:'durable',    unit:'pairs', qty:1400, safety:500, price:0.035, leadTimeDays:5, supplierId:'sup_dry'},
    {id:'itm_box',    name:'Takeaway containers', kind:'durable', unit:'pcs', qty:320, safety:150, price:0.22,  leadTimeDays:5, supplierId:'sup_dry'},
    {id:'itm_glove',  name:'Food-prep gloves',    kind:'durable', unit:'box', qty:4,   safety:3,   price:9.90,  leadTimeDays:3, supplierId:'sup_dry'},
  ];

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
  const thisWeek = ()=> new Date(weekStart()).toISOString().slice(0,10);

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

  S.ensure = async function(){
    const seeded = await MKR.db.meta('seeded');
    if(seeded) return;                              // a device already seeded the cloud → skip
    const wk = thisWeek();
    for(const k of S.KITCHENS) await MKR.db.put('kitchens', {...k});
    for(const u of S.USERS) await MKR.db.put('users', {...u, kitchenId:'k_main'});
    for(const s of S.SHIFTS) await MKR.db.put('shifts', {...s, week:wk});
    for(const x of S.SUPPLIERS) await MKR.db.put('suppliers', {...x, kitchenId:'k_main'});
    for(const x of S.INVENTORY) await MKR.db.put('inventory',
      {...x, priceHistory:[{ts:Date.now()-14*864e5, price:x.price, note:'opening price'}], kitchenId:'k_main'});
    for(const x of S.SOPS) await MKR.db.put('sops', {...x, updatedAt:Date.now(), kitchenId:'k_main'});
    await MKR.db.meta('settings', S.SETTINGS);
    await MKR.db.meta('brand', {name:S.SETTINGS.shopName, avatar:null});
    // Today's task instances
    for(let i=0;i<S.SETTINGS.dailyTasks.length;i++)
      await MKR.db.put('tasks', {id:'t'+i, name:S.SETTINGS.dailyTasks[i], date:MKR.util.todayISO(), done:false, photo:null, by:null});
    // One sample audit entry
    await MKR.db.put('audit', {id:'a0', ts:Date.now()-3600e3, action:'stock.count', desc:'Opening stocktake', actor:'Maria Lopez', actorRole:'manager', frozen:true});
    await MKR.db.meta('seeded', true);
  };

  // One-tap reset (debug)
  S.reset = async function(){
    await MKR.db.wipe();
    location.reload();
  };

  MKR.seed = S;
})();
