/* ===== Stock page (owner + manager) =====
   Four tabs over MKR.stock: Stock · Purchases · Suppliers · Forecast.
   Everything here is purchase cost — no sales, no payroll, no reconciliation.
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  const S = ()=>MKR.stock;
  const TABS = [
    {id:'stock',    label:'Stock',     em:'📦'},
    {id:'purchases',label:'Purchases', em:'🧾'},
    {id:'suppliers',label:'Suppliers', em:'🚚'},
    {id:'forecast', label:'Forecast',  em:'📈'},
  ];
  let tab = 'stock';

  async function render(c){
    c.innerHTML = `
      <div class="section-head"><div><h2>Stock &amp; costs</h2><p>Ingredients and tools · what you hold, what it cost, who you buy it from</p></div>
        <div class="row gap8 wrap" id="stockActions"></div></div>
      <div class="tabbar" id="stockTabs">${TABS.map(t=>`<button class="tab ${t.id===tab?'active':''}" data-tab="${t.id}">${t.em} ${t.label}</button>`).join('')}</div>
      <div id="stockBody"></div>`;
    U.qsa('[data-tab]',c).forEach(b=> b.onclick = ()=>{ tab=b.dataset.tab; render(c); });
    const body = U.qs('#stockBody',c), actions = U.qs('#stockActions',c);
    if(tab==='stock')     return stockTab(body, actions, ()=>render(c));
    if(tab==='purchases') return purchasesTab(body, actions, ()=>render(c));
    if(tab==='suppliers') return suppliersTab(body, actions, ()=>render(c));
    if(tab==='forecast')  return forecastTab(body, actions, ()=>render(c));
  }

  // ---------------- Stock ----------------
  async function stockTab(c, actions, reload){
    const rows = await S().overview();
    const total = rows.reduce((t,r)=>t+r.value,0);
    const perish = rows.filter(r=>r.kind==='perishable'), durable = rows.filter(r=>r.kind!=='perishable');
    const flagged = rows.filter(r=>r.low||r.expiring).length;

    actions.innerHTML = `<button class="btn btn-ghost btn-sm" id="stkCount">🔢 Stocktake</button>
      <button class="btn btn-ghost btn-sm" id="stkCsv">⬇️ Export CSV</button>
      <button class="btn btn-dark btn-sm" id="stkAdd">＋ Add item</button>`;

    const group = (title, hint, list)=>`
      <div class="card pad20 mt16">
        <div class="section-title">${U.esc(title)}<span class="faint" style="font-size:12px;font-weight:500">${U.esc(hint)}</span></div>
        ${list.length?`<div class="tablewrap"><table class="dtable">
          <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th><th>Price trend</th><th>Supplier</th><th></th></tr></thead>
          <tbody>${list.map(rowHtml).join('')}</tbody></table></div>`
          :`<div class="empty" style="padding:18px"><div class="em">📦</div><p>Nothing here yet</p></div>`}
      </div>`;

    c.innerHTML = `
      <div class="statline">
        <span class="statcell"><b>${U.money(total)}</b><i>stock value</i></span>
        <span class="statcell"><b>${U.money(perish.reduce((t,r)=>t+r.value,0))}</b><i>perishable</i></span>
        <span class="statcell"><b>${U.money(durable.reduce((t,r)=>t+r.value,0))}</b><i>non-perishable</i></span>
        <span class="statcell"${flagged?' style="color:#8a6410"':''}><b>${flagged}</b><i>needs attention</i></span>
      </div>
      ${group('🥬 Perishable · goes off', 'shelf life tracked from the last delivery', perish)}
      ${group('🥢 Non-perishable · tools & consumables', 'chopsticks, containers, gloves — counted, never expires', durable)}
      <div class="disclaimer mt16"><span>ℹ️</span>Amount = quantity × the last price you actually paid. Price trend compares your two most recent purchase prices for that item.</div>`;

    U.qs('#stkAdd',actions).onclick   = ()=> itemModal(null, reload);
    U.qs('#stkCount',actions).onclick = ()=> stocktakeModal(rows, reload);
    U.qs('#stkCsv',actions).onclick   = ()=>{
      const out=[['Item','Kind','Qty','Unit','Unit price','Amount','Reorder at','Supplier','Last price change']];
      rows.forEach(r=>out.push([r.name, S().KIND[r.kind].label, r.qty, r.unit||'', (+r.price||0).toFixed(2),
        r.value.toFixed(2), r.safety, (r.supplier&&r.supplier.name)||'', r.move.ts?U.fmtDate(r.move.ts):'']));
      out.push([], ['Total stock value','','','','', total.toFixed(2)]);
      U.downloadCSV(`stock-${U.todayISO()}.csv`, out); U.toast('Exported','green');
    };
    U.qsa('[data-edit]',c).forEach(b=> b.onclick=()=>{ const r=rows.find(x=>x.id===b.dataset.edit); itemModal(r, reload); });
    U.qsa('[data-hist]',c).forEach(b=> b.onclick=()=>{ const r=rows.find(x=>x.id===b.dataset.hist); historyModal(r); });
  }

  function rowHtml(r){
    const flags = [
      r.low ? '<span class="pill warn">Low</span>' : '',
      r.expiring ? '<span class="pill danger">Near expiry</span>' : '',
    ].join(' ');
    return `<tr>
      <td><b>${U.esc(r.name)}</b> ${flags}<div class="faint" style="font-size:11.5px">reorder at ${r.safety} ${U.esc(r.unit||'')}${r.kind==='perishable'&&r.shelfLifeDays?` · ${r.shelfLifeDays}-day shelf life`:''}</div></td>
      <td class="num">${r.qty}<small class="faint"> ${U.esc(r.unit||'')}</small></td>
      <td class="num">${U.money(r.price)}</td>
      <td class="num"><b>${U.money(r.value)}</b></td>
      <td><button class="linkish" data-hist="${r.id}">${S().moveBadge(r)}</button></td>
      <td>${r.supplier?U.esc(r.supplier.name):'<span class="faint">—</span>'}</td>
      <td class="num"><button class="btn btn-ghost btn-sm" data-edit="${r.id}">Edit</button></td>
    </tr>`;
  }

  function historyModal(r){
    const h = (r.priceHistory||[]).slice().reverse();
    U.modal(`Price history · ${r.name}`, h.length? `<div class="list">${h.map((p,i)=>{
      const prev=h[i+1];
      const pct = prev&&prev.price ? (p.price-prev.price)/prev.price*100 : 0;
      const badge = !prev ? '<span class="pill ghost">first</span>'
        : pct>0 ? `<span class="pill danger">▲ ${pct.toFixed(1)}%</span>`
        : pct<0 ? `<span class="pill ok">▼ ${Math.abs(pct).toFixed(1)}%</span>` : '<span class="pill ghost">—</span>';
      return `<div class="li"><div class="meta"><b>${U.money(p.price)} / ${U.esc(r.unit||'unit')}</b><span>${U.fmtDateTime(p.ts)}${p.note?' · '+U.esc(p.note):''}</span></div>${badge}</div>`;
    }).join('')}</div>` : `<div class="empty"><div class="em">🏷️</div><p>No price recorded yet — it fills in as you log purchases.</p></div>`);
  }

  async function itemModal(r, after){
    const sups = await S().suppliers();
    const isNew = !r;
    r = r || {kind:'perishable', unit:'kg', qty:0, safety:0, price:0, leadTimeDays:2};
    const wrap = U.el(`<div>
      <div class="field"><label>Name</label><input class="input" id="i_n" value="${U.esc(r.name||'')}" placeholder="e.g. Tomatoes / Chopsticks"></div>
      <div class="field"><label>Type</label><select class="input" id="i_k">
        ${Object.entries(S().KIND).map(([k,v])=>`<option value="${k}" ${r.kind===k?'selected':''}>${v.em} ${v.label} — ${v.hint}</option>`).join('')}
      </select></div>
      <div class="row"><div class="field grow"><label>Quantity on hand</label><input class="input" id="i_q" type="number" step="0.01" value="${r.qty||0}"></div>
        <div class="field grow"><label>Unit</label><input class="input" id="i_u" value="${U.esc(r.unit||'')}" placeholder="kg / box / pcs"></div></div>
      <div class="row"><div class="field grow"><label>Unit price paid (AUD)</label><input class="input" id="i_p" type="number" step="0.01" value="${r.price||0}"></div>
        <div class="field grow"><label>Reorder at</label><input class="input" id="i_s" type="number" step="0.01" value="${r.safety||0}"></div></div>
      <div class="row"><div class="field grow"><label>Usual supplier</label><select class="input" id="i_sup">
          <option value="">— none —</option>
          ${sups.map(s=>`<option value="${s.id}" ${r.supplierId===s.id?'selected':''}>${U.esc(s.name)}</option>`).join('')}
        </select></div>
        <div class="field grow"><label>Delivery lead time (days)</label><input class="input" id="i_lt" type="number" step="1" value="${r.leadTimeDays||2}"></div></div>
      <div class="field" id="i_slWrap"><label>Shelf life (days) — perishable only</label><input class="input" id="i_sl" type="number" step="1" value="${r.shelfLifeDays||''}" placeholder="e.g. 5"></div>
      <div class="disclaimer"><span>💡</span>Changing the unit price here records a price change, so it shows up in the ▲▼ trend.</div>
    </div>`);
    const syncKind=()=>{ U.qs('#i_slWrap',wrap).style.display = U.qs('#i_k',wrap).value==='perishable'?'':'none'; };
    U.qs('#i_k',wrap).onchange=syncKind; syncKind();

    const actions = [{label:'Save', class:'btn-dark', onClick:async(close)=>{
      const name=U.qs('#i_n',wrap).value.trim();
      if(!name){ U.toast('Enter a name','red'); return; }
      const price=Number(U.qs('#i_p',wrap).value)||0;
      const kind=U.qs('#i_k',wrap).value;
      const patch={
        id:r.id, name, kind, unit:U.qs('#i_u',wrap).value.trim()||'units',
        qty:Number(U.qs('#i_q',wrap).value)||0, safety:Number(U.qs('#i_s',wrap).value)||0,
        price, supplierId:U.qs('#i_sup',wrap).value||null,
        leadTimeDays:Number(U.qs('#i_lt',wrap).value)||2,
        shelfLifeDays: kind==='perishable' ? (Number(U.qs('#i_sl',wrap).value)||null) : null,
      };
      if(!r.id || U.round2(r.price)!==U.round2(price)) patch.priceHistory = pushPriceLocal(r, price);
      await S().saveItem(patch);
      close(); U.toast(isNew?'Item added':'Saved','green'); after();
    }}];
    if(!isNew) actions.unshift({label:'Delete', class:'btn-ghost', onClick:async(close)=>{
      if(!(await U.confirm('Delete item', `Remove ${r.name} from stock?`, {ok:'Delete', danger:true}))) return;
      await S().removeItem(r.id); close(); U.toast('Deleted','amber'); after();
    }});
    U.modal(isNew?'Add stock item':'Edit '+r.name, wrap, {actions});
  }
  // Mirrors MKR.stock's internal price-history append for manual price edits.
  function pushPriceLocal(r, price){
    const h=(r.priceHistory||[]).slice(); const p=U.round2(price);
    const last=h[h.length-1];
    if(!last || U.round2(last.price)!==p) h.push({ts:Date.now(), price:p, note:'manual edit'});
    return h.slice(-40);
  }

  function stocktakeModal(rows, after){
    if(!rows.length){ U.toast('Add some stock items first','amber'); return; }
    const wrap = U.el(`<div>
      <p class="muted" style="font-size:13.5px">Walk the shelves and type what you actually count. Anything you leave blank is skipped. Counting regularly is what makes the usage forecast work — it's the only place usage comes from.</p>
      <div class="tablewrap mt12"><table class="dtable">
        <thead><tr><th>Item</th><th class="num">System</th><th class="num" style="width:120px">Counted</th></tr></thead>
        <tbody>${rows.map(r=>`<tr><td><b>${U.esc(r.name)}</b><div class="faint" style="font-size:11.5px">${S().KIND[r.kind].em} ${U.esc(r.unit||'')}</div></td>
          <td class="num faint">${r.qty}</td>
          <td class="num"><input class="input" type="number" step="0.01" data-count="${r.id}" placeholder="—" style="text-align:right"></td></tr>`).join('')}</tbody>
      </table></div>
      <div class="field mt12"><label>Note (optional)</label><input class="input" id="stk_note" placeholder="e.g. Monday morning count"></div>
    </div>`);
    U.modal('Stocktake', wrap, {actions:[
      {label:'Cancel', class:'btn-ghost', onClick:c=>c()},
      {label:'Save count', class:'btn-dark', onClick:async(close)=>{
        const lines = U.qsa('[data-count]',wrap).map(i=>({itemId:i.dataset.count, counted:i.value===''?null:Number(i.value)}));
        const saved = await S().saveStocktake(lines, U.qs('#stk_note',wrap).value.trim());
        if(!saved){ U.toast('Nothing counted','amber'); return; }
        close(); U.toast(`Counted ${saved.lines.length} item(s)`,'green'); after();
      }}
    ]});
  }

  // ---------------- Purchases ----------------
  async function purchasesTab(c, actions, reload){
    const [purch, sups, its] = await Promise.all([S().purchases(), S().suppliers(), S().items()]);
    const spend30 = purch.filter(p=>p.ts>Date.now()-30*864e5).reduce((t,p)=>t+(p.total||0),0);
    actions.innerHTML = `<button class="btn btn-ghost btn-sm" id="purCsv">⬇️ Export CSV</button>
      <button class="btn btn-dark btn-sm" id="purAdd">＋ Record purchase</button>`;
    const nameOf = id=>{ const s=sups.find(x=>x.id===id); return s?s.name:'—'; };

    c.innerHTML = `
      <div class="statline">
        <span class="statcell"><b>${purch.length}</b><i>purchases</i></span>
        <span class="statcell"><b>${U.money0(spend30)}</b><i>spent · 30d</i></span>
        <span class="statcell"><b>${new Set(purch.map(p=>p.supplierId).filter(Boolean)).size}</b><i>suppliers</i></span>
      </div>
      <div class="card pad20 mt16">
        <div class="section-title">Purchase history</div>
        ${purch.length? `<div class="list">${purch.map(p=>`
          <div class="li clickable" data-pur="${p.id}">
            <div class="ds-li-ic">🧾</div>
            <div class="meta"><b>${U.esc(nameOf(p.supplierId))} · ${U.money(p.total)}</b>
              <span>${U.fmtDateTime(p.ts)} · ${(p.lines||[]).length} line${(p.lines||[]).length===1?'':'s'}${p.invoiceNo?' · inv '+U.esc(p.invoiceNo):''} · by ${U.esc(p.by||'—')}</span></div>
            <span class="faint">›</span></div>`).join('')}</div>`
          : `<div class="empty"><div class="em">🧾</div><p>No purchases recorded yet. Log one and the price trend and usage forecast start filling in.</p></div>`}
      </div>`;

    U.qs('#purAdd',actions).onclick = ()=>{
      if(!its.length){ U.toast('Add some stock items first','amber'); return; }
      purchaseModal(sups, its, reload);
    };
    U.qs('#purCsv',actions).onclick = ()=>{
      const out=[['Date','Supplier','Invoice','Item','Qty','Unit price','Amount','Purchase total','By']];
      purch.forEach(p=>(p.lines||[]).forEach((l,i)=>out.push([U.fmtDateTime(p.ts), nameOf(p.supplierId), p.invoiceNo||'',
        l.name, l.qty, (+l.unitPrice||0).toFixed(2), (+l.amount||0).toFixed(2), i===0?(+p.total||0).toFixed(2):'', p.by||''])));
      if(out.length===1){ U.toast('Nothing to export','amber'); return; }
      U.downloadCSV(`purchases-${U.todayISO()}.csv`, out); U.toast('Exported','green');
    };
    U.qsa('[data-pur]',c).forEach(b=> b.onclick=()=>{
      const p=purch.find(x=>x.id===b.dataset.pur);
      U.modal(`Purchase · ${nameOf(p.supplierId)}`, `
        <div class="faint" style="font-size:12.5px;margin-bottom:8px">${U.fmtDateTime(p.ts)}${p.invoiceNo?' · invoice '+U.esc(p.invoiceNo):''} · recorded by ${U.esc(p.by||'—')}</div>
        <div class="tablewrap"><table class="dtable"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
        <tbody>${(p.lines||[]).map(l=>`<tr><td>${U.esc(l.name)}</td><td class="num">${l.qty}</td><td class="num">${U.money(l.unitPrice)}</td><td class="num"><b>${U.money(l.amount)}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3" class="num"><b>Total</b></td><td class="num"><b>${U.money(p.total)}</b></td></tr></tfoot></table></div>
        ${p.note?`<p class="muted mt12" style="font-size:13.5px">${U.esc(p.note)}</p>`:''}`);
    });
  }

  function purchaseModal(sups, its, after){
    const opt = its.map(i=>`<option value="${i.id}">${U.esc(i.name)} (${U.esc(i.unit||'')})</option>`).join('');
    const lineHtml = ()=>`<tr class="pl-row">
      <td><select class="input pl-item">${opt}</select></td>
      <td class="num"><input class="input pl-qty" type="number" step="0.01" value="1" style="text-align:right"></td>
      <td class="num"><input class="input pl-price" type="number" step="0.01" value="0" style="text-align:right"></td>
      <td class="num pl-amt">${U.money(0)}</td>
      <td class="num"><button class="btn btn-ghost btn-sm pl-del" aria-label="remove line">×</button></td></tr>`;
    const wrap = U.el(`<div>
      <div class="row"><div class="field grow"><label>Supplier</label><select class="input" id="p_sup">
        <option value="">— not recorded —</option>${sups.map(s=>`<option value="${s.id}">${U.esc(s.name)}</option>`).join('')}
      </select></div>
      <div class="field grow"><label>Invoice / docket no.</label><input class="input" id="p_inv" placeholder="optional"></div></div>
      <div class="tablewrap"><table class="dtable">
        <thead><tr><th>Item</th><th class="num" style="width:96px">Qty</th><th class="num" style="width:110px">Unit price</th><th class="num" style="width:100px">Amount</th><th></th></tr></thead>
        <tbody id="p_lines">${lineHtml()}</tbody>
        <tfoot><tr><td colspan="3" class="num"><b>Total</b></td><td class="num"><b id="p_total">${U.money(0)}</b></td><td></td></tr></tfoot>
      </table></div>
      <button class="btn btn-ghost btn-sm mt8" id="p_add">＋ Add line</button>
      <div class="field mt12"><label>Note (optional)</label><input class="input" id="p_note" placeholder="e.g. weekly veg run"></div>
      <div class="disclaimer"><span>📦</span>Saving adds these quantities to stock and updates each item's unit price.</div>
    </div>`);
    const body = U.qs('#p_lines',wrap);
    function recalc(){
      let total=0;
      U.qsa('.pl-row',body).forEach(tr=>{
        const amt = S().lineAmount(U.qs('.pl-qty',tr).value, U.qs('.pl-price',tr).value);
        U.qs('.pl-amt',tr).textContent = U.money(amt); total+=amt;
      });
      U.qs('#p_total',wrap).textContent = U.money(total);
    }
    function bindRow(tr){
      U.qs('.pl-qty',tr).oninput = recalc;
      U.qs('.pl-price',tr).oninput = recalc;
      U.qs('.pl-item',tr).onchange = ()=>{
        const it = its.find(i=>i.id===U.qs('.pl-item',tr).value);
        if(it && Number(U.qs('.pl-price',tr).value)===0) U.qs('.pl-price',tr).value = it.price||0;
        recalc();
      };
      U.qs('.pl-del',tr).onclick = ()=>{ if(U.qsa('.pl-row',body).length>1){ tr.remove(); recalc(); } };
    }
    U.qsa('.pl-row',body).forEach(bindRow);
    U.qs('#p_add',wrap).onclick = ()=>{ const tr=U.el(lineHtml()); body.appendChild(tr); bindRow(tr); recalc(); };

    U.modal('Record a purchase', wrap, {actions:[
      {label:'Cancel', class:'btn-ghost', onClick:c=>c()},
      {label:'Save purchase', class:'btn-dark', onClick:async(close)=>{
        const lines = U.qsa('.pl-row',body).map(tr=>{
          const id=U.qs('.pl-item',tr).value; const it=its.find(i=>i.id===id)||{};
          return {itemId:id, name:it.name||'', unit:it.unit||'', qty:Number(U.qs('.pl-qty',tr).value)||0, unitPrice:Number(U.qs('.pl-price',tr).value)||0};
        }).filter(l=>l.qty>0);
        if(!lines.length){ U.toast('Add at least one line','red'); return; }
        await S().savePurchase({supplierId:U.qs('#p_sup',wrap).value||null, invoiceNo:U.qs('#p_inv',wrap).value.trim(),
                                note:U.qs('#p_note',wrap).value.trim(), lines});
        close(); U.toast('Purchase recorded','green'); after();
      }}
    ]});
  }

  // ---------------- Suppliers ----------------
  async function suppliersTab(c, actions, reload){
    const [sups, purch, its] = await Promise.all([S().suppliers(), S().purchases(), S().items()]);
    actions.innerHTML = `<button class="btn btn-dark btn-sm" id="supAdd">＋ Add supplier</button>`;
    c.innerHTML = sups.length ? `<div class="grid g2 mt16" style="align-items:start">${sups.map(s=>{
        const mine = purch.filter(p=>p.supplierId===s.id);
        const spend = mine.reduce((t,p)=>t+(p.total||0),0);
        const last = mine[0];
        const buys = its.filter(i=>i.supplierId===s.id).map(i=>i.name);
        return `<div class="card pad20">
          <div class="section-title">🚚 ${U.esc(s.name)}<button class="btn btn-ghost btn-sm" data-sup="${s.id}">Edit</button></div>
          <div class="list">
            <div class="li"><div class="meta"><span>Contact</span><b>${U.esc(s.contact||'—')}</b></div></div>
            <div class="li"><div class="meta"><span>Phone</span><b>${s.phone?`<a href="tel:${U.esc(s.phone)}">${U.esc(s.phone)}</a>`:'—'}</b></div></div>
            <div class="li"><div class="meta"><span>Email</span><b>${s.email?`<a href="mailto:${U.esc(s.email)}">${U.esc(s.email)}</a>`:'—'}</b></div></div>
            <div class="li"><div class="meta"><span>Bought from ${mine.length} time${mine.length===1?'':'s'}</span><b>${U.money(spend)} total</b></div></div>
            <div class="li"><div class="meta"><span>Last purchase</span><b>${last?U.fmtDate(last.ts):'—'}</b></div></div>
          </div>
          ${buys.length?`<p class="faint" style="font-size:12px;margin-top:10px">Usually supplies: ${U.esc(buys.join(', '))}</p>`:''}
          ${s.note?`<p class="muted" style="font-size:13px;margin-top:8px">${U.esc(s.note)}</p>`:''}
        </div>`;
      }).join('')}</div>`
      : `<div class="empty mt16"><div class="em">🚚</div><p>No suppliers yet. Add the people you actually ring when you need stock — name, phone, what they supply.</p></div>`;
    U.qs('#supAdd',actions).onclick = ()=> supplierModal(null, reload);
    U.qsa('[data-sup]',c).forEach(b=> b.onclick=()=> supplierModal(sups.find(x=>x.id===b.dataset.sup), reload));
  }

  function supplierModal(s, after){
    const isNew=!s; s=s||{};
    const wrap = U.el(`<div>
      <div class="field"><label>Business name</label><input class="input" id="s_n" value="${U.esc(s.name||'')}" placeholder="e.g. Vic Fresh Produce"></div>
      <div class="field"><label>Who you contact</label><input class="input" id="s_c" value="${U.esc(s.contact||'')}" placeholder="e.g. Tony (driver)"></div>
      <div class="row"><div class="field grow"><label>Phone</label><input class="input" id="s_p" value="${U.esc(s.phone||'')}"></div>
        <div class="field grow"><label>Email</label><input class="input" id="s_e" value="${U.esc(s.email||'')}"></div></div>
      <div class="field"><label>Notes</label><input class="input" id="s_note" value="${U.esc(s.note||'')}" placeholder="e.g. delivers Tue &amp; Fri before 9am"></div>
    </div>`);
    const actions=[{label:'Save', class:'btn-dark', onClick:async(close)=>{
      const name=U.qs('#s_n',wrap).value.trim(); if(!name){ U.toast('Enter a name','red'); return; }
      await MKR.db.put('suppliers',{id:s.id||U.uid('sup'), name, contact:U.qs('#s_c',wrap).value.trim(),
        phone:U.qs('#s_p',wrap).value.trim(), email:U.qs('#s_e',wrap).value.trim(),
        note:U.qs('#s_note',wrap).value.trim(), kitchenId:(MKR.auth.current()||{}).kitchenId||'k_main'});
      close(); U.toast('Saved','green'); after();
    }}];
    if(!isNew) actions.unshift({label:'Delete', class:'btn-ghost', onClick:async(close)=>{
      if(!(await U.confirm('Delete supplier', `Remove ${s.name}?`, {ok:'Delete', danger:true}))) return;
      await MKR.db.put('suppliers',{id:s.id, archived:true}); close(); U.toast('Deleted','amber'); after();
    }});
    U.modal(isNew?'Add supplier':'Edit supplier', wrap, {actions});
  }

  // ---------------- Forecast ----------------
  async function forecastTab(c, actions){
    const rows = await S().overview();
    const known = rows.filter(r=>r.usageSamples>0);
    const reorder = rows.filter(r=>r.low || r.short);
    actions.innerHTML = `<button class="btn btn-ghost btn-sm" id="fcList">🛒 Build order list</button>
      <button class="btn btn-dark btn-sm" id="fcAsk">✨ Ask AI</button>`;

    const suggest = (r)=>{
      // Cover the lead time plus a week, minus what's on the shelf.
      const target = r.daily>0 ? r.daily*((+r.leadTimeDays||2)+7) : (+r.safety||0)*2;
      return Math.max(0, U.round2(target - (+r.qty||0)));
    };

    c.innerHTML = `
      <div class="alert info mt16"><span>🤖</span><div><b>Usage is measured, not guessed.</b> There's no till in this app, so consumption comes from your stocktakes: what you counted last time, plus what you bought since, minus what you counted this time. Count twice and this page comes alive.</div></div>
      <div class="card pad20 mt16">
        <div class="section-title">📈 Usage &amp; days of cover</div>
        ${rows.length?`<div class="tablewrap"><table class="dtable">
          <thead><tr><th>Item</th><th class="num">On hand</th><th class="num">Used / day</th><th class="num">Days of cover</th><th class="num">Suggest order</th><th class="num">Est. cost</th></tr></thead>
          <tbody>${rows.map(r=>{
            const sg = suggest(r), cost = S().lineAmount(sg, r.price);
            const cover = r.cover==null ? '<span class="faint">needs 2 counts</span>'
              : `<b style="color:${r.short?'var(--red)':'inherit'}">${r.cover.toFixed(1)}</b>`;
            return `<tr><td><b>${U.esc(r.name)}</b> ${r.low?'<span class="pill warn">Low</span>':''}<div class="faint" style="font-size:11.5px">${S().KIND[r.kind].em} ${r.usageSamples?`from ${r.usageSamples} count interval${r.usageSamples===1?'':'s'}`:'no usage data yet'}</div></td>
              <td class="num">${r.qty} <small class="faint">${U.esc(r.unit||'')}</small></td>
              <td class="num">${r.daily?r.daily.toFixed(2):'—'}</td>
              <td class="num">${cover}</td>
              <td class="num">${sg?`<b>${sg}</b> <small class="faint">${U.esc(r.unit||'')}</small>`:'—'}</td>
              <td class="num">${sg?U.money(cost):'—'}</td></tr>`;
          }).join('')}</tbody></table></div>`
          :`<div class="empty" style="padding:18px"><div class="em">📈</div><p>No stock items yet</p></div>`}
      </div>
      <div class="card pad20 mt16"><div class="section-title">✨ What the assistant says</div><div id="fcAi"><p class="muted" style="font-size:13.5px">Tap <b>Ask AI</b> for a plain-English read on what to order and what's creeping up in price.</p></div></div>`;

    U.qs('#fcList',actions).onclick = ()=>{
      const list = rows.map(r=>({r, q:suggest(r)})).filter(x=>x.q>0);
      if(!list.length){ U.toast('Nothing needs ordering','green'); return; }
      U.modal('Order list', `<div class="list">${list.map(({r,q})=>`
        <div class="li"><div class="ds-li-ic">${S().KIND[r.kind].em}</div>
          <div class="meta"><b>${U.esc(r.name)} · ${q} ${U.esc(r.unit||'')}</b>
            <span>${r.supplier?U.esc(r.supplier.name)+(r.supplier.phone?' · '+U.esc(r.supplier.phone):''):'no supplier set'}</span></div>
          <b>${U.money(S().lineAmount(q,r.price))}</b></div>`).join('')}</div>
        <div class="cart-total mt8"><span>Estimated cost</span><span class="v">${U.money(list.reduce((t,x)=>t+S().lineAmount(x.q,x.r.price),0))}</span></div>`,
        {actions:[{label:'Export CSV', class:'btn-dark', onClick:(close)=>{
          const out=[['Item','Order qty','Unit','Supplier','Contact','Phone','Est. cost']];
          list.forEach(({r,q})=>out.push([r.name,q,r.unit||'',(r.supplier&&r.supplier.name)||'',(r.supplier&&r.supplier.contact)||'',(r.supplier&&r.supplier.phone)||'',S().lineAmount(q,r.price).toFixed(2)]));
          U.downloadCSV(`order-list-${U.todayISO()}.csv`, out); close(); U.toast('Exported','green');
        }}]});
    };

    U.qs('#fcAsk',actions).onclick = async()=>{
      const box=U.qs('#fcAi',c); box.innerHTML=`<p class="muted">Thinking…</p>`;
      const lines = rows.slice(0,25).map(r=>{
        const m=r.move;
        return `${r.name} (${r.kind}): ${r.qty}${r.unit||''} on hand, ${r.daily?r.daily.toFixed(2)+'/day used':'usage unknown'}, `
             + `${r.cover!=null?r.cover.toFixed(1)+' days cover':'no cover estimate'}, last price $${(+r.price||0).toFixed(2)}`
             + `${m.dir!=='flat'?`, price ${m.dir} ${Math.abs(m.pct).toFixed(1)}%`:''}`;
      }).join('\n');
      const q = `Here is my restaurant's current stock position:\n${lines}\n\n`
              + `In 4-6 short bullet points: what should I order in the next few days, what is at risk of running out or going off, and which ingredient prices are creeping up? Keep it practical for a small restaurant owner. Do not give financial or legal advice.`;
      let out=null;
      try{ out = MKR.assistant && MKR.assistant.llm ? await MKR.assistant.llm(q,{role:'owner'}) : null; }catch(e){}
      box.innerHTML = out || `<div class="alert amber"><span>⚠️</span><div>The AI assistant isn't reachable right now. The table above still tells you what's short — sort by days of cover.</div></div>`;
    };
  }

  MKR.stockView = { render };
})();
