/* ===== Shared UI: inline SVG icon set =====
   One consistent, crisp icon set used across the sidebar/mobile nav (and anywhere
   else that wants an icon) instead of emoji. Stroke-based, inherits currentColor.
*/
window.MKR = window.MKR || {};
(function(){
  const P = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    bars:'<path d="M3 20h18"/><path d="M7 20v-5M12 20v-9M17 20v-13"/>',
    users:'<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5.5M22 20a6 6 0 0 0-4.5-5.8"/>',
    building:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
    star:'<path d="M12 3l2.7 5.5 6 .9-4.35 4.2 1 6L12 17l-5.35 2.6 1-6L3.3 9.4l6-.9z"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 7L4.6 7a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 3.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    calendar:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    calcheck:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M9 15l2 2 4-4"/>',
    userplus:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M18 8v6M21 11h-6"/>',
    utensils:'<path d="M5 3v6a2 2 0 0 0 4 0V3M7 9v12"/><path d="M16.5 3C15 3 14 5 14 7.5s1 4 2.5 4V21"/>',
    checksq:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/>',
    repeat:'<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
    receipt:'<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    monitor:'<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    qr:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M20.5 14v.01M17 20.5h.01M20.5 17.5v3.5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    idcard:'<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2.2"/><path d="M4.5 16a3.5 3.5 0 0 1 7 0M14.5 9.5h5M14.5 13.5h5"/>',
    inbox:'<path d="M3 13h5l1 3h6l1-3h5"/><path d="M5 5h14l2 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
    avg:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.6 9.4a2.4 2 0 0 1 4.8 0c0 1.3-1.2 1.7-2.4 2.2s-2.4 1-2.4 2.4a2.4 2 0 0 0 4.8 0"/>',
    trend:'<path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v6h-6"/>',
    award:'<circle cx="12" cy="8" r="5"/><path d="M8.5 12.5 7 21l5-3 5 3-1.5-8.5"/>',
    ticket:'<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4 2 2 0 0 1 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
    gift:'<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8v13"/><path d="M12 8S10.5 3 8 4.5 9.5 8 12 8zM12 8s1.5-5 4-3.5S14.5 8 12 8z"/>',
    book:'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M19 17H6a2 2 0 0 0-2 2"/><path d="M8 7h7M8 11h7"/>',
    sparkle:'<path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15l-1.8-4.2L5.5 9l4.7-1.3z"/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>',
    check:'<path d="M4 12.5l5 5L20 6"/>',
    checkcircle:'<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
    truck:'<path d="M3 6h11v9H3z"/><path d="M14 9h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    box:'<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    warning:'<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    download:'<path d="M12 3v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    refresh:'<path d="M4 12a8 8 0 0 1 13.7-5.6L21 9"/><path d="M21 4v5h-5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L3 15"/><path d="M3 20v-5h5"/>',
    dot:'<circle cx="12" cy="12" r="3.5"/>',
    pan:'<circle cx="10" cy="13" r="6.5"/><path d="M16.2 10.5L22 8"/><path d="M8 6.5V4M12 6.5V3.5"/>',
    chef:'<path d="M6 13.6a3.6 3.6 0 0 1 1.2-7A4.1 4.1 0 0 1 12 4.3a4.1 4.1 0 0 1 4.8 2.3 3.6 3.6 0 0 1 1.2 7"/><path d="M6 13.6h12V19a1.4 1.4 0 0 1-1.4 1.4H7.4A1.4 1.4 0 0 1 6 19z"/><path d="M9.4 16.8h5.2"/>',
    dots:'<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    home:'<path d="M3 10.5L12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-6h5v6"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    minus:'<path d="M5 12h14"/>',
    logout:'<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
    key:'<circle cx="8" cy="14" r="4"/><path d="M11 11l8-8M17 5l2 2M15 7l2 2"/>',
    moon:'<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    cup:'<path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h2.5a2.5 2.5 0 0 1 0 5H16"/><path d="M6 2v3M10 2v3M14 2v3"/>',
    phone:'<path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3z"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z"/>',
    camera:'<path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
    printer:'<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    trash:'<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    pencil:'<path d="M4 20l4-1 10-10-3-3L5 16z"/><path d="M14.5 5.5l3 3"/>',
    link:'<path d="M10 13a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 5.8"/><path d="M14 11a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 19.7l1.5-1.5"/>',
    shuffle:'<path d="M17 3l3 3-3 3"/><path d="M17 15l3 3-3 3"/><path d="M4 6h4l8 12h4"/><path d="M4 18h4l2-3"/><path d="M14 9l2-3h4"/>',
    lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    frown:'<circle cx="12" cy="12" r="9"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><path d="M9 9.5v.01M15 9.5v.01"/>',
    send:'<path d="M4 12l16-8-6 8 6 8z"/>',
    chevleft:'<path d="M15 5l-7 7 7 7"/>',
    chevright:'<path d="M9 5l7 7-7 7"/>',
  };

  // nav id -> icon name
  const NAV = {
    dashboard:'grid', assistant:'sparkle', alerts:'bell', audit:'shield',
    team:'users', performance:'award', branches:'building', feedback:'star',
    switch:'eye', settings:'gear', setup:'gear',
    schedule:'calendar', myshifts:'calcheck', my:'calcheck', hire:'userplus',
    tasks:'checksq', swaps:'repeat', bookings:'book',
    availability:'clock', market:'repeat', me:'idcard',
    stock:'inbox', deliveries:'receipt', training:'book',
    applications:'inbox', restaurants:'building',
  };

  // nav id -> colour tone. One module, one colour, everywhere it appears — the
  // home block, the room on the floor and the page header all read the same, so
  // the owner learns "the blue one is the cold room" instead of reading labels.
  // Tone names map to the --<tone> / --<tone>-soft pairs in the stylesheet.
  const TONE = {
    stock:'blue', deliveries:'amber', tasks:'green', x_tasks:'green',
    schedule:'violet', x_schedule:'violet', myshifts:'violet', my:'violet',
    availability:'violet', swaps:'violet', team:'violet', hire:'green',
    training:'teal', bookings:'teal', branches:'teal',
    alerts:'red', audit:'ink', settings:'ink', setup:'ink', switch:'ink',
    assistant:'accent', dashboard:'accent', performance:'amber',
    feedback:'amber', market:'amber', me:'ink', applications:'blue',
    restaurants:'teal',
  };
  const tone = (id)=> TONE[id] || 'ink';

  // Where a badge count sits on the only three-step scale this app uses:
  // green nothing to do · amber worth a look · red do it today.
  function tier(n, urgent){
    if(!n) return 'ok';
    return urgent ? 'hot' : 'warm';
  }

  function icon(name, cls=''){
    const inner = P[name] || P.dot;
    return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  }
  function navIcon(id){ return icon(NAV[id] || 'dot'); }

  // Render a scannable QR for `text` (uses the qrcode-generator CDN lib when
  // available; falls back to a styled code box for offline file:// use).
  function qr(text, size=132){
    const t = String(text||'');
    if(window.qrcode){
      try{
        const q = window.qrcode(0, 'M'); q.addData(t); q.make();
        const n = q.getModuleCount(), cell = Math.max(2, Math.floor(size/(n+2))), m = cell, dim = n*cell + m*2;
        let rects='';
        for(let r=0;r<n;r++) for(let col=0;col<n;col++) if(q.isDark(r,col)) rects+=`<rect x="${m+col*cell}" y="${m+r*cell}" width="${cell}" height="${cell}"/>`;
        return `<svg class="qr" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" role="img" aria-label="QR ${t}"><rect width="${dim}" height="${dim}" fill="#fff"/><g fill="#111">${rects}</g></svg>`;
      }catch(e){}
    }
    return `<div class="qr-fallback" style="width:${size}px;height:${size}px"><span>${t}</span></div>`;
  }

  // ---------- theme ----------
  // Three states, not two: 'auto' follows the OS (the default and what most
  // people want), 'light' / 'dark' are the venue overruling it — a phone that
  // lives on a bright pass is easier to read in light whatever the clock says.
  // The CSS does the work; this only writes the attribute the CSS keys off.
  // Applied again in index.html before first paint so there is no flash.
  const TKEY = 'mkr_theme';
  function theme(next){
    if(next === undefined){
      try{ return localStorage.getItem(TKEY) || 'auto'; }catch(e){ return 'auto'; }
    }
    try{ localStorage.setItem(TKEY, next); }catch(e){}
    // index.html owns the resolve (it has to run before first paint anyway);
    // re-run it rather than keeping a second copy of the same three lines.
    if(window.__mkrTheme) window.__mkrTheme();
    return next;
  }

  // Every <details class="omenu"> closes when you pick something out of it, and
  // when you click away from it. Delegated once here rather than re-bound at
  // each call site — a menu that stays open behind the modal it just opened is
  // the same bug however many pages grow one.
  document.addEventListener('click', (e)=>{
    const inside = e.target.closest ? e.target.closest('.omenu') : null;
    document.querySelectorAll('.omenu[open]').forEach(d=>{
      if(d !== inside || e.target.closest('.omenu-pop')) d.open = false;
    });
  });
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape') document.querySelectorAll('.omenu[open]').forEach(d=> d.open = false);
  });

  MKR.ui = { icon, navIcon, qr, tone, tier, theme, ICONS:P, NAV, TONE };
})();
