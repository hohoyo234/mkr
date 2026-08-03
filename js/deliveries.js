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
    // "Good condition", not "Good" — the feedback page also has a "Good", and a
    // one-word key that means two different things can only be translated wrong
    // in one of them.
    ok:      {label:'Good condition',  pill:'ok'},
    short:   {label:'Short delivered', pill:'warn'},
    damaged: {label:'Damaged',         pill:'danger'},
    wrong:   {label:'Wrong item',      pill:'danger'},
  };
  const STATUS = {
    expected:  {label:'Expected',  pill:'ghost', em:'🕒'},
    confirmed: {label:'Confirmed', pill:'ok',    em:'✅'},
    // "Turned away", not "Rejected" — a rejected kitchen application elsewhere
    // means something else entirely, and one shared key can only be translated
    // right in one of them. Matches the wording already used in detailModal.
    rejected:  {label:'Turned away',  pill:'danger',em:'⛔'},
  };
  // Same list the Purchases form offers, so a docket says the same thing
  // whichever door it came in through.
  const PAY = ['Bank transfer','Card','Cash','Account · 7 days','Account · 14 days','Account · 30 days'];

  // What happens after "2 boxes were off". A problem noticed at the back door is
  // only worth noticing if somebody chases the money, and "they said they'd fix
  // it" is where that money quietly dies.
  const CLAIM = {
    open:    {label:'Still to raise',   pill:'warn',  em:'📌'},
    claimed: {label:'Raised with them', pill:'ghost', em:'📞'},
    settled: {label:'Settled',          pill:'ok',    em:'✅'},
    dropped: {label:'Written off',      pill:'ghost', em:'✖️'},
  };

  async function all(){ return (await MKR.db.getAll('deliveries')).filter(d=>(d.kitchenId||'k_main')===kid()).sort((a,b)=>(b.ts||0)-(a.ts||0)); }
  async function pending(){ return (await all()).filter(d=>d.status==='expected'); }
  async function claims(){ return (await MKR.db.getAll('claims')).filter(c=>(c.kitchenId||'k_main')===kid()).sort((a,b)=>(b.ts||0)-(a.ts||0)); }

  // What a delivery actually cost you in goods you can't use.
  //
  // Only damaged and wrong-item lines carry money: those were received, so the
  // docket charged for them, and they're useless. A SHORT line was never
  // charged — confirm() books the received quantity, not the ordered one — so
  // there is nothing to claim back unless the supplier's monthly invoice bills
  // the full order, and that's what the statement check is for. Claiming for a
  // short line here would be asking for a refund on something you never paid.
  function claimableOf(d){
    const lines = (d.lines||[])
      .filter(l=>(l.condition==='damaged'||l.condition==='wrong') && (+l.received||0)>0)
      .map(l=>({itemId:l.itemId, name:l.name, unit:l.unit, qty:+l.received||0,
                unitPrice:+l.unitPrice||0, condition:l.condition,
                amount:U.round2((+l.received||0)*(+l.unitPrice||0))}));
    const short = (d.lines||[]).filter(l=>l.condition==='short' ||
      ((+l.ordered||0) > 0 && (+l.received||0) < (+l.ordered||0)));
    return {lines, amount:U.round2(lines.reduce((t,l)=>t+l.amount,0)), short};
  }

  async function saveClaim(c){
    const prev = c.id ? await MKR.db.get('claims', c.id) : null;
    const status = c.status || 'open';
    // An append-only trail: who said what, when. That's the whole point — the
    // number is easy, remembering that Kim promised a credit on the 3rd is not.
    const history = (prev && prev.history || []).slice();
    if(!prev || prev.status !== status || (c.note||'') !== (prev.note||''))
      history.push({ts:Date.now(), by:me(), status, note:c.note||''});
    const row = await MKR.db.put('claims', {
      id: c.id || `clm_${c.deliveryId}`,          // one claim per delivery
      deliveryId:c.deliveryId, supplierId:c.supplierId||null, supplierName:c.supplierName||'',
      lines:c.lines||[], amount:U.round2(c.amount||0), status, note:c.note||'',
      history, by:me(), ts: prev ? prev.ts : Date.now(), updatedAt:Date.now(), kitchenId:kid()
    });
    try{ await MKR.audit.log({action:'delivery.claim',
      desc:`Claim ${CLAIM[status].label.toLowerCase()} · ${c.supplierName||'supplier'}`, amount:row.amount}); }catch(e){}
    return row;
  }

  async function save(d){
    return MKR.db.put('deliveries', {status:'expected', kitchenId:kid(), ts:Date.now(), ...d, id:d.id||U.uid('dlv')});
  }

  // Confirm: record what actually arrived, then push it into stock as a purchase.
  //
  // This is the only door goods come in through, so it has to capture the whole
  // docket in one go — quantities, the prices you were charged, the freight, the
  // GST the supplier put on it and how it's being paid. Anything left out here
  // is something the owner has to type a second time later, which is exactly the
  // job this app exists to delete.
  async function confirm(d, {lines, receivedBy, tempC, note, photo, docketNo, payMethod, fee, gst}){
    const got = lines.filter(l=>(+l.received||0)>0);
    let purchaseId = null;
    if(got.length){
      const p = await MKR.stock.savePurchase({
        supplierId: d.supplierId, invoiceNo: docketNo || d.docketNo || '',
        note: note || '', by: receivedBy, payMethod: payMethod||'',
        // The photo is kept once, on the delivery — the docket reads it back
        // through deliveryId. Storing it on both rows doubled the biggest field
        // in the database for nothing.
        fee: +fee||0, gst: +gst||0, deliveryId: d.id,
        // Received, never ordered — a short delivery must not inflate stock.
        lines: got.map(l=>({itemId:l.itemId, name:l.name, unit:l.unit, qty:+l.received,
                            unitPrice:+l.unitPrice||0, ordered:+l.ordered||0, condition:l.condition||'ok'})),
      });
      purchaseId = p.id;
    }
    const saved = await MKR.db.put('deliveries', {
      id:d.id, status:'confirmed', lines, receivedBy, tempC:tempC===''?null:tempC,
      docketNo: docketNo || d.docketNo || '', payMethod: payMethod||'', fee:+fee||0, gst:+gst||0,
      note, photo:photo||null, confirmedAt:Date.now(), purchaseId
    });
    const problems = lines.filter(l=>l.condition && l.condition!=='ok');
    if(problems.length){
      // Open the claim the moment the problem is signed for, rather than waiting
      // for someone to remember. An empty-money claim is still worth raising:
      // a short line has to be watched on their invoice even though the docket
      // was right.
      const cl = claimableOf({lines});
      await saveClaim({deliveryId:d.id, supplierId:d.supplierId, supplierName:d.supplierName||'',
        lines:cl.lines, amount:cl.amount, status:'open',
        note:`Opened automatically · ${problems.length} problem line(s) signed for`});
      await MKR.alerts.raise({ key:'delivery-'+d.id, level:'amber', type:'delivery',
        title:'Delivery problem', desc:`${problems.length} line(s) short or damaged on the ${d.supplierName||'supplier'} delivery${cl.amount?` — ${U.money(cl.amount)} of it you were charged for`:''} — worth a call before you pay the invoice`});
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
    const [rows, sups, its, purch, clms] = await Promise.all([all(), MKR.stock.suppliers(), MKR.stock.items(), MKR.stock.purchases(), claims()]);
    const supName = id=>{ const s=sups.find(x=>x.id===id); return s?s.name:'—'; };
    const docketOf = (d)=> d.purchaseId ? purch.find(p=>p.id===d.purchaseId) || null : null;
    const claimOf  = (d)=> clms.find(x=>x.deliveryId===d.id) || null;
    const wait = rows.filter(d=>d.status==='expected');
    const probs = rows.filter(d=>d.status==='confirmed' && (d.lines||[]).some(l=>l.condition&&l.condition!=='ok')).length;
    // Only money still in play: settled and written-off claims are finished.
    const chasing = clms.filter(x=>x.status==='open'||x.status==='claimed');
    const owed = U.round2(chasing.reduce((t,x)=>t+(+x.amount||0),0));

    c.innerHTML = `
      <div class="section-head"><div><h2>Deliveries</h2><p>Check it at the back door, not after the invoice arrives</p></div>
        <button class="btn btn-dark btn-sm" id="dlvNew">${MKR.ui.icon('plus')} New delivery</button></div>
      <div class="statline">
        <span class="statcell"><b>${wait.length}</b><i>waiting</i></span>
        <span class="statcell"><b>${rows.filter(d=>d.status==='confirmed').length}</b><i>confirmed</i></span>
        <span class="statcell"${probs?' style="color:var(--red)"':''}><b>${probs}</b><i>problems</i></span>
        <span class="statcell"${owed?' style="color:var(--red)"':''}><b>${U.money0(owed)}</b><i>still to get back</i></span>
      </div>
      ${chasing.length?`<div class="alert amber mt16"><span>💸</span><div>
        <b>${chasing.length===1?'One claim is still open':`${chasing.length} claims are still open`}</b>
        <div class="faint">${chasing.slice(0,4).map(x=>`<div>${U.esc(x.supplierName||'Supplier')} ${U.money(x.amount)} · <span>${CLAIM[x.status].label}</span></div>`).join('')}</div>
        <div>Open the delivery to log what they said, or mark it settled once the credit lands.</div>
      </div></div>`:''}
      <div class="card pad20 mt16">
        <div class="section-title">Delivery log</div>
        ${rows.length? `<div class="list">${rows.map(d=>{
          const st=STATUS[d.status]||STATUS.expected;
          const bad=(d.lines||[]).filter(l=>l.condition&&l.condition!=='ok').length;
          const dk=docketOf(d), cl=claimOf(d);
          return `<div class="li clickable" data-dlv="${d.id}">
            <div class="ds-li-ic">${st.em}</div>
            <div class="meta"><b>${U.esc(d.supplierName||supName(d.supplierId))}${d.docketNo?' · '+U.esc(d.docketNo):''}</b>
              <span>${U.fmtDateTime(d.ts)} · ${(d.lines||[]).length} line${(d.lines||[]).length===1?'':'s'}${d.receivedBy?' · signed '+U.esc(d.receivedBy):''}${bad?` · ${bad} problem`:''}</span></div>
            ${dk?`<b class="dlv-amt">${U.money(dk.total)}</b>`:''}
            ${cl?`<span class="pill ${CLAIM[cl.status].pill}">${CLAIM[cl.status].em} ${cl.amount?U.money(cl.amount):CLAIM[cl.status].label}</span>`:''}
            <span class="pill ${st.pill}">${st.label}</span></div>`;
        }).join('')}</div>`
        : `<div class="empty"><div class="em">🚚</div><p>No deliveries logged yet. Create one when a driver pulls up — or ahead of time so whoever's on shift just has to tick it off.</p></div>`}
      </div>
      <div class="disclaimer mt16"><span>✍️</span><div>Confirming a delivery is the whole job in one go: received quantities go into stock, the prices you were charged are recorded, and the docket files itself into Purchases. Short and damaged lines are flagged for you to chase.</div></div>`;

    U.qs('#dlvNew',c).onclick = ()=>{
      if(!its.length){ U.toast('Add some stock items first','amber'); return; }
      newModal(sups, its, ()=>render(c));
    };
    U.qsa('[data-dlv]',c).forEach(b=> b.onclick = ()=>{
      const d = rows.find(x=>x.id===b.dataset.dlv);
      d.status==='expected' ? confirmModal(d, its, ()=>render(c)) : detailModal(d, docketOf(d), sups, purch, claimOf(d), ()=>render(c));
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
      <div class="dkt-runtotal"><span>Docket total</span><b id="d_total">${U.money(0)}</b></div>

      <div class="row mt12"><div class="field grow"><label>Docket / invoice no.</label><input class="input" id="d_doc" value="${U.esc(d.docketNo||'')}" placeholder="what's printed on the paper"></div>
        <div class="field grow"><label>Paid by</label><select class="input" id="d_pay">
          <option value="">— not recorded —</option>${PAY.map(x=>`<option value="${x}">${x}</option>`).join('')}
        </select></div></div>
      <div class="row"><div class="field grow"><label>Freight / delivery fee</label><input class="input" id="d_fee" type="number" step="0.01" value="0"></div>
        <div class="field grow"><label>GST shown on the docket</label><input class="input" id="d_gst" type="number" step="0.01" value="0"></div></div>

      ${hasPerishable?`<div class="field"><label>Chilled/frozen temperature on arrival (°C)</label><input class="input" id="d_temp" type="number" step="0.1" placeholder="e.g. 3.5"></div>`:''}
      <div class="field"><label>Received by</label><input class="input" id="d_by" value="${U.esc(me())}"></div>
      <div class="field"><label>Note (optional)</label><input class="input" id="d_note" placeholder="e.g. 2 boxes short, driver to redeliver Friday"></div>
      <label class="img-drop"><div class="img-preview" id="d_prev"><span>📷 Photo of the docket or the problem (optional)</span></div><input type="file" id="d_photo" accept="image/*" hidden></label>
      <div class="disclaimer mt12"><span>🧾</span>Signing here files the docket as well: received quantities go into stock at the prices above, and the whole thing lands in Purchases. You never type it twice.</div>
    </div>`);
    let photo=null;

    // The total moves as they check the lines off, so what gets signed for is
    // what lands in the books.
    function recalc(){
      let sub = 0;
      U.qsa('.dc-row',wrap).forEach(tr=>{
        sub += (Number(U.qs('.dc-rec',tr).value)||0) * (Number(U.qs('.dc-price',tr).value)||0);
      });
      const total = sub + (Number(U.qs('#d_fee',wrap).value)||0) + (Number(U.qs('#d_gst',wrap).value)||0);
      U.qs('#d_total',wrap).textContent = U.money(total);
    }
    U.qsa('.dc-row',wrap).forEach(tr=>{
      U.qs('.dc-rec',tr).addEventListener('input', recalc);
      U.qs('.dc-price',tr).addEventListener('input', recalc);
    });
    ['#d_fee','#d_gst'].forEach(sel=> U.qs(sel,wrap).oninput = recalc);
    recalc();
    U.qs('#d_photo',wrap).onchange=(e)=> U.readImage(e.target.files[0], (data)=>{
      photo=data; U.qs('#d_prev',wrap).innerHTML=`<img src="${photo}">`; });
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
        await confirm(d, {lines, receivedBy:by, tempC:tempEl?tempEl.value:'',
          note:U.qs('#d_note',wrap).value.trim(), photo,
          docketNo:U.qs('#d_doc',wrap).value.trim(), payMethod:U.qs('#d_pay',wrap).value,
          fee:Number(U.qs('#d_fee',wrap).value)||0, gst:Number(U.qs('#d_gst',wrap).value)||0});
        close(); U.toast('Signed · stock updated and the docket is filed','green'); after();
      }}
    ]});
  }

  // Chasing the money back. The amount is worked out from the docket rather than
  // typed, because the owner already told us what arrived and in what state —
  // asking again is how the number ends up wrong. It stays editable: suppliers
  // settle on round figures and part-credits all the time.
  function claimModal(d, claim, after){
    const cl = claimableOf(d);
    const cur = claim || {status:'open', amount:cl.amount, note:'', lines:cl.lines, history:[]};
    const wrap = U.el(`<div>
      <div class="faint" style="font-size:12.5px;margin-bottom:10px">${U.esc(d.supplierName||'Supplier')}${d.docketNo?' · '+U.esc(d.docketNo):''} · ${U.fmtDate(d.ts)}</div>

      ${cl.lines.length?`<div class="list">${cl.lines.map(l=>`<div class="li">
        <div class="meta"><b>${U.esc(l.name)}</b><span>${l.qty} ${U.esc(l.unit||'')} × ${U.money(l.unitPrice)} · <span>${U.esc((COND[l.condition]||{}).label||l.condition)}</span></span></div>
        <b>${U.money(l.amount)}</b></div>`).join('')}</div>`
      : `<div class="disclaimer"><span>ℹ️</span><div>Nothing on this docket was charged for and unusable, so there's no refund to ask for. Track it here anyway if they owe you a replacement.</div></div>`}

      ${cl.short.length?`<div class="alert info mt12"><span>📄</span><div>
        <b>${cl.short.length===1?'One line came up short':`${cl.short.length} lines came up short`}</b>
        <div class="faint">${cl.short.map(l=>`<div>${U.esc(l.name)} · <span>ordered ${l.ordered}, took ${l.received!=null?l.received:0}</span></div>`).join('')}</div>
        <div>You were only charged for what turned up, so there's nothing to refund here. Check their monthly statement bills it the same way.</div>
      </div></div>`:''}

      <div class="row mt12">
        <div class="field grow"><label>What you're chasing</label><input class="input" id="cl_amt" type="number" step="0.01" value="${cur.amount||0}"></div>
        <div class="field grow"><label>Where it's up to</label><select class="input" id="cl_st">
          ${Object.entries(CLAIM).map(([k,v])=>`<option value="${k}" ${cur.status===k?'selected':''}>${v.em} ${v.label}</option>`).join('')}
        </select></div>
      </div>
      <div class="field"><label>What they said</label><input class="input" id="cl_note" value="${U.esc(cur.note||'')}" placeholder="e.g. Kim will credit it on the next invoice"></div>

      ${(cur.history||[]).length>1?`<div class="list mt12">${cur.history.slice().reverse().map(h=>`<div class="li">
        <div class="meta"><b>${U.esc((CLAIM[h.status]||{}).label||h.status)}</b><span>${U.fmtDateTime(h.ts)} · ${U.esc(h.by||'—')}${h.note?' · '+U.esc(h.note):''}</span></div></div>`).join('')}</div>`:''}
    </div>`);

    U.modal('💸 Chasing this delivery', wrap, {actions:[
      {label:'Cancel', class:'btn-ghost', onClick:c=>c()},
      {label:'Save', class:'btn-dark', onClick:async(close)=>{
        await saveClaim({id:claim?claim.id:undefined, deliveryId:d.id, supplierId:d.supplierId,
          supplierName:d.supplierName||'', lines:cl.lines,
          amount:Number(U.qs('#cl_amt',wrap).value)||0, status:U.qs('#cl_st',wrap).value,
          note:U.qs('#cl_note',wrap).value.trim()});
        close(); U.toast('Claim updated','green'); if(after) after();
      }}
    ]});
  }

  function detailModal(d, docket, sups, purch, claim, after){
    const st=STATUS[d.status]||STATUS.expected;
    const wrap = U.el(`<div>`+`
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
        ${d.payMethod?`<div class="li"><div class="meta"><span>Paid by</span><b>${U.esc(d.payMethod)}</b></div></div>`:''}
        ${docket?`<div class="li"><div class="meta"><span>Filed as a docket</span><b>${U.esc(docket.invoiceNo||'no number')} · ${U.money(docket.total)}</b></div></div>`:''}
        ${claim?`<div class="li"><div class="meta"><span>Money being chased</span><b>${claim.amount?U.money(claim.amount):'nothing to refund'} · ${U.esc(CLAIM[claim.status].label)}</b></div></div>`:''}
        ${d.note?`<div class="li"><div class="meta"><span>Note</span><b>${U.esc(d.note)}</b></div></div>`:''}
      </div>
      ${claim && claim.note ? `<div class="disclaimer mt12"><span>${CLAIM[claim.status].em}</span><div>${U.esc(claim.note)}</div></div>`:''}
      ${d.photo?`<img src="${d.photo}" style="max-width:100%;border-radius:12px;margin-top:12px">`:''}`}
    </div>`);

    // The delivery and the docket are two views of one event, so each opens the
    // other rather than making anyone go looking.
    const actions = [];
    const bad = (d.lines||[]).some(l=>l.condition && l.condition!=='ok');
    if(bad || claim) actions.push({label: claim?'💸 Update the claim':'💸 Chase it', class:'btn-ghost', onClick:(close)=>{
      close(); claimModal(d, claim, after);
    }});
    if(docket && MKR.stockReceipt) actions.push({label:'🧾 See the docket', class:'btn-dark', onClick:async(close)=>{
      close();
      let venue='My Kitchen';
      try{ const k=await MKR.db.get('kitchens',(MKR.auth.current()||{}).kitchenId||'k_main'); if(k&&k.name) venue=k.name; }catch(e){}
      MKR.stockReceipt.openReceipt(docket, (sups||[]).find(s=>s.id===d.supplierId)||null, venue, purch||[], d);
    }});
    U.modal(`Delivery · ${d.supplierName||'Supplier'}`, wrap, actions.length?{actions}:undefined);
  }

  MKR.deliveries = { COND, STATUS, CLAIM, all, pending, claims, claimableOf, saveClaim, save, confirm, reject, render };
})();
