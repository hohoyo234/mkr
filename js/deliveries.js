/* ===== Delivery confirmation =====
   The paper docket the driver hands over, done properly on a phone at the back
   door: what was ordered, what actually turned up, what condition it was in, and
   who signed for it.

   Confirming a delivery is the ONE place goods enter the building — it writes a
   purchase (which moves stock and records the unit price), so nothing is counted
   twice. Short or damaged lines are recorded as received, not as ordered, so the
   stock figure stays honest.

   Table: deliveries
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  function kid(){ const s=MKR.auth&&MKR.auth.current&&MKR.auth.current(); return (s&&s.kitchenId)||'k_main'; }
  function me(){ const s=MKR.auth&&MKR.auth.current&&MKR.auth.current(); return (s&&s.name)||'—'; }

  const COND = {
    ok:      {label:'Good',            pill:'ok'},
    short:   {label:'Short delivered', pill:'warn'},
    damaged: {label:'Damaged',         pill:'danger'},
    wrong:   {label:'Wrong item',      pill:'danger'},
  };
  const STATUS = {
    expected:  {label:'Expected',  pill:'ghost', em:'🕒'},
    confirmed: {label:'Confirmed', pill:'ok',    em:'✅'},
    rejected:  {label:'Rejected',  pill:'danger',em:'⛔'},
  };

  async function all(){ return (await MKR.db.getAll('deliveries')).filter(d=>(d.kitchenId||'k_main')===kid()).sort((a,b)=>(b.ts||0)-(a.ts||0)); }
  async function pending(){ return (await all()).filter(d=>d.status==='expected'); }

  async function save(d){
    return MKR.db.put('deliveries', {status:'expected', kitchenId:kid(), ts:Date.now(), ...d, id:d.id||U.uid('dlv')});
  }

  // Confirm: record what actually arrived, then push it into stock as a purchase.
  async function confirm(d, {lines, receivedBy, tempC, note, photo}){
    const got = lines.filter(l=>(+l.received||0)>0);
    let purchaseId = null;
    if(got.length){
      const p = await MKR.stock.savePurchase({
        supplierId: d.supplierId, invoiceNo: d.docketNo || '',
        note: `Delivery confirmed by ${receivedBy}`,
        lines: got.map(l=>({itemId:l.itemId, name:l.name, unit:l.unit, qty:+l.received, unitPrice:+l.unitPrice||0})),
      });
      purchaseId = p.id;
    }
    const saved = await MKR.db.put('deliveries', {
      id:d.id, status:'confirmed', lines, receivedBy, tempC:tempC===''?null:tempC,
      note, photo:photo||null, confirmedAt:Date.now(), purchaseId
    });
    const problems = lines.filter(l=>l.condition && l.condition!=='ok');
    if(problems.length){
      await MKR.alerts.raise({ key:'delivery-'+d.id, level:'amber', type:'delivery',
        title:'Delivery problem', desc:`${problems.length} line(s) short or damaged on the ${d.supplierName||'supplier'} delivery — worth a call before you pay the invoice`});
    }
    try{ await MKR.audit.log({action:'delivery.confirm', desc:`Confirmed delivery from ${d.supplierName||'supplier'}${problems.length?` · ${problems.length} problem line(s)`:''}`}); }catch(e){}
    return saved;
  }

  async function reject(d, reason){
    await MKR.db.put('deliveries', {id:d.id, status:'rejected', note:reason, receivedBy:me(), confirmedAt:Date.now()});
    await MKR.alerts.raise({key:'delivery-rej-'+d.id, level:'red', type:'delivery',
      title:'Delivery rejected', desc:`${d.supplierName||'A supplier'} delivery was turned away — ${reason||'no reason given'}`});
    try{ await MKR.audit.log({action:'delivery.reject', desc:`Rejected delivery from ${d.supplierName||'supplier'}`}); }catch(e){}
  }

  // ---------------- page ----------------
  async function render(c){
    const [rows, sups, its] = await Promise.all([all(), MKR.stock.suppliers(), MKR.stock.items()]);
    const supName = id=>{ const s=sups.find(x=>x.id===id); return s?s.name:'—'; };
    const wait = rows.filter(d=>d.status==='expected');
    const probs = rows.filter(d=>d.status==='confirmed' && (d.lines||[]).some(l=>l.condition&&l.condition!=='ok')).length;

    c.innerHTML = `
      <div class="section-head"><div><h2>Deliveries</h2><p>Check it at the back door, not after the invoice arrives</p></div>
        <button class="btn btn-dark btn-sm" id="dlvNew">${MKR.ui.icon('plus')} New delivery</button></div>
      <div class="statline">
        <span class="statcell"><b>${wait.length}</b><i>waiting</i></span>
        <span class="statcell"><b>${rows.filter(d=>d.status==='confirmed').length}</b><i>confirmed</i></span>
        <span class="statcell"${probs?' style="color:var(--red)"':''}><b>${probs}</b><i>problems</i></span>
      </div>
      <div class="card pad20 mt16">
        <div class="section-title">Delivery log</div>
        ${rows.length? `<div class="list">${rows.map(d=>{
          const st=STATUS[d.status]||STATUS.expected;
          const bad=(d.lines||[]).filter(l=>l.condition&&l.condition!=='ok').length;
          return `<div class="li clickable" data-dlv="${d.id}">
            <div class="ds-li-ic">${st.em}</div>
            <div class="meta"><b>${U.esc(d.supplierName||supName(d.supplierId))}${d.docketNo?' · '+U.esc(d.docketNo):''}</b>
              <span>${U.fmtDateTime(d.ts)} · ${(d.lines||[]).length} line${(d.lines||[]).length===1?'':'s'}${d.receivedBy?' · signed '+U.esc(d.receivedBy):''}${bad?` · ${bad} problem`:''}</span></div>
            <span class="pill ${st.pill}">${st.label}</span></div>`;
        }).join('')}</div>`
        : `<div class="empty"><div class="em">🚚</div><p>No deliveries logged yet. Create one when a driver pulls up — or ahead of time so whoever's on shift just has to tick it off.</p></div>`}
      </div>
      <div class="disclaimer mt16"><span>✍️</span>Confirming a delivery adds the <b>received</b> quantities to stock and records the unit prices you were charged. Short and damaged lines are flagged for you to chase.</div>`;

    U.qs('#dlvNew',c).onclick = ()=>{
      if(!its.length){ U.toast('Add some stock items first','amber'); return; }
      newModal(sups, its, ()=>render(c));
    };
    U.qsa('[data-dlv]',c).forEach(b=> b.onclick = ()=>{
      const d = rows.find(x=>x.id===b.dataset.dlv);
      d.status==='expected' ? confirmModal(d, its, ()=>render(c)) : detailModal(d);
    });
  }

  function newModal(sups, its, after){
    const opt = its.map(i=>`<option value="${i.id}">${U.esc(i.name)} (${U.esc(i.unit||'')})</option>`).join('');
    const lineHtml = ()=>`<tr class="dl-row">
      <td><select class="input dl-item">${opt}</select></td>
      <td class="num"><input class="input dl-ord" type="number" step="0.01" value="1" style="text-align:right"></td>
      <td class="num"><button class="btn btn-ghost btn-sm dl-del" aria-label="remove line">×</button></td></tr>`;
    const wrap = U.el(`<div>
      <div class="row"><div class="field grow"><label>Supplier</label><select class="input" id="d_sup">
        <option value="">— not recorded —</option>${sups.map(s=>`<option value="${s.id}">${U.esc(s.name)}</option>`).join('')}
      </select></div>
      <div class="field grow"><label>Docket / invoice no.</label><input class="input" id="d_doc" placeholder="optional"></div></div>
      <div class="tablewrap"><table class="dtable">
        <thead><tr><th>Item</th><th class="num" style="width:110px">Ordered</th><th></th></tr></thead>
        <tbody id="d_lines">${lineHtml()}</tbody></table></div>
      <button class="btn btn-ghost btn-sm mt8" id="d_add">${MKR.ui.icon('plus')} Add line</button>
      <div class="disclaimer"><span>🕒</span>This creates an <b>expected</b> delivery. Whoever takes it in opens it and confirms what actually arrived.</div>
    </div>`);
    const body = U.qs('#d_lines',wrap);
    const bindRow = tr=>{ U.qs('.dl-del',tr).onclick=()=>{ if(U.qsa('.dl-row',body).length>1) tr.remove(); }; };
    U.qsa('.dl-row',body).forEach(bindRow);
    U.qs('#d_add',wrap).onclick = ()=>{ const tr=U.el(lineHtml()); body.appendChild(tr); bindRow(tr); };

    U.modal('New delivery', wrap, {actions:[
      {label:'Cancel', class:'btn-ghost', onClick:c=>c()},
      {label:'Create', class:'btn-dark', onClick:async(close)=>{
        const supId = U.qs('#d_sup',wrap).value||null;
        const lines = U.qsa('.dl-row',body).map(tr=>{
          const id=U.qs('.dl-item',tr).value; const it=its.find(i=>i.id===id)||{};
          return {itemId:id, name:it.name||'', unit:it.unit||'', ordered:Number(U.qs('.dl-ord',tr).value)||0,
                  received:null, unitPrice:it.price||0, condition:'ok', note:''};
        }).filter(l=>l.ordered>0);
        if(!lines.length){ U.toast('Add at least one line','red'); return; }
        const s = sups.find(x=>x.id===supId);
        await save({supplierId:supId, supplierName:s?s.name:'', docketNo:U.qs('#d_doc',wrap).value.trim(), lines});
        close(); U.toast('Delivery created','green'); after();
      }}
    ]});
  }

  function confirmModal(d, its, after){
    const condOpts = (sel)=> Object.entries(COND).map(([k,v])=>`<option value="${k}" ${sel===k?'selected':''}>${v.label}</option>`).join('');
    const hasPerishable = (d.lines||[]).some(l=>{ const it=its.find(i=>i.id===l.itemId); return it && it.kind==='perishable'; });
    const wrap = U.el(`<div>
      <div class="faint" style="font-size:12.5px;margin-bottom:10px">${U.esc(d.supplierName||'Supplier')}${d.docketNo?' · docket '+U.esc(d.docketNo):''} · raised ${U.fmtDateTime(d.ts)}</div>
      <div class="tablewrap"><table class="dtable">
        <thead><tr><th>Item</th><th class="num" style="width:82px">Ordered</th><th class="num" style="width:96px">Received</th><th class="num" style="width:104px">Unit price</th><th style="width:140px">Condition</th></tr></thead>
        <tbody>${(d.lines||[]).map((l,i)=>`<tr class="dc-row" data-i="${i}">
          <td><b>${U.esc(l.name)}</b><div class="faint" style="font-size:11.5px">${U.esc(l.unit||'')}</div></td>
          <td class="num faint">${l.ordered}</td>
          <td class="num"><input class="input dc-rec" type="number" step="0.01" value="${l.received!=null?l.received:l.ordered}" style="text-align:right"></td>
          <td class="num"><input class="input dc-price" type="number" step="0.01" value="${l.unitPrice||0}" style="text-align:right"></td>
          <td><select class="input dc-cond">${condOpts(l.condition||'ok')}</select></td></tr>`).join('')}</tbody>
      </table></div>
      ${hasPerishable?`<div class="field mt12"><label>Chilled/frozen temperature on arrival (°C)</label><input class="input" id="d_temp" type="number" step="0.1" placeholder="e.g. 3.5"></div>`:''}
      <div class="field"><label>Received by</label><input class="input" id="d_by" value="${U.esc(me())}"></div>
      <div class="field"><label>Note (optional)</label><input class="input" id="d_note" placeholder="e.g. 2 boxes short, driver to redeliver Friday"></div>
      <label class="img-drop"><div class="img-preview" id="d_prev"><span>📷 Photo of the docket or the problem (optional)</span></div><input type="file" id="d_photo" accept="image/*" hidden></label>
      <div class="disclaimer mt12"><span>📦</span>Received quantities go into stock at the unit prices above — check the prices against the docket before you sign.</div>
    </div>`);
    let photo=null;
    U.qs('#d_photo',wrap).onchange=(e)=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader();
      r.onload=()=>{ photo=r.result; U.qs('#d_prev',wrap).innerHTML=`<img src="${photo}">`; }; r.readAsDataURL(f); };
    // Receiving less than ordered is the usual reason for a problem — pre-flag it.
    U.qsa('.dc-row',wrap).forEach((tr,i)=>{
      U.qs('.dc-rec',tr).oninput = ()=>{
        const sel=U.qs('.dc-cond',tr);
        if(sel.value==='ok' && Number(U.qs('.dc-rec',tr).value) < (d.lines[i].ordered||0)) sel.value='short';
      };
    });

    U.modal('Confirm delivery', wrap, {actions:[
      {label:'Reject whole delivery', class:'btn-ghost', onClick:async(close)=>{
        const why = prompt('Why is this delivery being turned away?'); if(why==null) return;
        await reject(d, why.trim()); close(); U.toast('Delivery rejected','amber'); after();
      }},
      {label:'✍️ Confirm', class:'btn-dark', onClick:async(close)=>{
        const lines = U.qsa('.dc-row',wrap).map((tr,i)=>({
          ...d.lines[i],
          received: Number(U.qs('.dc-rec',tr).value)||0,
          unitPrice: Number(U.qs('.dc-price',tr).value)||0,
          condition: U.qs('.dc-cond',tr).value,
        }));
        const by = U.qs('#d_by',wrap).value.trim();
        if(!by){ U.toast('Sign it — who received this?','red'); return; }
        const tempEl = U.qs('#d_temp',wrap);
        await confirm(d, {lines, receivedBy:by, tempC:tempEl?tempEl.value:'', note:U.qs('#d_note',wrap).value.trim(), photo});
        close(); U.toast('Delivery confirmed — stock updated','green'); after();
      }}
    ]});
  }

  function detailModal(d){
    const st=STATUS[d.status]||STATUS.expected;
    U.modal(`Delivery · ${d.supplierName||'Supplier'}`, `
      <div class="faint" style="font-size:12.5px;margin-bottom:8px">${U.fmtDateTime(d.ts)}${d.docketNo?' · docket '+U.esc(d.docketNo):''} · <span class="pill ${st.pill}">${st.label}</span></div>
      ${d.status==='rejected' ? `<div class="alert red"><span>⛔</span><div>Turned away · ${U.esc(d.note||'no reason recorded')}</div></div>` : `
      <div class="tablewrap"><table class="dtable">
        <thead><tr><th>Item</th><th class="num">Ordered</th><th class="num">Received</th><th class="num">Unit price</th><th>Condition</th></tr></thead>
        <tbody>${(d.lines||[]).map(l=>{ const cd=COND[l.condition]||COND.ok;
          return `<tr><td>${U.esc(l.name)}</td><td class="num faint">${l.ordered}</td><td class="num"><b>${l.received!=null?l.received:'—'}</b></td>
            <td class="num">${U.money(l.unitPrice)}</td><td><span class="pill ${cd.pill}">${cd.label}</span></td></tr>`; }).join('')}</tbody>
      </table></div>
      <div class="list mt12">
        <div class="li"><div class="meta"><span>Received by</span><b>${U.esc(d.receivedBy||'—')}</b></div></div>
        ${d.tempC!=null&&d.tempC!==''?`<div class="li"><div class="meta"><span>Temperature on arrival</span><b>${U.esc(String(d.tempC))} °C</b></div></div>`:''}
        ${d.note?`<div class="li"><div class="meta"><span>Note</span><b>${U.esc(d.note)}</b></div></div>`:''}
      </div>
      ${d.photo?`<img src="${d.photo}" style="max-width:100%;border-radius:12px;margin-top:12px">`:''}`}`);
  }

  MKR.deliveries = { COND, STATUS, all, pending, save, confirm, reject, render };
})();
