/* ===== Optional Australian add-ons — referral only =====
   This app deliberately does NOT interpret awards, calculate pay, judge work
   rights, or talk to any government system. Two optional modules exist purely to
   hand the owner off to someone who does:

     · au_awards      → our partner employment lawyer (link is owner-configurable)
     · au_workrights  → VEVO, the Department of Home Affairs' own visa checker

   Both are OFF by default (see features.js) and neither ever blocks anything in
   the app. Turning them on adds a button; that button opens a new tab.
*/
window.MKR = window.MKR || {};
(function(){
  const U = ()=>MKR.util;

  // VEVO is the official Home Affairs service — the owner checks work rights
  // there, with the visa holder's consent. We never store or verify visa data.
  const VEVO_URL = 'https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/check-conditions-online';
  const DEFAULT_LAWYER = { name:'Partner employment lawyer', url:'', email:'', phone:'' };

  async function lawyer(){
    try{
      const s = (await MKR.db.meta('settings')) || {};
      return {...DEFAULT_LAWYER, ...(s.partnerLawyer||{})};
    }catch(e){ return {...DEFAULT_LAWYER}; }
  }
  async function saveLawyer(p){
    const s = (await MKR.db.meta('settings')) || {};
    s.partnerLawyer = {...DEFAULT_LAWYER, ...(s.partnerLawyer||{}), ...p};
    await MKR.db.meta('settings', s);
    return s.partnerLawyer;
  }

  function open(url){
    if(!url) return false;
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }

  // Owner/manager taps "Awards help" → confirm, then hand off to the lawyer.
  async function openAwardsHelp(){
    const u = U(); const L = await lawyer();
    u.modal('Australian awards — get proper advice', `
      <p class="muted" style="font-size:14px">My Kitchen Rules does not calculate award rates, penalty rates or entitlements, and nothing in this app is legal advice. If you need a real answer, we hand you to a qualified employment lawyer.</p>
      <div class="list mt12">
        <div class="li"><div class="ds-li-ic">${MKR.ui.icon('shield')}</div><div class="meta"><b>${u.esc(L.name||'Partner employment lawyer')}</b><span>${u.esc(L.email||L.phone||'Contact details not set yet')}</span></div></div>
      </div>
      ${L.url?'':'<div class="alert amber mt12"><span>ℹ️</span><div>No partner link is configured yet — the owner can add one in <b>Settings → Optional Australian add-ons</b>.</div></div>'}`,
      {actions:[
        {label:'Close', class:'btn-ghost', onClick:c=>c()},
        ...(L.url?[{label:'Open lawyer →', class:'btn-dark', onClick:async(c)=>{
          open(L.url); try{ await MKR.audit.log({action:'partner.lawyer', desc:'Opened partner lawyer referral'}); }catch(e){}
          c();
        }}]:[])
      ]});
  }

  // Owner/manager taps "Check work rights" → straight out to VEVO.
  async function openWorkRights(){
    const u = U();
    u.modal('Check work rights (VEVO)', `
      <p class="muted" style="font-size:14px">Work rights are checked on the Department of Home Affairs' own VEVO service — not here. You'll need the person's consent plus their passport / visa details.</p>
      <div class="alert info mt12"><span>${MKR.ui.icon('idcard')}</span><div>This app stores no visa data and applies no visa hour limits. Rostering only shows you warnings; what you do with them is your call.</div></div>`,
      {actions:[
        {label:'Close', class:'btn-ghost', onClick:c=>c()},
        {label:'Open VEVO →', class:'btn-dark', onClick:async(c)=>{
          open(VEVO_URL); try{ await MKR.audit.log({action:'partner.vevo', desc:'Opened VEVO work-rights check'}); }catch(e){}
          c();
        }}
      ]});
  }

  // Buttons the owner/manager pages drop in — render nothing when the optional
  // module is switched off.
  function buttons(role){
    const can = (k)=> MKR.features && MKR.features.can(k, role);
    const b=[];
    if(can('au_awards'))     b.push(`<button class="btn btn-ghost btn-sm" data-partner="awards">${MKR.ui.icon('shield')} Awards help</button>`);
    if(can('au_workrights')) b.push(`<button class="btn btn-ghost btn-sm" data-partner="vevo">${MKR.ui.icon('idcard')} Check work rights</button>`);
    return b.join('');
  }
  function bind(root){
    (MKR.util.qsa('[data-partner]', root)||[]).forEach(btn=>{
      btn.onclick = ()=> btn.dataset.partner==='awards' ? openAwardsHelp() : openWorkRights();
    });
  }

  MKR.partners = { VEVO_URL, lawyer, saveLawyer, openAwardsHelp, openWorkRights, buttons, bind };
})();
