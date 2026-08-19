/* ===== Feature switches + role permissions =====
   The owner controls each module (on/off, which roles can use it) in Settings.
   The config is stored in app_meta.settings.modules (synced to the cloud, so it
   is consistent across devices).
   Navigation and pages use MKR.features.can(key, role) to decide visibility.
*/
window.MKR = window.MKR || {};
(function(){
  const DEFAULTS = {
    schedule: {label:'AI rostering',        on:true, roles:['manager']},
    // The owner is on these two by default. An owner who cannot see today's
    // checklist has to ring the manager to find out whether the fridges were
    // checked, and an owner who cannot add a starter has to wait for someone
    // else to be free on the morning that starter turns up. Both are still
    // switchable off per venue, like everything else here.
    hire:     {label:'One-Click Add Users', on:true, roles:['owner','manager']},
    tasks:    {label:'Daily tasks & cleaning', on:true, roles:['owner','manager','staff']},
    swaps:    {label:'Swap / SOS approval', on:true, roles:['manager']},
    market:   {label:'Staff swap market',   on:true, roles:['staff']},
    availability:{label:'Availability (staff & manager)',on:true, roles:['staff','manager']},
    bookings: {label:'Bookings & queue',    on:true, roles:['manager']},
    stock:    {label:'Stock, costs & suppliers', on:true, roles:['owner','manager']},
    // Counting is a separate switch from Stock on purpose: it is the one part of
    // stock a venue may want its floor staff doing, and it shows no money.
    count:    {label:'Stock count (staff can count)', on:true, roles:['owner','manager','staff']},
    deliveries:{label:'Delivery confirmation',   on:true, roles:['owner','manager','staff']},
    training: {label:'Training & SOP',      on:true, roles:['owner','manager','staff']},
    notify:   {label:'Notifications & nudges',on:true, roles:['owner','manager','staff']},
    // Owner-side pages the owner can hide from their own sidebar (core pages —
    // dashboard / alerts / audit / settings — stay on).
    o_assistant:  {label:'Owner · AI Assistant button',  on:true, roles:['owner']},
    o_team:       {label:'Owner · Team',          on:true, roles:['owner']},
    o_performance:{label:'Owner · Performance',   on:true, roles:['owner']},
    o_branches:   {label:'Owner · Branches',      on:true, roles:['owner']},
    o_feedback:   {label:'Owner · Feedback',      on:true, roles:['owner']},
    // Optional Australian add-ons. OFF by default — they only surface a referral
    // link out to our partner lawyer / to VEVO; the app itself never judges.
    au_awards:    {label:'AU awards help (optional · partner lawyer)', on:false, roles:['owner','manager']},
    au_workrights:{label:'Work rights check (optional · VEVO)',        on:false, roles:['owner','manager']},
  };
  // Legacy keys from the POS / customer / payroll era. Any saved config still
  // carrying them is ignored so removed modules can never come back on.
  const RETIRED = ['pos','kds','menu','blinddrop','qrorder','inventory','compliance',
                   'o_analytics','o_labor','o_membership'];

  let _cache=null;

  // Each kitchen (tenant) carries its own `modules` selection; we fall back to the
  // legacy global app_meta.settings.modules and then to DEFAULTS.
  async function savedModules(){
    const sess = MKR.auth && MKR.auth.current && MKR.auth.current();
    if(sess && sess.kitchenId){
      try{ const k = await MKR.db.get('kitchens', sess.kitchenId); if(k && k.modules && Object.keys(k.modules).length) return k.modules; }catch(e){}
    }
    const s = (await MKR.db.meta('settings')) || {};
    return s.modules || {};
  }

  const F = {
    DEFAULTS, RETIRED,
    async load(){
      const saved = await savedModules();
      RETIRED.forEach(k=>{ delete saved[k]; });
      const merged = {};
      // Keep on/roles from saved data, but ALWAYS take the label from DEFAULTS
      // (the English source) so the i18n layer controls the displayed language.
      // Older data stored hardcoded Chinese labels — ignore them.
      for(const k in DEFAULTS) merged[k] = {...DEFAULTS[k], ...(saved[k]||{}), label:DEFAULTS[k].label};
      _cache = merged; return merged;
    },
    get(){ return _cache || DEFAULTS; },
    config(key){ return (_cache||DEFAULTS)[key]; },
    // Whether the module is open to a given role (owner / superadmin see every enabled module)
    can(key, role){
      const m = (_cache||DEFAULTS)[key];
      if(!m) return true;                 // unregistered modules are always allowed
      if(role==='owner'||role==='superadmin') return !!m.on;
      return !!m.on && (!role || (m.roles||[]).includes(role));
    },
    // Persist onto the current kitchen (per-tenant); fall back to global settings.
    async save(modules, kitchenId){
      const sess = MKR.auth && MKR.auth.current && MKR.auth.current();
      const kid = kitchenId || (sess && sess.kitchenId);
      if(kid){ await MKR.db.put('kitchens', {id:kid, modules}); }
      else { const s=(await MKR.db.meta('settings'))||{}; s.modules=modules; await MKR.db.meta('settings', s); }
      _cache = null; await F.load();
    }
  };
  MKR.features = F;
})();
