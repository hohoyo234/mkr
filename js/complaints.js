/* ===== Customer complaints =====
   The paper form that lives by the till, done properly.

   A complaint is not a review. A review is a rating someone leaves afterwards;
   a complaint is a thing that happened to a person who is standing in front of
   you now, and the venue owes them an answer before they leave. So this records
   what the paper form records — who, how to reach them, when it happened, what
   happened, who took it, and their signature — and then the one thing paper
   can't do: it files itself where the owner will actually see it.

   The three levels and their remedies are the venue's own policy, editable in
   Settings, because the wording is a commitment the venue makes and not
   something an app should hardcode. What ships is a sensible default.

   NOTE ON THE SOURCE FORM: the version this was built from opened with "our
   policy allows us to exchange for the same value dish but will not refund you
   money" and then offered a full refund at all three levels. The levels are
   treated as the real policy, since that is what staff actually do at the
   counter, and the opening paragraph is left editable so the venue can settle
   its own wording.

   Table: customer_feedback, rows with type:'complaint'
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  function kid(){ const s=MKR.auth&&MKR.auth.current&&MKR.auth.current(); return (s&&s.kitchenId)||'k_main'; }
  function me(){ const s=MKR.auth&&MKR.auth.current&&MKR.auth.current(); return (s&&s.name)||''; }

  // The default policy. Deliberately phrased as what the venue will DO, not as
  // what the customer may claim — staff read this out under pressure.
  const DEFAULT_LEVELS = [
    { id:1, label:'Food not up to standard',
      examples:'too cold, too salty, too hard, not what they expected',
      remedy:"We're very sorry. Exchange for something of the same value, or a full or partial refund depending on how much was already eaten." },
    { id:2, label:'Food not clean, undercooked, or the wrong order',
      examples:'meat still raw, chicken served instead of pork, foreign object',
      remedy:"We're very sorry. Full refund, and a free bottle of drink of their choice." },
    { id:3, label:'Serious — escalate to the manager',
      examples:'anything the customer wants taken further',
      remedy:"We're very sorry. Full refund, and a free bottle of drink of their choice. The manager will call them back if they want that." },
  ];

  const DEFAULT_INTRO =
    'We want to treat our customers with respect, and we always want to hear what you have to say about our service. '+
    "We're very sorry if we haven't got it right today. Telling us what happened is what lets us fix it.";

  async function policy(){
    try{
      const k = await MKR.db.get('kitchens', kid());
      return {
        intro:  (k && k.complaintIntro)  || DEFAULT_INTRO,
        levels: (k && k.complaintLevels && k.complaintLevels.length) ? k.complaintLevels : DEFAULT_LEVELS,
      };
    }catch(e){ return {intro:DEFAULT_INTRO, levels:DEFAULT_LEVELS}; }
  }
  async function savePolicy({intro, levels}){
    await MKR.db.put('kitchens', {id:kid(), complaintIntro:intro, complaintLevels:levels});
  }

  async function all(){
    return (await MKR.db.getAll('customer_feedback'))
      .filter(f=>f.type==='complaint' && (f.kitchenId||'k_main')===kid())
      .sort((a,b)=>(b.ts||0)-(a.ts||0));
  }

  const STATUS = {
    open:     {label:'Open',      pill:'warn',  ic:'dot'},
    resolved: {label:'Resolved',  pill:'ok',    ic:'checkcircle'},
    escalated:{label:'With the manager', pill:'danger', ic:'trend'},
  };

  async function save(rec){
    const row = await MKR.db.put('customer_feedback', {
      id: rec.id || U.uid('cmp'), type:'complaint', ts: rec.ts || Date.now(),
      kitchenId: kid(), ...rec,
    });
    // A level 3 is the customer asking for someone above the counter. Raising an
    // alert is the difference between that request reaching the owner and it
    // sitting in a list nobody opens until Friday.
    if(String(rec.level)==='3' && rec.status!=='resolved'){
      try{
        await MKR.alerts.raise({ key:'complaint-'+row.id, level:'red', type:'complaint',
          title:'Serious complaint', desc:`${rec.customerName||'A customer'} asked for it to go to the manager${rec.contact?' — '+rec.contact:''}`});
      }catch(e){}
    }
    try{ await MKR.audit.log({action:'complaint.log', desc:`Level ${rec.level} complaint taken by ${rec.staffName||me()}`}); }catch(e){}
    return row;
  }

  // ---------- signature pad ----------
  // Drawn with a pointer, because the person signing is holding the tablet and
  // a typed name is not a signature. Kept as a small PNG on the record so the
  // form can be printed back looking like the paper it replaces.
  function signaturePad(el){
    const cv = el.querySelector('canvas');
    const ctx = cv.getContext('2d');
    const ratio = window.devicePixelRatio || 1;

    // Sizing on a timer does not work here: the pad is inside a modal that
    // animates in, so at the next tick the box still measures 0 wide and the
    // canvas gets set to 1px — every stroke then lands outside it and the
    // signature saves blank, which looks signed and is not. A ResizeObserver
    // fits the canvas whenever the box actually HAS a width, whenever that is.
    const style = ()=>{
      ctx.setTransform(1,0,0,1,0,0); ctx.scale(ratio, ratio);
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = (getComputedStyle(document.body).getPropertyValue('--ink')||'').trim() || '#211E1B';
    };
    let w = 0, h = 0;
    const fit = ()=>{
      const r = cv.getBoundingClientRect();
      const nw = Math.round(r.width), nh = Math.round(r.height);
      if(nw<1 || nh<1 || (nw===w && nh===h)) return;
      // Resizing a canvas wipes it, so anything already drawn is carried over.
      const prev = (w && h) ? cv.toDataURL('image/png') : null;
      w = nw; h = nh;
      cv.width = nw*ratio; cv.height = nh*ratio;
      style();
      if(prev){ const img = new Image(); img.onload = ()=> ctx.drawImage(img, 0, 0, nw, nh); img.src = prev; }
    };
    // Three chances, because no single one of them is reliable everywhere:
    // the synchronous call works when the pad is already laid out, the frame
    // callback catches the usual case of a modal that is still animating in,
    // and the observer catches a later resize (rotating a tablet). Some
    // embedded webviews never fire the observer at all, so pointerdown below
    // fits one last time — by then the box certainly has a size, because a
    // finger just landed on it.
    fit();
    requestAnimationFrame(fit);
    if(window.ResizeObserver) new ResizeObserver(fit).observe(cv);

    let drawing = false;
    const pos = (e)=>{ const r=cv.getBoundingClientRect(); return [e.clientX-r.left, e.clientY-r.top]; };
    cv.addEventListener('pointerdown', e=>{
      if(!w) fit();
      drawing = true;
      try{ cv.setPointerCapture(e.pointerId); }catch(err){}
      const [x,y]=pos(e); ctx.beginPath(); ctx.moveTo(x,y);
      // A tap with no drag is still a mark, and people do sign with dots.
      ctx.lineTo(x+0.01,y); ctx.stroke();
    });
    cv.addEventListener('pointermove', e=>{ if(!drawing) return; const [x,y]=pos(e); ctx.lineTo(x,y); ctx.stroke(); });
    cv.addEventListener('pointerup',  ()=>{ drawing=false; });
    cv.addEventListener('pointerleave',()=>{ drawing=false; });

    // Whether it was signed is answered by the pixels, not by whether a pointer
    // touched the pad. Touching it and drawing nothing is not a signature, and
    // storing a blank PNG as one puts "signed" on a record that isn't.
    const hasInk = ()=>{
      if(!cv.width || !cv.height) return false;
      const px = ctx.getImageData(0,0,cv.width,cv.height).data;
      for(let i=3;i<px.length;i+=4) if(px[i]>0) return true;
      return false;
    };
    return {
      clear(){ ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cv.width,cv.height); style(); },
      signed: hasInk,
      data(){ return hasInk() ? cv.toDataURL('image/png') : null; },
    };
  }

  // ---------- the form ----------
  async function form(existing, after){
    const p = await policy();
    const r = existing || {};
    const now = new Date();
    const localDT = (ts)=>{ const d=new Date(ts); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,16); };

    const wrap = U.el(`<div>
      <div class="disclaimer" style="margin-top:0"><span>${MKR.ui.icon('users')}</span><div id="cf_intro">${U.esc(p.intro)}</div></div>

      <div class="section-title mt16">About you</div>
      <div class="row"><div class="field grow"><label>Your name</label>
          <input class="input" id="cf_name" value="${U.esc(r.customerName||'')}" placeholder="so we know who to apologise to"></div>
        <div class="field grow"><label>Phone or email we can reach you on</label>
          <input class="input" id="cf_contact" value="${U.esc(r.contact||'')}" placeholder="04XX XXX XXX or name@example.com"></div></div>

      <div class="section-title mt16">What happened</div>
      <div class="row"><div class="field grow"><label>When it happened</label>
          <input class="input" id="cf_when" type="datetime-local" value="${U.esc(r.incidentAt||localDT(r.ts||now.getTime()))}"></div>
        <div class="field grow"><label>Table / order (optional)</label>
          <input class="input" id="cf_table" value="${U.esc(r.table||'')}" placeholder="e.g. table 6"></div></div>
      <div class="field"><label>What went wrong</label>
        <textarea class="input" id="cf_reason" rows="4" placeholder="in the customer's own words where possible">${U.esc(r.reason||'')}</textarea></div>

      <div class="section-title mt16">How we're fixing it</div>
      <div class="field"><label>Which level</label>
        <select class="input" id="cf_level">
          <option value="">— choose —</option>
          ${p.levels.map(l=>`<option value="${l.id}" ${String(r.level)===String(l.id)?'selected':''}>Level ${l.id} · ${U.esc(l.label)}</option>`).join('')}
        </select></div>
      <div class="disclaimer" id="cf_remedy" hidden><span>${MKR.ui.icon('sparkle')}</span><div></div></div>
      <div class="field"><label>What was actually done</label>
        <input class="input" id="cf_action" value="${U.esc(r.actionTaken||'')}" placeholder="e.g. replaced the dish and refunded the drink"></div>

      <div class="section-title mt16">Signing off</div>
      <div class="row"><div class="field grow"><label>Staff member who took this</label>
          <input class="input" id="cf_staff" value="${U.esc(r.staffName||me())}"></div>
        <div class="field grow"><label>Did we handle it with enough care?</label>
          <select class="input" id="cf_care">
            <option value="">— they didn't say —</option>
            <option value="yes" ${r.care==='yes'?'selected':''}>Yes</option>
            <option value="no"  ${r.care==='no'?'selected':''}>No</option>
          </select></div></div>

      <div class="field"><label>Customer signature</label>
        <div class="sigpad" id="cf_sig">${r.signature?`<img src="${r.signature}" alt="signature">`:'<canvas></canvas>'}</div>
        <div class="row gap6" style="margin-top:6px">
          <button class="btn btn-ghost btn-sm" id="cf_sigClear" type="button">Clear</button>
          <span class="faint" style="font-size:12px;align-self:center">Sign with a finger or the mouse — optional, but it is what makes this a record</span>
        </div></div>

      <div class="disclaimer mt12"><span>${MKR.ui.icon('lock')}</span>Kept for the venue only. Nothing here is posted anywhere, and the contact details are used to call this person back, nothing else.</div>
    </div>`);

    let pad = null;
    if(!r.signature) pad = signaturePad(U.qs('#cf_sig',wrap));
    const clearBtn = U.qs('#cf_sigClear',wrap);
    clearBtn.onclick = ()=>{
      if(pad) return pad.clear();
      // Re-signing replaces a stored image, so the canvas has to come back.
      U.qs('#cf_sig',wrap).innerHTML = '<canvas></canvas>';
      pad = signaturePad(U.qs('#cf_sig',wrap));
    };

    const lvl = U.qs('#cf_level',wrap), rem = U.qs('#cf_remedy',wrap);
    const syncLevel = ()=>{
      const l = p.levels.find(x=>String(x.id)===lvl.value);
      rem.hidden = !l;
      if(l) rem.querySelector('div').innerHTML =
        `<b>Level ${l.id} · ${U.esc(l.label)}</b><div class="faint" style="font-size:12.5px">${U.esc(l.examples)}</div><div style="margin-top:4px">${U.esc(l.remedy)}</div>`;
    };
    lvl.onchange = syncLevel; syncLevel();

    U.modal(existing?'Complaint':'New complaint', wrap, {wide:true, actions:[
      {label:'Save', class:'btn-dark', onClick:async(close)=>{
        const reason = U.qs('#cf_reason',wrap).value.trim();
        if(!reason){ U.toast('What went wrong? That is the part that matters','red'); return; }
        const level = lvl.value;
        if(!level){ U.toast('Pick a level so the remedy is on the record','red'); return; }
        await save({
          id: r.id,
          customerName: U.qs('#cf_name',wrap).value.trim(),
          contact:      U.qs('#cf_contact',wrap).value.trim(),
          incidentAt:   U.qs('#cf_when',wrap).value,
          table:        U.qs('#cf_table',wrap).value.trim(),
          reason, level,
          actionTaken:  U.qs('#cf_action',wrap).value.trim(),
          staffName:    U.qs('#cf_staff',wrap).value.trim() || me(),
          care:         U.qs('#cf_care',wrap).value,
          signature:    pad ? pad.data() : (r.signature||null),
          status:       r.status || (String(level)==='3' ? 'escalated' : 'open'),
        });
        close(); U.toast('Complaint recorded','green'); if(after) after();
      }},
    ]});
  }

  MKR.complaints = { all, save, form, policy, savePolicy, STATUS, DEFAULT_LEVELS, DEFAULT_INTRO };
})();
