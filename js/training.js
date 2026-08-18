/* ===== Staff training & SOPs =====
   The "how we do it here" library, plus the training tasks that make sure people
   have actually read it.

   · SOP        — a titled, step-by-step procedure the venue owns (sops table)
   · Training   — one SOP assigned to one person with a due date (trainings table)

   Staff open a training task, read the steps and sign it off with their name;
   that sign-off is what the owner sees. Nothing here is submitted to anyone
   outside the venue.

   · Certificate — a ticket with an expiry date and a photo of it (certs table)

   RSA, Food Safety Supervisor, first aid: the things an inspector or Fair Work
   asks to see, standing in the venue, now. The expiry machinery was already here
   for training due dates, so certificates reuse it: a date, a countdown, and a
   photo that can be pulled up on one screen. The app records and reminds. It
   does not verify a certificate with the issuer and does not decide whether the
   venue is compliant.
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  const DAY = 864e5;
  function kid(){ const s=MKR.auth&&MKR.auth.current&&MKR.auth.current(); return (s&&s.kitchenId)||'k_main'; }
  function me(){ return MKR.auth&&MKR.auth.current&&MKR.auth.current(); }

  const CATS = ['Food safety','Cleaning','Opening & closing','Equipment','Service','Allergens','Other'];

  async function sops(){ return (await MKR.db.getAll('sops')).filter(s=>(s.kitchenId||'k_main')===kid() && !s.archived)
    .sort((a,b)=> String(a.category).localeCompare(String(b.category)) || String(a.title).localeCompare(String(b.title))); }
  async function trainings(){ return (await MKR.db.getAll('trainings')).filter(t=>(t.kitchenId||'k_main')===kid()); }
  async function mine(){ const s=me(); if(!s) return []; return (await trainings()).filter(t=>t.staffId===s.id); }

  const isOverdue = (t)=> t.status!=='done' && t.dueDate && t.dueDate < U.todayISO();
  const dueSoon   = (t)=> t.status!=='done' && t.dueDate && t.dueDate >= U.todayISO() && new Date(t.dueDate) - Date.now() < 3*DAY;

  async function saveSop(p){
    const row = {category:'Other', steps:[], kitchenId:kid(), ...p};
    if(!row.id) row.id = U.uid('sop');
    row.version = (row.version||0) + 1;
    row.updatedAt = Date.now();
    return MKR.db.put('sops', row);
  }
  async function assign(sopId, staffIds, dueDate){
    const list = await sops(); const sop = list.find(s=>s.id===sopId); if(!sop) return 0;
    let n=0;
    for(const staffId of staffIds){
      await MKR.db.put('trainings', {id:U.uid('trn'), sopId, title:sop.title, staffId, dueDate:dueDate||null,
        status:'assigned', assignedAt:Date.now(), kitchenId:kid()});
      n++;
    }
    try{ await MKR.audit.log({action:'training.assign', desc:`Assigned "${sop.title}" to ${n} staff`}); }catch(e){}
    return n;
  }
  async function complete(t, signedName){
    await MKR.db.put('trainings', {id:t.id, status:'done', completedAt:Date.now(), signedBy:signedName});
    try{ await MKR.audit.log({action:'training.complete', desc:`Completed training "${t.title}"`}); }catch(e){}
  }

  // ---------------- Certificates ----------------
  /* An expiring RSA is not a training gap, it is a licence to trade problem, and
     it turns up at the worst moment: an inspector at the pass asking to see one.
     So this is a flat list with photos and dates, sortable to the soonest, and
     nothing clever on top of it.

     What it does NOT do: verify anything with the issuing body, decide whether
     the venue is compliant, or stop anyone working. It holds the date the owner
     or the staff member typed and counts down to it. */
  const CERT_TYPES = {
    rsa:       'RSA — Responsible Service of Alcohol',
    fss:       'Food Safety Supervisor',
    food:      'Food handler certificate',
    firstaid:  'First aid / CPR',
    whitecard: 'White card',
    other:     'Other',
  };
  const CERT_SOON = 60;                                   // days out where it stops being "fine"

  async function certs(){ return (await MKR.db.getAll('certs')).filter(c=>(c.kitchenId||'k_main')===kid()); }
  async function saveCert(p){
    const row = {kitchenId:kid(), ...p};
    if(!row.id) row.id = U.uid('cert');
    const saved = await MKR.db.put('certs', row);
    try{ await MKR.audit.log({action:'training.assign', desc:`Recorded certificate "${certLabel(saved)}"`}); }catch(e){}
    return saved;
  }
  const certLabel = (c)=> c.type==='other' ? (c.other||'Certificate') : (CERT_TYPES[c.type]||c.type);

  // Days until it lapses — negative once it has. No expiry is a valid answer
  // (a food handler certificate often has none), and reads as such.
  function certDays(c){
    if(!c || !c.expiry) return null;
    return Math.round((new Date(c.expiry+'T00:00:00') - new Date(U.todayISO()+'T00:00:00'))/DAY);
  }
  function certState(c){
    const d = certDays(c);
    if(d==null) return {k:'none',  pill:'ghost',  text:'No expiry'};
    if(d < 0)   return {k:'expired', pill:'danger', text:`Expired ${-d} day${-d===1?'':'s'} ago`};
    if(d <= CERT_SOON) return {k:'soon', pill:'warn', text:`${d} day${d===1?'':'s'} left`};
    return {k:'ok', pill:'ok', text:`Expires ${c.expiry}`};
  }

  // Everything with an expiry date against a person's name, in one list: the
  // certificates recorded here plus the visa the staff member entered during
  // onboarding. The visa row is READ-ONLY on purpose — it is their record, they
  // typed it, and an owner quietly editing someone's visa expiry is not a thing
  // this app is going to make easy.
  async function certList(users){
    const rows = (await certs()).map(c=>({...c, label:certLabel(c), own:true}));
    let ob = []; try{ ob = await MKR.db.getAll('onboarding'); }catch(e){}
    for(const o of ob){
      if(o.workRights!=='visa' || !o.visaExpiry) continue;
      if(!users.some(u=>u.id===o.userId)) continue;
      rows.push({id:'ob_'+o.id, staffId:o.userId, type:'workrights', own:false, photo:o.visaDoc||null,
                 label:`Work rights — visa${o.visaSubclass?' subclass '+o.visaSubclass:''}`, expiry:o.visaExpiry});
    }
    return rows.sort((a,b)=> String(a.expiry||'9999').localeCompare(String(b.expiry||'9999')));
  }

  // Raised where the list is read, the same way roster warnings are: no
  // background sweep to keep alive, and the alert can never disagree with the
  // screen that produced it.
  async function certAlerts(rows, nameOf){
    for(const r of rows){
      const st = certState(r);
      if(st.k!=='expired' && st.k!=='soon') continue;
      try{
        await MKR.alerts.raise({
          key:`cert-${r.id}-${r.expiry}`,
          level: st.k==='expired' ? 'red' : 'amber',
          type:'training',
          title: st.k==='expired' ? 'Certificate expired' : 'Certificate expiring',
          desc: `${nameOf(r.staffId)} · ${r.label} · ${st.text.toLowerCase()}`,
        });
      }catch(e){}
    }
  }

  function certModal(cert, users, after, lockStaffId){
    const isNew = !cert; cert = cert || {type:'rsa'};
    let img = cert.photo || null;
    const wrap = U.el(`<div>
      ${lockStaffId ? '' : `<div class="field"><label>Whose is it</label><select class="input" id="ct_who">
        ${users.map(u=>`<option value="${u.id}" ${cert.staffId===u.id?'selected':''}>${U.esc(u.name)}</option>`).join('')}</select></div>`}
      <div class="field"><label>What it is</label><select class="input" id="ct_type">
        ${Object.entries(CERT_TYPES).map(([k,v])=>`<option value="${k}" ${cert.type===k?'selected':''}>${v}</option>`).join('')}</select></div>
      <div class="field" id="ct_otherwrap" style="display:none"><label>Name it</label>
        <input class="input" id="ct_other" value="${U.esc(cert.other||'')}" placeholder="e.g. Forklift licence"></div>
      <div class="row">
        <div class="field grow"><label>Certificate number (optional)</label>
          <input class="input" id="ct_no" value="${U.esc(cert.number||'')}" placeholder="as printed on it"></div>
        <div class="field grow"><label>Expires</label>
          <input class="input" id="ct_exp" type="date" value="${U.esc(cert.expiry||'')}"></div>
      </div>
      <div class="field"><label>Photo of the certificate</label>
        <label class="img-drop"><div class="img-preview" id="ct_prev">${img?`<img src="${img}">`:`<span>${MKR.ui.icon('camera')} Tap to upload</span>`}</div>
          <input type="file" id="ct_file" accept="image/*" hidden></label></div>
      <div class="disclaimer"><span>${MKR.ui.icon('book')}</span>Recorded so it can be produced on the spot and so you get told before it lapses. Nothing here is verified with the issuing body, and the app makes no judgement about whether the venue is compliant.</div>
    </div>`);
    const typeSel = U.qs('#ct_type',wrap);
    const syncType = ()=>{ U.qs('#ct_otherwrap',wrap).style.display = typeSel.value==='other' ? '' : 'none'; };
    typeSel.onchange = syncType; syncType();
    U.qs('#ct_file',wrap).onchange = (e)=> U.readImage(e.target.files[0], d=>{ img=d; U.qs('#ct_prev',wrap).innerHTML=`<img src="${d}">`; });

    const actions = [{label:'Save', class:'btn-dark', onClick:async(close)=>{
      const staffId = lockStaffId || U.qs('#ct_who',wrap).value;
      if(!staffId){ U.toast('Whose certificate is it?','red'); return; }
      const type = typeSel.value;
      const other = U.qs('#ct_other',wrap).value.trim();
      if(type==='other' && !other){ U.toast('Give it a name','red'); return; }
      await saveCert({id:cert.id, staffId, type, other,
        number:U.qs('#ct_no',wrap).value.trim(), expiry:U.qs('#ct_exp',wrap).value||'', photo:img});
      close(); U.toast(isNew?'Certificate recorded':'Certificate updated','green'); if(after) after();
    }}];
    if(!isNew && cert.id) actions.unshift({label:'Remove', class:'btn-ghost', onClick:async(close)=>{
      if(!(await U.confirm('Remove certificate', `Take "${certLabel(cert)}" off the record?`, {ok:'Remove', danger:true}))) return;
      await MKR.db.remove('certs', cert.id); close(); U.toast('Removed','amber'); if(after) after();
    }});
    U.modal(isNew?'Add a certificate':'Certificate', wrap, {actions});
  }

  // One card, one screen, soonest first — what you hold up when someone from the
  // council is standing in your kitchen asking.
  function certCard(rows, nameOf, opts){
    opts = opts || {};
    const bad = rows.filter(r=>certState(r).k==='expired').length;
    const soon = rows.filter(r=>certState(r).k==='soon').length;
    return `<div class="card pad20 mt16" id="certCard">
      <div class="row center between wrap" style="gap:10px;margin-bottom:12px">
        <div class="section-title" style="padding:0">${MKR.ui.icon('award')} ${opts.title||'Certificates & work rights'}</div>
        <div class="row gap8 center">
          ${bad?`<span class="pill danger">${bad} expired</span>`:''}
          ${soon?`<span class="pill warn">${soon} expiring</span>`:''}
          <button class="btn btn-dark btn-sm" id="certAdd">${MKR.ui.icon('plus')} Add</button>
        </div>
      </div>
      ${rows.length ? `<div class="list">${rows.map(r=>{
        const st = certState(r);
        return `<div class="li${r.own?' clickable':''}"${r.own?` data-cert="${r.id}"`:''}>
          <div class="ds-li-ic sev-${st.k==='expired'?'red':(st.k==='soon'?'amber':'info')}">${MKR.ui.icon('award')}</div>
          <div class="meta"><b>${opts.hideName?'':U.esc(nameOf(r.staffId))+' · '}<span>${U.esc(r.label)}</span></b>
            <span>${r.number?U.esc(r.number)+' · ':''}${r.expiry?U.esc(r.expiry):'no expiry recorded'}${r.own?'':' · <span>from their onboarding</span>'}</span></div>
          <div class="row gap6 center">
            <span class="pill ${st.pill}">${st.text}</span>
            ${r.photo?`<button class="btn btn-ghost btn-sm" data-certpic="${r.id}">${MKR.ui.icon('camera')}</button>`:''}
          </div></div>`;
      }).join('')}</div>`
      : `<div class="empty"><div class="em">${MKR.ui.icon('award')}</div><p>${opts.empty||'Nothing recorded yet. RSA, Food Safety Supervisor and work rights are the three an inspector asks for.'}</p></div>`}
      <div class="disclaimer mt12"><span>${MKR.ui.icon('book')}</span>Dates and photos as recorded by the venue and its staff. Nothing here is checked with an issuing body, and the app makes no judgement about whether anyone is compliant or entitled to work.</div>
    </div>`;
  }
  function bindCertCard(c, rows, users, after, lockStaffId){
    const add = U.qs('#certAdd', c); if(add) add.onclick = ()=> certModal(null, users, after, lockStaffId);
    U.qsa('[data-cert]', c).forEach(b=> b.onclick = (e)=>{
      if(e.target.closest('[data-certpic]')) return;
      certModal(rows.find(r=>r.id===b.dataset.cert), users, after, lockStaffId);
    });
    U.qsa('[data-certpic]', c).forEach(b=> b.onclick = (e)=>{
      e.stopPropagation();
      const r = rows.find(x=>x.id===b.dataset.certpic);
      if(r && r.photo) U.modal(r.label, `<img src="${r.photo}" style="width:100%;border-radius:12px">`);
    });
  }

  // ---------------- Owner / manager: library + who's done what ----------------
  async function renderManage(c){
    const [list, trs, users] = await Promise.all([sops(), trainings(),
      MKR.db.getAll('users').then(u=>u.filter(x=>(x.role==='staff'||x.role==='manager') && !x.offboarded && (x.kitchenId||'k_main')===kid()))]);
    const nameOf = id=>{ const u=users.find(x=>x.id===id); return u?u.name:'—'; };
    const outstanding = trs.filter(t=>t.status!=='done');
    const overdue = outstanding.filter(isOverdue);
    const certRows = await certList(users);
    const lapsed = certRows.filter(r=>certState(r).k==='expired').length;
    const lapsing = certRows.filter(r=>certState(r).k==='soon').length;
    certAlerts(certRows, nameOf);

    c.innerHTML = `
      <div class="section-head"><div><h2>Training &amp; SOPs</h2><p>Write it once, assign it, see who's actually read it</p></div>
        <div class="row gap8 wrap"><button class="btn btn-ghost btn-sm" id="trAssign">${MKR.ui.icon('users')} Assign training</button>
          <button class="btn btn-dark btn-sm" id="trNew">${MKR.ui.icon('plus')} New SOP</button></div></div>

      <div class="statline">
        <span class="statcell"><b>${list.length}</b><i>SOPs</i></span>
        <span class="statcell"><b>${outstanding.length}</b><i>outstanding</i></span>
        <span class="statcell"${overdue.length?' style="color:var(--red)"':''}><b>${overdue.length}</b><i>overdue</i></span>
        <span class="statcell"${lapsed?' style="color:var(--red)"':''}><b>${lapsed+lapsing}</b><i>certificates to renew</i></span>
      </div>

      ${certCard(certRows, nameOf)}

      <div class="grid g2 mt16" style="align-items:start">
        <div class="card pad20">
          <div class="section-title">${MKR.ui.icon('book')} SOP library</div>
          ${list.length? `<div class="list">${list.map(s=>`
            <div class="li clickable" data-sop="${s.id}"><div class="ds-li-ic">${MKR.ui.icon('book')}</div>
              <div class="meta"><b>${U.esc(s.title)}</b><span>${U.esc(s.category)} · ${(s.steps||[]).length} step${(s.steps||[]).length===1?'':'s'} · v${s.version||1}</span></div>
              <span class="faint">›</span></div>`).join('')}</div>`
            : `<div class="empty"><div class="em">${MKR.ui.icon('book')}</div><p>No SOPs yet. Start with the three things new starters always get wrong.</p></div>`}
        </div>
        <div class="card pad20">
          <div class="section-title">${MKR.ui.icon('users')} Training status</div>
          ${users.length? `<div class="list">${users.map(u=>{
            const t=trs.filter(x=>x.staffId===u.id);
            const done=t.filter(x=>x.status==='done').length;
            const od=t.filter(isOverdue).length;
            return `<div class="li"><div class="ava">${u.emoji||U.initials(u.name)}</div>
              <div class="meta"><b>${U.esc(u.name)}</b><span>${U.esc(u.position||MKR.auth.roleName(u.role))}</span></div>
              <span class="pill ${od?'danger':(t.length&&done===t.length?'ok':'ghost')}">${done}/${t.length||0} done${od?` · ${od} overdue`:''}</span></div>`;
          }).join('')}</div>`
            : `<div class="empty"><div class="em">${MKR.ui.icon('users')}</div><p>No team members yet</p></div>`}
        </div>
      </div>

      <div class="card pad20 mt16">
        <div class="section-title">${MKR.ui.icon('checksq')} Assigned training</div>
        ${trs.length? `<div class="tablewrap"><table class="dtable">
          <thead><tr><th>Person</th><th>SOP</th><th>Due</th><th>Status</th><th>Signed off</th><th></th></tr></thead>
          <tbody>${trs.slice().sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||''))).map(t=>`
            <tr><td><b>${U.esc(nameOf(t.staffId))}</b></td><td>${U.esc(t.title)}</td>
              <td>${t.dueDate?U.esc(t.dueDate):'<span class="faint">—</span>'}</td>
              <td>${t.status==='done'?'<span class="pill ok">Completed</span>':(isOverdue(t)?'<span class="pill danger">Overdue</span>':(dueSoon(t)?'<span class="pill warn">Due soon</span>':'<span class="pill ghost">Assigned</span>'))}</td>
              <td>${t.completedAt?`${U.esc(t.signedBy||'')} <span class="faint">${U.fmtDate(t.completedAt)}</span>`:'<span class="faint">—</span>'}</td>
              <td class="num"><button class="btn btn-ghost btn-sm" data-trdel="${t.id}">Remove</button></td></tr>`).join('')}</tbody>
        </table></div>` : `<div class="empty"><div class="em">${MKR.ui.icon('checksq')}</div><p>Nothing assigned yet</p></div>`}
      </div>`;

    bindCertCard(c, certRows, users, ()=>renderManage(c));
    U.qs('#trNew',c).onclick    = ()=> sopModal(null, ()=>renderManage(c));
    U.qs('#trAssign',c).onclick = ()=> assignModal(list, users, ()=>renderManage(c));
    U.qsa('[data-sop]',c).forEach(b=> b.onclick=()=> sopModal(list.find(x=>x.id===b.dataset.sop), ()=>renderManage(c)));
    U.qsa('[data-trdel]',c).forEach(b=> b.onclick=async()=>{
      if(!(await U.confirm('Remove training','Take this training task off their list?',{ok:'Remove',danger:true}))) return;
      await MKR.db.remove('trainings', b.dataset.trdel); renderManage(c);
    });
  }

  function sopModal(s, after){
    const isNew=!s; s=s||{category:'Other', steps:[]};
    const wrap = U.el(`<div>
      <div class="field"><label>Title</label><input class="input" id="sp_t" value="${U.esc(s.title||'')}" placeholder="e.g. Closing the fryer safely"></div>
      <div class="field"><label>Category</label><select class="input" id="sp_c">${CATS.map(x=>`<option ${s.category===x?'selected':''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label>Why it matters (one line)</label><input class="input" id="sp_w" value="${U.esc(s.why||'')}" placeholder="e.g. Hot oil burns are the most common injury in this kitchen"></div>
      <div class="field"><label>Steps — one per line</label><textarea class="input" id="sp_s" rows="8" placeholder="Turn the fryer off at the wall&#10;Let the oil cool for 30 minutes&#10;…">${U.esc((s.steps||[]).join('\n'))}</textarea></div>
    </div>`);
    const actions=[{label:'Save', class:'btn-dark', onClick:async(close)=>{
      const title=U.qs('#sp_t',wrap).value.trim(); if(!title){ U.toast('Give it a title','red'); return; }
      const steps=U.qs('#sp_s',wrap).value.split('\n').map(x=>x.trim()).filter(Boolean);
      await saveSop({id:s.id, title, category:U.qs('#sp_c',wrap).value, why:U.qs('#sp_w',wrap).value.trim(), steps});
      close(); U.toast(isNew?'SOP created':'SOP updated','green'); after();
    }}];
    if(!isNew) actions.unshift({label:'Delete', class:'btn-ghost', onClick:async(close)=>{
      if(!(await U.confirm('Delete SOP',`Remove "${s.title}"? Training already signed off stays on the record.`,{ok:'Delete',danger:true}))) return;
      await MKR.db.put('sops',{id:s.id, archived:true}); close(); U.toast('Deleted','amber'); after();
    }});
    U.modal(isNew?'New SOP':'Edit SOP', wrap, {actions});
  }

  function assignModal(list, users, after){
    if(!list.length){ U.toast('Write an SOP first','amber'); return; }
    if(!users.length){ U.toast('No team members yet','amber'); return; }
    const due = U.isoDate(Date.now()+7*DAY);
    const wrap = U.el(`<div>
      <div class="field"><label>SOP</label><select class="input" id="as_s">${list.map(s=>`<option value="${s.id}">${U.esc(s.category)} · ${U.esc(s.title)}</option>`).join('')}</select></div>
      <div class="field"><label>Due date</label><input class="input" id="as_d" type="date" value="${due}"></div>
      <div class="field"><label>Who</label><div id="as_who">${users.map(u=>`
        <label class="onb-item" style="cursor:pointer"><input type="checkbox" data-who="${u.id}" style="width:20px;height:20px">
          <div class="grow"><b>${U.esc(u.name)}</b><div class="faint" style="font-size:12px">${U.esc(u.position||MKR.auth.roleName(u.role))}</div></div></label>`).join('')}</div></div>
    </div>`);
    U.modal('Assign training', wrap, {actions:[
      {label:'Cancel', class:'btn-ghost', onClick:c=>c()},
      {label:'Assign', class:'btn-dark', onClick:async(close)=>{
        const who = U.qsa('[data-who]',wrap).filter(i=>i.checked).map(i=>i.dataset.who);
        if(!who.length){ U.toast('Pick at least one person','red'); return; }
        const n = await assign(U.qs('#as_s',wrap).value, who, U.qs('#as_d',wrap).value||null);
        close(); U.toast(`Assigned to ${n} ${n===1?'person':'people'}`,'green'); after();
      }}
    ]});
  }

  // ---------------- Staff: my training ----------------
  async function renderMine(c){
    const [ts, list] = await Promise.all([mine(), sops()]);
    const sess = me() || {};
    const myCerts = (await certList([sess])).filter(r=>r.staffId===sess.id);
    const open = ts.filter(t=>t.status!=='done').sort((a,b)=>String(a.dueDate||'zz').localeCompare(String(b.dueDate||'zz')));
    const done = ts.filter(t=>t.status==='done').sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));

    c.innerHTML = `
      <div class="section-head"><div><h2>My training</h2><p>Read it, then sign it off — takes a couple of minutes</p></div></div>
      <div class="card pad20">
        <div class="section-title">${MKR.ui.icon('checksq')} To do</div>
        ${open.length? `<div class="list">${open.map(t=>`
          <div class="li clickable" data-do="${t.id}"><div class="ds-li-ic">${MKR.ui.icon('book')}</div>
            <div class="meta"><b>${U.esc(t.title)}</b><span>${t.dueDate?`due ${U.esc(t.dueDate)}`:'no due date'}</span></div>
            ${isOverdue(t)?'<span class="pill danger">Overdue</span>':(dueSoon(t)?'<span class="pill warn">Due soon</span>':'<span class="pill ghost">Open ›</span>')}</div>`).join('')}</div>`
          : `<div class="empty"><div class="em">${MKR.ui.icon('checkcircle')}</div><p>Nothing outstanding — you're up to date.</p></div>`}
      </div>
      <div class="card pad20 mt16">
        <div class="section-title">${MKR.ui.icon('checkcircle')} Completed</div>
        ${done.length? `<div class="list">${done.map(t=>`
          <div class="li clickable" data-read="${t.sopId}"><div class="ds-li-ic">${MKR.ui.icon('checkcircle')}</div>
            <div class="meta"><b>${U.esc(t.title)}</b><span>signed off ${U.fmtDate(t.completedAt)}</span></div>
            <span class="faint">read again ›</span></div>`).join('')}</div>`
          : `<div class="empty"><div class="em">${MKR.ui.icon('book')}</div><p>Nothing completed yet</p></div>`}
      </div>
      ${certCard(myCerts, ()=>sess.name||'You', {title:'My certificates', hideName:true,
        empty:'Nothing recorded. Add your RSA or food safety certificate here and you\u2019ll be reminded before it lapses.'})}

      <div class="card pad20 mt16">
        <div class="section-title">${MKR.ui.icon('book')} All SOPs — look anything up</div>
        ${list.length? `<div class="list">${list.map(s=>`
          <div class="li clickable" data-read="${s.id}"><div class="ds-li-ic">${MKR.ui.icon('book')}</div>
            <div class="meta"><b>${U.esc(s.title)}</b><span>${U.esc(s.category)}</span></div><span class="faint">›</span></div>`).join('')}</div>`
          : `<div class="empty"><div class="em">${MKR.ui.icon('book')}</div><p>No SOPs published yet</p></div>`}
      </div>`;

    bindCertCard(c, myCerts, [sess], ()=>renderMine(c), sess.id);
    U.qsa('[data-do]',c).forEach(b=> b.onclick=()=>{
      const t=ts.find(x=>x.id===b.dataset.do);
      readModal(list.find(s=>s.id===t.sopId), t, ()=>renderMine(c));
    });
    U.qsa('[data-read]',c).forEach(b=> b.onclick=()=> readModal(list.find(s=>s.id===b.dataset.read), null, null));
  }

  function readModal(sop, task, after){
    if(!sop){ U.toast('That SOP has been removed','amber'); return; }
    const wrap = U.el(`<div>
      <span class="pill ghost">${U.esc(sop.category)}</span>
      ${sop.why?`<p class="muted mt12" style="font-size:14px"><b>Why it matters:</b> ${U.esc(sop.why)}</p>`:''}
      <ol class="sop-steps">${(sop.steps||[]).map(s=>`<li>${U.esc(s)}</li>`).join('')}</ol>
      ${task?`<div class="field mt16"><label>Sign off — type your name to confirm you've read and understood this</label>
        <input class="input" id="tr_sign" value="${U.esc((me()||{}).name||'')}"></div>`:''}
    </div>`);
    const actions = task ? [
      {label:'Close', class:'btn-ghost', onClick:c=>c()},
      {label:'I have read and understood', class:'btn-dark', onClick:async(close)=>{
        const sig=U.qs('#tr_sign',wrap).value.trim();
        if(!sig){ U.toast('Type your name to sign off','red'); return; }
        await complete(task, sig); close(); U.toast('Signed off — nice work','green'); if(after) after();
      }}
    ] : [];
    U.modal(sop.title, wrap, {actions});
  }

  MKR.training = { CATS, sops, trainings, mine, saveSop, assign, complete, isOverdue,
    CERT_TYPES, certs, saveCert, certLabel, certDays, certState, certList, certModal,
    renderManage, renderMine };
})();
