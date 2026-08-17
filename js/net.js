/* ===== Resilience layer: offline guard / status light / refresh guard / silent sync ===== */
window.MKR = window.MKR || {};
(function(){
  let dirty=false;

  const Net = {
    online: navigator.onLine,
    setDirty(v){ dirty=!!v; },
    isDirty(){ return dirty; },
    pending(){ return (MKR.db && MKR.db._pending) || 0; },

    render(){
      const light=MKR.util.qs('#netlight'); if(!light) return;
      const cloud = MKR.db && MKR.db.cloud && MKR.db.cloud();
      const pend=Net.pending();
      if(!Net.online){
        light.className='netlight offline';
        light.innerHTML=`<span class="lamp"></span>Offline-safe mode${pend?` · ${pend} queued`:''}`;
      } else if(pend>0){
        light.className='netlight syncing';
        // "Syncing · 108" gave no clue what 108 counted. It counts changes.
        light.innerHTML=`<span class="lamp"></span>Saving ${pend} change${pend===1?'':'s'}…`;
      } else {
        light.className='netlight online';
        light.innerHTML=`<span class="lamp"></span>${cloud?'Cloud connected':'Connected (local)'}`;
      }
      // Under 560px the pill collapses to a bare dot (font-size:0), which leaves
      // a status indicator with no name at all — carry the words in the label.
      const text = light.textContent.trim();
      light.setAttribute('role','status');
      light.setAttribute('aria-label', text);
      light.title = text;
      const bar=MKR.util.qs('#offbar'); if(bar) bar.classList.toggle('hidden', Net.online);
    },

    async flush(){ if(MKR.db && MKR.db.flush) await MKR.db.flush(); Net.render(); },

    init(){
      window.addEventListener('online', async ()=>{ Net.online=true; Net.render(); MKR.util.toast('Back online — syncing in the background…'); await Net.flush(); if(Net.pending()===0) MKR.util.toast('All data synced to the cloud','green'); });
      window.addEventListener('offline',()=>{ Net.online=false; Net.render(); MKR.util.toast('Network lost · switched to offline-safe mode — keep working','amber'); });
      window.addEventListener('beforeunload',(e)=>{ if(dirty){ e.preventDefault(); e.returnValue='You have unsaved data. Reloading may lose it — leave anyway?'; return e.returnValue; } });
      Net.render();
    }
  };
  MKR.net=Net;
})();
