/* ===== Boot ===== */
(async function(){
  MKR.net.init();
  MKR.notify.registerSW();          // register the Service Worker (PWA + offline shell + background push)

  // Restore the login session (real Supabase session)
  const sess = await MKR.auth.restore();
  if(sess){
    // Same reasoning as the sign-in path: the shell reads local data, so a slow
    // cloud pull must not hold the first paint. Wait briefly for it — a device
    // that has been away needs the catch-up — then carry on and let it finish.
    await Promise.race([
      (async()=>{ try{ await MKR.db.initSync(); await MKR.seed.ensure(); }catch(e){} })(),
      new Promise(r=>setTimeout(r, 3000)),
    ]);
    try{ await MKR.features.load(); }catch(e){}   // load feature switches / permissions
    // Applied before the first render, so the app never paints in the default
    // orange and then snaps to the venue's colour a beat later.
    try{ await MKR.brand.load(); }catch(e){}
    MKR.notify.start(sess.role);      // notifications / shift nudges
  }

  // Offboard cut-off takes effect instantly: set to offboarded → forced sign-out
  MKR.db.on('users', async ()=>{
    const s = MKR.auth.current(); if(!s) return;
    const u = await MKR.db.get('users', s.id);
    if(u && u.offboarded){ alert('Your account has been offboarded — access has been cut off.'); MKR.auth.logout(); }
  });

  if(!location.hash) location.hash = sess ? `#/${sess.role}/${MKR.portals[sess.role].home}` : '#/login';
  MKR.router.render();

  try{ if(MKR.assistant) MKR.assistant.mount(); }catch(e){}   // floating help assistant

  window.MKR_RESET = MKR.seed.reset;
})();
