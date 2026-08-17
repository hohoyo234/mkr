/* ===== Hash router + app shell ===== */
window.MKR = window.MKR || {};
(function(){
  const U = ()=>MKR.util;

  function parse(){
    const h = (location.hash||'').replace(/^#\/?/,''); // e.g. owner/team/u_amy
    const [role, section, arg] = h.split('/');
    return { role: role||'', section: section||'', arg: arg||'' };
  }

  let _brandFor = null;   // kitchenId whose brand is currently applied

  async function render(){
    const root = document.getElementById('root');
    let { role, section, arg } = parse();

    // Public email-verification page (no login): #/verify/<email>
    if(role==='verify'){ return MKR.verify.render(root, section); }
    // Public manager/staff join-by-link route: #/join/<kitchenId>
    if(role==='join'){ return MKR.join.render(root, section); }

    const sess = MKR.auth.current();

    // Not signed in → login page
    if(role==='login' || !sess){
      if(role!=='login' && sess){ /* keep */ } else { return MKR.portals.login.render(root); }
    }
    if(!sess){ return MKR.portals.login.render(root); }

    // The venue's colour, applied once per venue rather than per navigation.
    // app.js only loads it for a RESTORED session, which misses both a fresh
    // sign-in and preview mode — so the app painted in the default orange for
    // exactly the people seeing it for the first time.
    if(_brandFor !== sess.kitchenId){
      _brandFor = sess.kitchenId;
      try{ await MKR.brand.load(); }catch(e){}
    }

    // Role guard: non-owners must stay in their own portal; the owner (super admin) can view any portal
    const viewingRole = role || sess.role;
    if(viewingRole!==sess.role && sess.role!=='owner'){ location.hash = `#/${sess.role}/${MKR.portals[sess.role].home}`; return; }
    const portal = MKR.portals[viewingRole]; if(!portal){ location.hash=`#/${sess.role}/${MKR.portals[sess.role].home}`; return; }
    if(!section){ location.hash = `#/${viewingRole}/${portal.home}`; return; }

    await shell(root, portal, sess, section, arg, viewingRole);
  }

  async function shell(root, portal, sess, section, arg, viewingRole){
    viewingRole = viewingRole || sess.role;
    const preview = viewingRole!==sess.role;   // owner previewing another portal
    // Filter visible nav by feature switches / permissions (judged by the viewed portal's role; owner passes through)
    const can = (n)=> !n.feature || (MKR.features && MKR.features.can(n.feature, sess.role==='owner'?'owner':viewingRole));
    const visNav = portal.nav.filter(can);

    // Guard: directly visiting a disabled / unauthorized feature → back to home
    const target = portal.nav.find(n=>n.id===section);
    if(target && !can(target)){ MKR.util.toast('That feature is turned off or not permitted','amber'); location.hash=`#/${viewingRole}/${portal.home}`; return; }

    // Compute nav badges (e.g. unread alert count)
    const badges = portal.badges ? await portal.badges() : {};
    // Fifteen rows of identical weight is a wall, not a menu. One rule splits
    // it: the pages that carry the day's work sit above the line, the ones you
    // open when something needs setting up or checking sit below it.
    const ADMIN = ['performance','branches','feedback','audit','switch','settings','setup','restaurants'];
    const navRow = (n)=>{
      const active = n.id===section ? 'active':'';
      const badge = badges[n.id] ? `<span class="badge">${badges[n.id]}</span>`:'';
      const ic = MKR.ui.navIcon(n.id);
      // The title is what you get when the menu is folded down to icons — the
      // label itself is hidden with font-size:0, so hovering has to say it.
      return `<a class="nav-item ${active}" href="#/${viewingRole}/${n.id}" title="${MKR.util.esc(n.label)}"><span class="em">${ic}</span>${n.label}${badge}</a>`;
    };
    const daily = visNav.filter(n=>!ADMIN.includes(n.id));
    const admin = visNav.filter(n=> ADMIN.includes(n.id));
    const nav = daily.map(navRow).join('')
      + (admin.length ? `<div class="nav-sep">Manage</div>` + admin.map(navRow).join('') : '');

    // The bottom bar holds four pages and a way to the rest. It used to hold the
    // first five full stop, which on a phone left Tasks, Alerts, Team, Settings
    // and the log-out button with no entry point at all — the sidebar that
    // carries them is display:none under 880px.
    const mobileTop = visNav.slice(0,4);
    const mobileRest = visNav.slice(4);
    const restActive = mobileRest.some(n=>n.id===section) ? 'active':'';
    const mobileNav = mobileTop.map(n=>{
      const active = n.id===section ? 'active':'';
      const ic = MKR.ui.navIcon(n.id);
      const badge = badges[n.id] ? `<span class="mn-badge">${badges[n.id]}</span>`:'';
      return `<a class="${active}" href="#/${viewingRole}/${n.id}"><span class="em">${ic}${badge}</span>${n.short||n.label}</a>`;
    }).join('') + (mobileRest.length ? `<button class="${restActive}" id="navMore" aria-haspopup="dialog" aria-label="More pages">
        <span class="em">${MKR.ui.icon('dots')}${
          mobileRest.reduce((t,n)=>t+(badges[n.id]||0),0) ? `<span class="mn-badge">${mobileRest.reduce((t,n)=>t+(badges[n.id]||0),0)}</span>`:''
        }</span>More</button>` : '');

    // Everything the bottom bar could not fit, plus the two account actions that
    // only ever lived in the sidebar footer.
    const moreSheet = mobileRest.map(n=>{
      const ic = MKR.ui.navIcon(n.id);
      const tone = MKR.ui.tone(n.id);
      const badge = badges[n.id] ? `<span class="ns-badge">${badges[n.id]}</span>`:'';
      return `<a class="ns-item t-${tone} ${n.id===section?'on':''}" href="#/${viewingRole}/${n.id}">
        <span class="ns-ic">${ic}</span>${MKR.util.esc(n.label)}${badge}</a>`;
    }).join('');

    const cur = portal.nav.find(n=>n.id===section) || visNav[0] || portal.nav[0];

    // The sidebar is its own scroll container and the shell is rebuilt on every
    // navigation — remember how far it was scrolled so it doesn't jump back to
    // the top each time you switch tabs.
    const prevSidebar = root.querySelector('.sidebar');
    const savedSideScroll = prevSidebar ? prevSidebar.scrollTop : 0;

    // Brand the shell with the venue's own logo + name (set by the owner).
    let brandName='My Kitchen', brandLogo=null;
    if(sess.kitchenId && viewingRole!=='superadmin'){
      try{ const k=await MKR.db.get('kitchens', sess.kitchenId); if(k){ brandName=k.name||brandName; brandLogo=k.logo||null; } }catch(e){}
    }
    // Every branch this owner can look at. Switching is a thing you do from
    // wherever you happen to be — noticing on the stock page that you're in the
    // wrong venue and having to walk back through Branches to fix it is how
    // someone ends up ordering Sydney's tomatoes for Melbourne.
    let branches = [];
    if(sess.role==='owner' && sess.kitchenId){
      try{
        branches = (await MKR.db.getAll('kitchens'))
          .filter(k=> k.ownerId===sess.id || k.id===sess.kitchenId);
      }catch(e){}
    }

    const brandLetter=(brandName||'M').trim().charAt(0).toUpperCase()||'M';
    const logoHtml = brandLogo
      ? `<div class="logo" style="overflow:hidden;padding:0"><img src="${brandLogo}" alt="" style="width:100%;height:100%;object-fit:cover"></div>`
      : `<div class="logo">${MKR.util.esc(brandLetter)}</div>`;

    // Collapsed sidebar is a per-device preference, applied before first paint so
    // the shell never renders wide and then snaps narrow. Three states, not two:
    // unset lets the width decide (the narrow-window icon rail), 'mini' and
    // 'full' are the owner overruling it in either direction.
    const sidePref = (function(){ try{ return localStorage.getItem('mkr_side')||''; }catch(e){ return ''; } })();
    document.body.classList.toggle('side-mini', sidePref==='mini');
    document.body.classList.toggle('side-full', sidePref==='full');

    root.innerHTML = `
      <div class="shell">
        <aside class="sidebar">
          <div class="side-brand">${logoHtml}<div class="grow" style="min-width:0"><b title="${MKR.util.esc(brandName)}">${MKR.util.esc(brandName)}</b>
              ${branches.length>1
                ? `<select class="branch-pick" id="branchPick" aria-label="Which branch you are looking at">
                     ${branches.map(k=>`<option value="${MKR.util.esc(k.id)}" ${k.id===sess.kitchenId?'selected':''}>${MKR.util.esc(k.name)}</option>`).join('')}
                   </select>`
                : `<small>${MKR.auth.roleName(viewingRole)}</small>`}</div>
            <button class="side-toggle" id="sideToggle" aria-label="${sidePref==='mini'?'Open the menu':'Fold the menu'}" title="${sidePref==='mini'?'Open the menu':'Fold the menu'}"></button>
          </div>
          ${nav}
          <div class="side-foot">
            <div class="who" style="margin-bottom:10px"><div class="ava">${sess.emoji||MKR.util.initials(sess.name)}</div><div><b style="font-size:14px">${MKR.util.esc(sess.name)}</b><div class="faint" style="font-size:11.5px">${MKR.auth.roleName(sess.role)}${preview?' · previewing '+MKR.auth.roleName(viewingRole):''}</div></div></div>
            <div class="row gap6"><button class="btn btn-ghost btn-sm grow" id="pwBtn" title="Password">${MKR.ui.icon('key')} Password</button><button class="btn btn-ghost btn-sm grow" id="logoutBtn" title="Log out">Log out</button></div>
          </div>
        </aside>
        <div class="main">
          <div id="offbar" class="offbar hidden">${MKR.ui.icon('warning')} Network lost · running in offline-safe mode — keep working, it will sync automatically when back online</div>
          ${sess._preview?`<div class="offbar" style="background:var(--accent-soft);color:var(--accent-ink);border-color:#e6c9b4">${MKR.ui.icon('eye')} Preview · ${MKR.auth.roleName(viewingRole)} · sample data on this device only, nothing is saved to a real venue &nbsp;<a href="#exit" id="exitPrev" style="text-decoration:underline;font-weight:700">Exit preview →</a></div>`:''}
          ${sess._impersonating?`<div class="offbar" style="background:var(--blue-soft);color:var(--blue);border-color:#c4d6f3">${MKR.ui.icon('shield')} Super Admin preview · ${MKR.auth.roleName(viewingRole)} &nbsp;<a href="#exit" id="exitImp" style="text-decoration:underline;font-weight:700">Back to Super Admin →</a></div>`:''}
          ${(preview && !sess._impersonating)?`<div class="offbar" style="background:var(--blue-soft);color:var(--blue);border-color:#c4d6f3">${MKR.ui.icon('eye')} Owner preview · ${MKR.auth.roleName(viewingRole)} &nbsp;<a href="#/owner/switch" style="text-decoration:underline;font-weight:700">Back to Owner →</a></div>`:''}
          <div class="topbar">
            <div class="topbar-title"><h1>${cur.label}</h1></div>
            <div class="topbar-right">
              ${MKR.i18n?MKR.i18n.switcher():''}
              <div id="netlight" class="netlight online"><span class="lamp"></span>Connected</div>
            </div>
          </div>
          <div class="content" id="view"></div>
        </div>
        <nav class="mobile-nav">${mobileNav}</nav>
        <div class="navsheet-back hidden" id="navSheet">
          <div class="navsheet" role="dialog" aria-label="More pages">
            <div class="navsheet-grip"></div>
            <div class="navsheet-list">${moreSheet}</div>
            <div class="navsheet-foot">
              <button class="btn btn-ghost btn-sm grow" id="pwBtnM">${MKR.ui.icon('key')} Password</button>
              <button class="btn btn-ghost btn-sm grow" id="logoutBtnM">${MKR.ui.icon('logout')} Log out</button>
            </div>
          </div>
        </div>
      </div>`;

    const newSidebar = root.querySelector('.sidebar');
    if(newSidebar && savedSideScroll) newSidebar.scrollTop = savedSideScroll;

    const sideToggle = document.getElementById('sideToggle');
    if(sideToggle) sideToggle.onclick = ()=>{
      const mini = !document.body.classList.contains('side-mini');
      document.body.classList.toggle('side-mini', mini);
      document.body.classList.toggle('side-full', !mini);
      const label = mini ? 'Open the menu' : 'Fold the menu';
      sideToggle.setAttribute('aria-label', label);
      sideToggle.title = label;
      try{ localStorage.setItem('mkr_side', mini?'mini':'full'); }catch(e){}
    };

    const branchPick = document.getElementById('branchPick');
    if(branchPick) branchPick.onchange = async ()=>{
      const id = branchPick.value;
      const k = branches.find(x=>x.id===id);
      MKR.auth.switchKitchen(id);
      // Feature switches, brand colour and the sign-in mark are all per-venue,
      // so all three have to follow the switch or the shell keeps showing the
      // branch you just left.
      try{ await MKR.features.load(); }catch(e){}
      // The brand colour is not reloaded here: render() below already reloads it
      // whenever the kitchen changes, and doing it twice is two reads for one
      // repaint. Feature switches have no such hook, so they stay.
      if(k){ try{ await MKR.db.meta('brand', {name:k.name, avatar:k.logo||null}); }catch(e){} }
      MKR.util.toast('Now looking at '+(k?k.name:'another branch'), 'green');
      // Back to the same page in the new branch, not to the dashboard: the
      // reason you switched is almost always to see this page over there.
      render();
    };

    const doLogout = ()=>{
      if(MKR.net.isDirty() && !confirm('You have unsaved data — log out anyway?')) return;
      MKR.auth.logout();
    };
    const doPassword = ()=>{ if(MKR.account) MKR.account.openChangePassword(); };
    document.getElementById('logoutBtn').onclick = doLogout;
    const pwBtn=document.getElementById('pwBtn');
    if(pwBtn) pwBtn.onclick = doPassword;

    // The "More" sheet: same pages, same actions, reachable with a thumb.
    const sheet = document.getElementById('navSheet');
    const moreBtn = document.getElementById('navMore');
    if(sheet && moreBtn){
      const close = ()=> sheet.classList.add('hidden');
      moreBtn.onclick = ()=> sheet.classList.remove('hidden');
      // Backdrop only — a tap on the sheet itself must not close it.
      sheet.onclick = (e)=>{ if(e.target===sheet) close(); };
      // A link inside navigates within the same shell, so nothing would otherwise
      // take the sheet back down.
      sheet.querySelectorAll('a').forEach(a=> a.addEventListener('click', close));
      document.addEventListener('keydown', function esc(e){
        if(e.key==='Escape'){ close(); document.removeEventListener('keydown', esc); }
      });
      const pwM = document.getElementById('pwBtnM'), outM = document.getElementById('logoutBtnM');
      if(pwM) pwM.onclick = ()=>{ close(); doPassword(); };
      if(outM) outM.onclick = doLogout;
    }
    const exitImp=document.getElementById('exitImp');
    if(exitImp) exitImp.onclick=(e)=>{ e.preventDefault(); MKR.auth.exitImpersonate(); location.hash='#/superadmin/restaurants'; render(); };
    const exitPrev=document.getElementById('exitPrev');
    if(exitPrev) exitPrev.onclick=(e)=>{ e.preventDefault(); MKR.auth.exitPreview(); };
    MKR.net.render();
    if(MKR.i18n) MKR.i18n.bindSwitchers(root);
    const view = document.getElementById('view');
    try{ await portal.view(section, view, arg, viewingRole); }
    catch(e){ console.error(e); view.innerHTML = `<div class="empty"><div class="em">${MKR.ui.icon('warning')}</div><p>Page error: ${MKR.util.esc(e.message)}</p></div>`; }

    // A section no portal knows about (a stale bookmark, a typo, a link to a
    // page that moved) used to fall straight through every `if` in view() and
    // leave a blank pane under a topbar still saying "Dashboard". Whether the
    // section is in the nav is not the test — `setup` is a real page that isn't
    // — so the test is simply whether anything got drawn.
    if(!view.innerHTML.trim()){
      if(section !== portal.home){
        MKR.util.toast('That page has moved or no longer exists','amber');
        location.hash = `#/${viewingRole}/${portal.home}`;
        return;
      }
      // The home page itself came back empty: say so rather than redirect to it
      // again and spin.
      view.innerHTML = `<div class="empty"><div class="em">${MKR.ui.icon('search')}</div>
        <p>Nothing to show here yet.</p></div>`;
    }
    // Gentle entrance for the freshly-rendered page (re-triggered each navigation).
    view.classList.remove('view-enter'); void view.offsetWidth; view.classList.add('view-enter');
  }

  MKR.router = { render, parse,
    go(section){ const s=MKR.auth.current(); if(s) location.hash=`#/${s.role}/${section}`; },
    refresh(){ render(); }
  };
  window.addEventListener('hashchange', render);
})();
