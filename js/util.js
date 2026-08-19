/* ===== Utility helpers ===== */
window.MKR = window.MKR || {};
(function(){
  const U = {};

  U.money = (n)=> '$' + (Number(n)||0).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2});
  U.money0 = (n)=> '$' + Math.round(Number(n)||0).toLocaleString('en-AU');
  // Round to 2 decimal places (e.g. 41.93333333 -> 41.93)
  U.round2 = (n)=> Math.round((Number(n)||0)*100)/100;
  // Format a number of hours with two decimals (e.g. "41.93 h")
  U.hrs = (n)=> U.round2(n).toFixed(2)+' h';
  U.uid = (p='id')=> p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  U.now = ()=> Date.now();
  // Local calendar date as YYYY-MM-DD. Never toISOString() on a local date —
  // that is UTC, and east of Greenwich (Melbourne is UTC+10/+11) it hands back
  // YESTERDAY all morning: the task list, the roster header and the week key
  // all slip a day until 10am.
  U.isoDate = (d=Date.now())=>{ const x=new Date(d);
    return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10); };
  U.todayISO = ()=> U.isoDate();

  // Length of a "HH:MM" → "HH:MM" shift, in hours (never negative).
  U.shiftHours = (start,end)=>{
    const [sh,sm]=String(start||'0:0').split(':').map(Number);
    const [eh,em]=String(end||'0:0').split(':').map(Number);
    return Math.max(0, ((eh*60+em)-(sh*60+sm))/60);
  };
  // "HH:MM" → minutes from midnight
  U.toMin = (t)=>{ const p=String(t||'0:0').split(':'); return (+p[0])*60+(+(p[1]||0)); };

  U.fmtTime = (ts)=>{ const d=new Date(ts); return d.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',hour12:false}); };
  U.fmtDate = (ts)=>{ const d=new Date(ts); return d.toLocaleDateString('en-AU',{day:'numeric',month:'short'}); };
  U.fmtDateTime = (ts)=> U.fmtDate(ts)+' '+U.fmtTime(ts);
  U.ago = (ts)=>{ const s=Math.floor((Date.now()-ts)/1000);
    if(s<60) return s+'s ago'; if(s<3600) return Math.floor(s/60)+'m ago';
    if(s<86400) return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago'; };
  U.mins = (ts)=> Math.floor((Date.now()-ts)/60000);

  // escape
  U.esc = (s)=> String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // create element from html string -> first element
  U.el = (html)=>{ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; };
  U.qs = (sel,root=document)=> root.querySelector(sel);
  U.qsa = (sel,root=document)=> Array.from(root.querySelectorAll(sel));

  U.initials = (name='')=>{ name=name.trim(); if(/[一-龥]/.test(name)) return name.slice(-2); // CJK names: keep last two chars
    const parts=name.split(/\s+/).filter(Boolean);
    if(parts.length>=2) return (parts[0][0]+parts[1][0]).toUpperCase();
    return name.slice(0,2).toUpperCase()||'?'; };

  // toast
  U.toast = (msg,type='')=>{
    let wrap = U.qs('.toast-wrap'); if(!wrap){ wrap=U.el('<div class="toast-wrap"></div>'); document.body.appendChild(wrap); }
    const t = U.el(`<div class="toast ${type}">${U.esc(msg)}</div>`); wrap.appendChild(t);
    setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),300); }, 2600);
  };

  // modal — returns {close}; body is html string or node; opts.actions = [{label,class,onClick(close)}]
  U.modal = (title, body, opts={})=>{
    const back = U.el(`<div class="modal-back"></div>`);
    const m = U.el(`<div class="modal">
      <div class="modal-head"><h3>${U.esc(title)}</h3><button class="x" aria-label="Close">×</button></div>
      <div class="modal-body"></div></div>`);
    const bodyEl = U.qs('.modal-body', m);
    // Long forms (a complaint, a delivery docket) need the room; everything else
    // reads better narrow, so this is opt-in rather than a width for all of them.
    if(opts.wide) m.classList.add('wide');
    if(typeof body==='string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
    if(opts.actions){
      const row = U.el(`<div class="row mt16" style="justify-content:flex-end"></div>`);
      opts.actions.forEach(a=>{
        const b=U.el(`<button class="btn ${a.class||'btn-ghost'}">${U.esc(a.label)}</button>`);
        b.onclick=()=>a.onClick(close); row.appendChild(b);
      });
      bodyEl.appendChild(row);
    }
    back.appendChild(m);
    // Lock the page behind the sheet. Without this a phone scrolls the list
    // underneath while the modal sits still, and closing it lands you somewhere
    // else entirely. Counted by "is any modal still open", so stacked modals
    // (a docket photo over a docket) release the lock only on the last one.
    function close(){ back.style.opacity='0'; back.style.transition='opacity .2s';
      setTimeout(()=>{ back.remove(); if(!U.qs('.modal-back')) document.body.classList.remove('modal-open'); },200); }
    U.qs('.x',m).onclick=close;
    back.onclick=(e)=>{ if(e.target===back && opts.dismissable!==false) close(); };
    document.body.appendChild(back);
    document.body.classList.add('modal-open');
    return { close, el:m, body:bodyEl };
  };

  // CSV helpers — build a CSV string from rows (array of arrays) and trigger a
  // browser download. A UTF-8 BOM is prepended so Excel opens Chinese correctly.
  U.csv = (rows)=> rows.map(r=>r.map(cell=>{
    const s = String(cell==null?'':cell);
    return /[",\n\r]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(',')).join('\r\n');
  U.download = (filename, text, mime='text/csv;charset=utf-8')=>{
    const blob = new Blob(['﻿'+text], {type:mime});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
  };
  U.downloadCSV = (filename, rows)=> U.download(filename, U.csv(rows));

  // Print an HTML fragment on its own (used for receipts). Isolates the node in
  // a print-only layer so the rest of the app is hidden while printing.
  U.printHTML = (html)=>{
    let area = U.qs('#print-area');
    if(!area){ area = U.el('<div id="print-area"></div>'); document.body.appendChild(area); }
    area.innerHTML = html;
    try{ if(MKR.i18n && MKR.i18n.apply) MKR.i18n.apply(area); }catch(e){}  // translate before printing
    const after = ()=>{ area.innerHTML=''; window.removeEventListener('afterprint', after); };
    window.addEventListener('afterprint', after);
    window.print();
  };

  // Read a photo off a phone camera and shrink it before it ever reaches the
  // database. A modern handset shoots 3–5 MB; base64 adds a third on top, and
  // these rows sync to the cloud — a few weeks of docket photos would fill the
  // browser's storage quota and start throwing on write.
  //
  // A docket only has to stay READABLE, not printable: 1600px on the long edge
  // at JPEG 0.7 keeps every number legible and lands around 200–400 KB.
  U.IMG_MAX = 1600;
  U.readImage = (file, cb, max)=>{
    if(!file) return;
    const MAX = max || U.IMG_MAX;
    const r = new FileReader();
    r.onload = ()=>{
      const img = new Image();
      // A file the browser can't decode (HEIC on some Androids, a PDF renamed
      // .jpg) still has to reach the user rather than vanishing — keep the
      // original in that case, it's rare and correctness beats the saving.
      img.onerror = ()=> cb(r.result);
      img.onload = ()=>{
        const scale = Math.min(1, MAX/Math.max(img.width, img.height));
        if(scale === 1 && r.result.length < 400e3) return cb(r.result);
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width*scale); cv.height = Math.round(img.height*scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        // A PNG stays a PNG: logos are the one thing uploaded here with
        // transparency, and re-encoding those as JPEG paints the background in.
        const type = /^data:image\/png/i.test(r.result) ? 'image/png' : 'image/jpeg';
        try{ cb(cv.toDataURL(type, 0.7)); }catch(e){ cb(r.result); }
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  };

  // ---------- signature pad ----------
  // Drawn with a pointer, because the person signing is holding the tablet and
  // a typed name is not a signature. Kept as a small PNG on the record so the
  // form can be printed back looking like the paper it replaces. Used by the
  // complaint form and by the delivery docket — one pad, one set of quirks.
  // Markup: <div class="sigpad"><canvas></canvas></div>
  U.signaturePad = (el)=>{
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
  };

  // simple confirm
  U.confirm = (title, msg, opts={})=> new Promise(res=>{
    U.modal(title, `<p class="muted">${U.esc(msg)}</p>`, { actions:[
      {label:opts.cancel||'Cancel', class:'btn-ghost', onClick:(c)=>{ c(); res(false); }},
      {label:opts.ok||'Confirm', class:opts.danger?'btn-danger':'btn-dark', onClick:(c)=>{ c(); res(true); }},
    ]});
  });

  MKR.util = U;
})();
