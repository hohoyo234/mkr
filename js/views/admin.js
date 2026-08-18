/* ===== 全能助手 · AI Admin agent (owner full-page) =====
   The owner just types a request and the assistant does it: answer any data
   question, or perform a real in-app action (stocktake, order list, booking,
   queue, draft a summary). Two modes:
     • 手动 (manual)  — proposes the action, you tap 确认 before it runs.
     • 自动 (auto)    — runs it immediately and reports back.
   Anything that isn't a known action is answered via MKR.assistant (KB + live
   data + optional LLM). Actions are local-first so they work without any
   backend redeploy.
*/
window.MKR = window.MKR || {}; MKR.views = MKR.views || {};
(function(){
  const U = MKR.util;
  const MODE_KEY = 'mkr_ai_mode';
  const mode    = ()=> localStorage.getItem(MODE_KEY)==='auto' ? 'auto' : 'manual';
  const setMode = (m)=> localStorage.setItem(MODE_KEY, m);
  const kid = ()=> (MKR.auth.current()||{}).kitchenId || 'k_main';

  let logEl=null;

  function numOf(re, t){ const m=t.match(re); return m?+m[1]:null; }
  // Safe YYYY-MM-DD from a possibly-missing/invalid timestamp (never throws).

  // ---------- a compact daily summary (read-only) ----------
  async function dailySummary(){
    const today=U.todayISO();
    const staff=(await MKR.db.getAll('users')).filter(u=>u.role!=='owner' && !u.offboarded);
    const todayIdx=(new Date().getDay()+6)%7;
    const onToday=(await MKR.roster.shiftsFor(MKR.roster.thisWeek())).filter(x=>x.day===todayIdx);
    const tasks=await MKR.tasks.today();
    let rows=[], pend=[], tr=[];
    try{ rows=await MKR.stock.overview(); }catch(e){}
    try{ pend=await MKR.deliveries.pending(); }catch(e){}
    try{ tr=(await MKR.training.trainings()).filter(x=>x.status!=='done'); }catch(e){}
    const low=rows.filter(r=>r.low||r.short||r.expiring);
    const val=rows.reduce((t,r)=>t+r.value,0);
    let waiting=0, bookings=0;
    try{ waiting=(await MKR.db.getAll('waitlist')).filter(q=>q.status==='waiting'||q.status==='called').length;
         bookings=(await MKR.db.getAll('reservations')).filter(r=>r.status==='booked'&&r.date>=today).length; }catch(e){}
    return `${MKR.ui.icon('bars')} <b>今日运营总结</b><br>
      • 今天 <b>${onToday.length}</b> 个班 · 团队 ${staff.filter(u=>u.role==='staff').length} 员工 / ${staff.filter(u=>u.role==='manager').length} 经理<br>
      • 今日任务 ${tasks.filter(t=>t.done).length}/${tasks.length} 完成<br>
      • 库存价值 <b>${U.money(val)}</b>（${rows.length} 项）${low.length?` · ${MKR.ui.icon('warning')} ${low.length} 项偏低/临期：${low.slice(0,4).map(r=>r.name).join('、')}`:' · 暂无告急'}<br>
      • ${pend.length} 单待确认送货 · ${tr.length} 项培训未完成<br>
      • ${waiting} 桌等位 · ${bookings} 个预订`;
  }

  // ---------- action skills: return null OR {desc, run, [readOnly]} ----------
  const SKILLS = [
    // 库存 / 要订什么货（只读）
    async function(t){
      const low=t.toLowerCase();
      if(!/(库存|存货|原料|食材|还剩|要订|订货|补货|stock|inventory|order list|running low)/.test(low)) return null;
      return { desc:'查库存并列出建议订货清单（只读）', readOnly:true, run:async()=>{
        let rows=[]; try{ rows=await MKR.stock.overview(); }catch(e){}
        if(!rows.length) return '还没有建立库存项目。';
        const val=rows.reduce((a,r)=>a+r.value,0);
        const need=rows.filter(r=>r.low||r.short||r.expiring);
        if(!need.length) return `${MKR.ui.icon('box')} 库存价值 <b>${U.money(val)}</b>（${rows.length} 项），目前没有需要补的。`;
        return `${MKR.ui.icon('box')} 库存价值 <b>${U.money(val)}</b>（${rows.length} 项）。建议关注：<br>`
          + need.map(r=>`• ${U.esc(r.name)} — 还剩 ${r.qty} ${U.esc(r.unit||'')}${r.cover!=null?`（约 ${r.cover.toFixed(1)} 天）`:''}${r.expiring?' · 临期':''}${r.supplier?` · ${U.esc(r.supplier.name)}${r.supplier.phone?' '+U.esc(r.supplier.phone):''}`:''}`).join('<br>');
      } };
    },
    // 盘点提醒（只读）
    async function(t){
      const low=t.toLowerCase();
      if(!/(盘点|点货|数库存|stocktake|count stock)/.test(low)) return null;
      return { desc:'说明怎么盘点（只读）', readOnly:true, run:async()=>
        '打开 <b>库存与成本 → 盘点</b>，把实际数到的数量填进去。这个 app 没有收银系统，用量完全来自两次盘点之间的差额，所以盘点做得越勤，需求预测越准。' };
    },
    // 加排队
    async function(t){
      const low=t.toLowerCase();
      if(!/(排队|取号|候位|waitlist|queue)/.test(low)) return null;
      const party = numOf(/(\d+)\s*(人|位|pax|people|ppl)/, low) || 2;
      const name = t.replace(/(排队|取号|候位|waitlist|queue|加入|帮我|把|一位|客人)/g,'').replace(/(\d+)\s*(人|位|pax|people|ppl)/g,'').trim();
      return { desc:`把${name?'「'+name+'」':'一位客人'}（${party} 人）加入排队`,
        run:async()=>{ const n = await MKR.portals.manager.nextTicket(); await MKR.db.put('waitlist',{num:n, name, partySize:party, status:'waiting', kitchenId:kid()}); return `⏳ 已加入排队，号码 <b>#${n}</b>。`; } };
    },
    // 加预订
    async function(t){
      const low=t.toLowerCase();
      if(!/(预订|订位|订桌|book|reserv)/.test(low)) return null;
      const party = numOf(/(\d+)\s*(人|位|pax|people|ppl)/, low) || 2;
      let date=U.todayISO(), dateLabel='今天';
      if(/明天|tomorrow/.test(low)){ date=U.isoDate(Date.now()+864e5); dateLabel=date; }
      else if(/后天/.test(low)){ date=U.isoDate(Date.now()+2*864e5); dateLabel=date; }
      let time=''; const tm=low.match(/(\d{1,2})\s*[:点]\s*(\d{0,2})/); if(tm){ time=String(+tm[1]).padStart(2,'0')+':'+(tm[2]?tm[2].padStart(2,'0'):'00'); }
      const name = t.replace(/(预订|订位|订桌|book a table|book|reservation|reserve|帮我|明天|后天|今天|tomorrow|today)/gi,'').replace(/(\d+)\s*(人|位|pax|people|ppl)/g,'').replace(/(\d{1,2})\s*[:点]\s*(\d{0,2})/g,'').trim();
      return { desc:`新建预订：${name||'客人'} · ${dateLabel} ${time||'(时间未填)'} · ${party} 人`,
        run:async()=>{ await MKR.db.put('reservations',{name:name||'客人', partySize:party, date, time, status:'booked', kitchenId:kid()}); await MKR.audit.log({action:'booking.create', desc:`New booking · ${name||'客人'} · AI`}); return `${MKR.ui.icon('calendar')} 预订已建：${name||'客人'} · ${dateLabel} ${time} · ${party} 人。`; } };
    },
    // 日报 / 周报 / 总结 (read-only)
    async function(t){
      const low=t.toLowerCase();
      if(!/(日报|周报|总结|汇报|summary|生意怎么|怎么样|今天.*如何|today.*going)/.test(low)) return null;
      return { desc:'生成今日经营总结（只读）', readOnly:true, run:async()=> await dailySummary() };
    },
    // 发邮件 / 发验证邮件 (needs send-email deployed; verify needs verify-setup.sql)
    async function(t){
      const em = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if(!em || !/(邮件|email|发信|mail|验证|verify)/i.test(t)) return null;
      const to = em[0];
      const isVerify = /验证|verify/i.test(t);
      return { desc:`给 <b>${U.esc(to)}</b> 发一封${isVerify?'<b>验证</b>':'通知'}邮件`,
        run:async()=>{
          if(!MKR.email || !MKR.email.send) return '发信功能尚未启用（需部署 send-email 边缘函数）。';
          const brand = ((await MKR.db.meta('brand'))||{}).name || 'My Kitchen';
          let subject, html;
          if(isVerify){
            const code = String(Math.floor(100000 + Math.random()*900000));
            try{ await MKR.db.put('verifications', { email:to.toLowerCase(), code, purpose:'email', used:false,
              expires:new Date(Date.now()+30*60000).toISOString(), kitchenId:kid() }); }catch(e){}
            const url = location.origin + location.pathname + '#/verify/' + encodeURIComponent(to);
            subject = `${brand} · 邮箱验证 Verify your email`;
            html = MKR.email.template({ brand, title:'确认你的邮箱 / Confirm your email',
              intro:'请用下面的验证码完成验证，或点击按钮前往验证页面。Use the code below, or tap the button to verify.',
              code, ctaUrl:url, ctaLabel:'前往验证 / Verify' });
          } else {
            const body = t.replace(em[0],'').replace(/(发邮件|发信|email|mail|给|to)/gi,'').trim() || '这是一封来自 My Kitchen 全能助手的消息。';
            subject = `${brand} · 通知`;
            html = MKR.email.template({ brand, title:'通知 / Message', intro:body });
          }
          const r = await MKR.email.send({ to, subject, html });
          return r && r.ok ? `已发送${isVerify?'验证码':''}到 ${U.esc(to)}。${isVerify?'（让对方查收邮件、输入验证码即可）':''}` : `发送失败：${U.esc((r&&r.error)||'未知错误（多半是 send-email 还没部署）')}。`;
        } };
    },
  ];

  async function detect(text){
    for(const skill of SKILLS){ try{ const a=await skill(text); if(a) return a; }catch(e){} }
    return null;
  }

  // ---------- chat UI ----------
  function bubble(role, html){
    const m=U.el(`<div class="aa-msg ${role}">${html}</div>`); logEl.appendChild(m); logEl.scrollTop=logEl.scrollHeight; return m;
  }
  function intro(){
    return `我是你的全能助手，把事情交给我就行：<b>查库存 / 看今天谁上班 / 排队 / 加预订 / 起草今日总结</b>，或者直接问我任何问题。<br>
      <span class="faint" style="font-size:12px">例如：「今天运营怎么样」「库存还剩多少」「什么要订货了」「明天 7 点 4 人 张先生 订位」「发邮件验证 a@b.com」</span>`;
  }
  const CHIPS = ['今天运营怎么样','库存还剩多少','什么要订货了','明天19点4人订位','生成今日总结'];

  async function handle(text){
    text=String(text||'').trim(); if(!text) return;
    bubble('user', U.esc(text));
    const thinking = bubble('bot', '<span class="ai-dots"><i></i><i></i><i></i></span>');
    const action = await detect(text);
    if(!action){
      // not an action → answer (data lookup / KB / LLM)
      let html='…'; try{ html = await MKR.assistant.answer(text); }catch(e){ html='抱歉，我没能处理这个。'; }
      thinking.innerHTML = html;
      thinking.querySelectorAll('[data-jump]').forEach(a=>a.onclick=(e)=>{ e.preventDefault(); location.hash=a.dataset.jump; });
      // Wire the suggestion chips returned by the assistant (otherwise they look clickable but do nothing).
      thinking.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>handle(b.dataset.q));
      logEl.scrollTop=logEl.scrollHeight; return;
    }
    if(action.readOnly || mode()==='auto'){
      try{ const res=await action.run(); thinking.innerHTML = res; }
      catch(e){ thinking.innerHTML='执行出错了，请稍后再试。'; }
      logEl.scrollTop=logEl.scrollHeight; return;
    }
    // manual mode → confirmation card
    thinking.innerHTML = `<div class="aa-confirm"><div>${MKR.ui.icon('search')} ${action.desc}？</div>
      <div class="row gap8 mt8"><button class="btn btn-green btn-sm" data-ok>确认执行</button><button class="btn btn-ghost btn-sm" data-no>取消</button></div></div>`;
    thinking.querySelector('[data-ok]').onclick=async()=>{
      thinking.innerHTML='<span class="ai-dots"><i></i><i></i><i></i></span>';
      try{ const res=await action.run(); thinking.innerHTML=res; }catch(e){ thinking.innerHTML='执行出错了。'; }
      logEl.scrollTop=logEl.scrollHeight;
    };
    thinking.querySelector('[data-no]').onclick=()=>{ thinking.innerHTML='好的，已取消。'; };
  }

  async function render(c){
    c.innerHTML = `
      <div class="ai-admin">
        <div class="aa-head">
          <div class="row center gap8"><div class="aa-orb">${MKR.ui.icon('sparkle')}</div>
            <div><h2 style="margin:0;font-size:20px">全能助手</h2><div class="faint" id="aaMode" style="font-size:12px">${mode()==='auto'?'自动式':'手动式'} · AI 驱动</div></div></div>
          <button class="btn btn-ghost btn-sm" id="aaToggle">${mode()==='auto'?'自动模式':'手动模式'}</button>
        </div>
        <div class="aa-log" id="aaLog"></div>
        <div class="aa-chips" id="aaChips">${CHIPS.map(q=>`<button class="aa-chip" data-q="${U.esc(q)}">${U.esc(q)}</button>`).join('')}</div>
        <form class="aa-input" id="aaForm"><input class="input" id="aaInput" placeholder="把事情交给我…" autocomplete="off"><button class="btn btn-dark" type="submit" aria-label="发送">${MKR.ui.icon('send')}</button></form>
      </div>`;
    logEl = U.qs('#aaLog',c);
    bubble('bot', intro());
    U.qs('#aaToggle',c).onclick=()=>{ setMode(mode()==='auto'?'manual':'auto'); render(c); };
    U.qsa('.aa-chip',c).forEach(b=>b.onclick=()=>handle(b.dataset.q));
    U.qs('#aaForm',c).onsubmit=(e)=>{ e.preventDefault(); const i=U.qs('#aaInput',c); const v=i.value; i.value=''; handle(v); };
    setTimeout(()=>{ const i=U.qs('#aaInput',c); if(i) i.focus(); },50);
  }

  MKR.views.admin = { render };
})();
