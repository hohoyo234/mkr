/* ===== Staff training & SOPs =====
   The "how we do it here" library, plus the training tasks that make sure people
   have actually read it.

   · SOP        — a titled, step-by-step procedure the venue owns (sops table)
   · Training   — one SOP assigned to one person with a due date (trainings table)

   Staff open a training task, read the steps and sign it off with their name;
   that sign-off is what the owner sees. Nothing here is submitted to anyone
   outside the venue.
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

  // ---------------- Owner / manager: library + who's done what ----------------
  async function renderManage(c){
    const [list, trs, users] = await Promise.all([sops(), trainings(),
      MKR.db.getAll('users').then(u=>u.filter(x=>(x.role==='staff'||x.role==='manager') && !x.offboarded && (x.kitchenId||'k_main')===kid()))]);
    const nameOf = id=>{ const u=users.find(x=>x.id===id); return u?u.name:'—'; };
    const outstanding = trs.filter(t=>t.status!=='done');
    const overdue = outstanding.filter(isOverdue);

    c.innerHTML = `
      <div class="section-head"><div><h2>Training &amp; SOPs</h2><p>Write it once, assign it, see who's actually read it</p></div>
        <div class="row gap8 wrap"><button class="btn btn-ghost btn-sm" id="trAssign">${MKR.ui.icon('users')} Assign training</button>
          <button class="btn btn-dark btn-sm" id="trNew">${MKR.ui.icon('plus')} New SOP</button></div></div>

      <div class="statline">
        <span class="statcell"><b>${list.length}</b><i>SOPs</i></span>
        <span class="statcell"><b>${outstanding.length}</b><i>outstanding</i></span>
        <span class="statcell"${overdue.length?' style="color:var(--red)"':''}><b>${overdue.length}</b><i>overdue</i></span>
      </div>

      <div class="grid g2 mt16" style="align-items:start">
        <div class="card pad20">
          <div class="section-title">📘 SOP library</div>
          ${list.length? `<div class="list">${list.map(s=>`
            <div class="li clickable" data-sop="${s.id}"><div class="ds-li-ic">📘</div>
              <div class="meta"><b>${U.esc(s.title)}</b><span>${U.esc(s.category)} · ${(s.steps||[]).length} step${(s.steps||[]).length===1?'':'s'} · v${s.version||1}</span></div>
              <span class="faint">›</span></div>`).join('')}</div>`
            : `<div class="empty"><div class="em">📘</div><p>No SOPs yet. Start with the three things new starters always get wrong.</p></div>`}
        </div>
        <div class="card pad20">
          <div class="section-title">👥 Training status</div>
          ${users.length? `<div class="list">${users.map(u=>{
            const t=trs.filter(x=>x.staffId===u.id);
            const done=t.filter(x=>x.status==='done').length;
            const od=t.filter(isOverdue).length;
            return `<div class="li"><div class="ava">${u.emoji||U.initials(u.name)}</div>
              <div class="meta"><b>${U.esc(u.name)}</b><span>${U.esc(u.position||MKR.auth.roleName(u.role))}</span></div>
              <span class="pill ${od?'danger':(t.length&&done===t.length?'ok':'ghost')}">${done}/${t.length||0} done${od?` · ${od} overdue`:''}</span></div>`;
          }).join('')}</div>`
            : `<div class="empty"><div class="em">👥</div><p>No team members yet</p></div>`}
        </div>
      </div>

      <div class="card pad20 mt16">
        <div class="section-title">📝 Assigned training</div>
        ${trs.length? `<div class="tablewrap"><table class="dtable">
          <thead><tr><th>Person</th><th>SOP</th><th>Due</th><th>Status</th><th>Signed off</th><th></th></tr></thead>
          <tbody>${trs.slice().sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||''))).map(t=>`
            <tr><td><b>${U.esc(nameOf(t.staffId))}</b></td><td>${U.esc(t.title)}</td>
              <td>${t.dueDate?U.esc(t.dueDate):'<span class="faint">—</span>'}</td>
              <td>${t.status==='done'?'<span class="pill ok">Done</span>':(isOverdue(t)?'<span class="pill danger">Overdue</span>':(dueSoon(t)?'<span class="pill warn">Due soon</span>':'<span class="pill ghost">Assigned</span>'))}</td>
              <td>${t.completedAt?`${U.esc(t.signedBy||'')} <span class="faint">${U.fmtDate(t.completedAt)}</span>`:'<span class="faint">—</span>'}</td>
              <td class="num"><button class="btn btn-ghost btn-sm" data-trdel="${t.id}">Remove</button></td></tr>`).join('')}</tbody>
        </table></div>` : `<div class="empty"><div class="em">📝</div><p>Nothing assigned yet</p></div>`}
      </div>`;

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
    const due = new Date(Date.now()+7*DAY).toISOString().slice(0,10);
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
    const open = ts.filter(t=>t.status!=='done').sort((a,b)=>String(a.dueDate||'zz').localeCompare(String(b.dueDate||'zz')));
    const done = ts.filter(t=>t.status==='done').sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));

    c.innerHTML = `
      <div class="section-head"><div><h2>My training</h2><p>Read it, then sign it off — takes a couple of minutes</p></div></div>
      <div class="card pad20">
        <div class="section-title">📝 To do</div>
        ${open.length? `<div class="list">${open.map(t=>`
          <div class="li clickable" data-do="${t.id}"><div class="ds-li-ic">📘</div>
            <div class="meta"><b>${U.esc(t.title)}</b><span>${t.dueDate?`due ${U.esc(t.dueDate)}`:'no due date'}</span></div>
            ${isOverdue(t)?'<span class="pill danger">Overdue</span>':(dueSoon(t)?'<span class="pill warn">Due soon</span>':'<span class="pill ghost">Open ›</span>')}</div>`).join('')}</div>`
          : `<div class="empty"><div class="em">🎉</div><p>Nothing outstanding — you're up to date.</p></div>`}
      </div>
      <div class="card pad20 mt16">
        <div class="section-title">✅ Completed</div>
        ${done.length? `<div class="list">${done.map(t=>`
          <div class="li clickable" data-read="${t.sopId}"><div class="ds-li-ic">✅</div>
            <div class="meta"><b>${U.esc(t.title)}</b><span>signed off ${U.fmtDate(t.completedAt)}</span></div>
            <span class="faint">read again ›</span></div>`).join('')}</div>`
          : `<div class="empty"><div class="em">📗</div><p>Nothing completed yet</p></div>`}
      </div>
      <div class="card pad20 mt16">
        <div class="section-title">📚 All SOPs — look anything up</div>
        ${list.length? `<div class="list">${list.map(s=>`
          <div class="li clickable" data-read="${s.id}"><div class="ds-li-ic">📘</div>
            <div class="meta"><b>${U.esc(s.title)}</b><span>${U.esc(s.category)}</span></div><span class="faint">›</span></div>`).join('')}</div>`
          : `<div class="empty"><div class="em">📘</div><p>No SOPs published yet</p></div>`}
      </div>`;

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
      {label:'✅ I have read and understood', class:'btn-dark', onClick:async(close)=>{
        const sig=U.qs('#tr_sign',wrap).value.trim();
        if(!sig){ U.toast('Type your name to sign off','red'); return; }
        await complete(task, sig); close(); U.toast('Signed off — nice work','green'); if(after) after();
      }}
    ] : [];
    U.modal(sop.title, wrap, {actions});
  }

  MKR.training = { CATS, sops, trainings, mine, saveSop, assign, complete, isOverdue, renderManage, renderMine };
})();
