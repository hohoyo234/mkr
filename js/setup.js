/* ===== One-off DEMO account bootstrap (first run only) =====
   ⚠️ DEMO ONLY. The passwords below are throwaway demo credentials, not real
   secrets — do NOT use this for a real restaurant's owner/staff. For production,
   create accounts in the Supabase dashboard (Authentication → Users) with strong
   passwords, then add the matching profiles rows.

   Run MKR.setup.createDemoAccounts() in the browser console to:
   - create the 5 demo accounts in Supabase Auth (signUp), and
   - PRINT a ready-to-paste SQL snippet that inserts their profiles rows.
   Profiles are role-protected by RLS now, so the snippet must be run in the
   Supabase SQL Editor (which uses the service role and bypasses RLS). See
   SECURITY.md.
*/
window.MKR = window.MKR || {};
(function(){
  const ACCOUNTS = [
    {username:'boss',  password:'boss1111',  role:'owner',   staff_id:'u_boss',  name:'James Carter', emoji:'👑'},
    {username:'mgr',   password:'mgr2222',   role:'manager', staff_id:'u_mgr',   name:'Maria Lopez',  emoji:'📋'},
    {username:'amy',   password:'amy3333',   role:'staff',   staff_id:'u_amy',   name:'Amy',   emoji:'🧑‍🍳'},
    {username:'kevin', password:'kevin3333', role:'staff',   staff_id:'u_kevin', name:'Kevin', emoji:'🧑‍🍳'},
    {username:'leo',   password:'leo3333',   role:'staff',   staff_id:'u_leo',   name:'Leo',   emoji:'🧑‍🍳'},
  ];

  async function createDemoAccounts(){
    const rows=[], out=[];
    for(const a of ACCOUNTS){
      const email = MKR.supa.emailFor(a.username);
      let uid=null;
      const {data:su, error:se} = await MKR.supa.signupClient.auth.signUp({email, password:a.password});
      if(su && su.user){ uid = su.user.id; }
      else {
        const {data:si} = await MKR.supa.signupClient.auth.signInWithPassword({email, password:a.password});
        if(si && si.user) uid = si.user.id;
      }
      if(!uid){ out.push(`${a.username}: ❌ ${se?se.message:'could not get uid'}`); continue; }
      out.push(`${a.username}: ✅ auth user ${uid}`);
      rows.push(`  ('${uid}','${a.username}','${a.name.replace(/'/g,"''")}','${a.role}','${a.staff_id}','k_main','${a.emoji}',true)`);
    }
    await MKR.supa.signupClient.auth.signOut().catch(()=>{});
    const sql = rows.length ? (
      `\n-- Paste this into the Supabase SQL Editor to grant the demo roles:\n`+
      `insert into public.profiles (id,username,name,role,staff_id,kitchen_id,emoji,active) values\n`+
      rows.join(',\n')+`\n`+
      `on conflict (id) do update set role=excluded.role, kitchen_id=excluded.kitchen_id, active=true;\n`
    ) : '';
    const report = out.join('\n')+sql;
    console.log(report);
    return report;
  }

  // ---------- Test accounts ----------
  // A separate set from the demo five, for trying the app as four different
  // people at once — one owner, one manager, two staff — without touching the
  // demo names that appear in screenshots and the sample data.
  //
  // ⚠️ One shared, guessable password across four accounts. That is fine for a
  // test venue and is not fine for a real one: anyone who learns it holds an
  // OWNER login. Delete these in Supabase (Authentication → Users) before the
  // project carries anything real.
  const TEST_ACCOUNTS = [
    {username:'test_boss1',    password:'threepandas', role:'owner',   staff_id:'u_test_boss1',   name:'Test Owner',     emoji:'👑'},
    {username:'test_manager1', password:'threepandas', role:'manager', staff_id:'u_test_mgr1',    name:'Test Manager',   emoji:'📋'},
    {username:'test_staff1',   password:'threepandas', role:'staff',   staff_id:'u_test_staff1',  name:'Test Staff One', emoji:'🧑‍🍳'},
    {username:'test_staff2',   password:'threepandas', role:'staff',   staff_id:'u_test_staff2',  name:'Test Staff Two', emoji:'🧑‍🍳'},
  ];

  // The auth user is only half an account. `profiles` is the server-side source
  // of truth for role (and is RLS-protected, so it needs the SQL Editor), while
  // `users` is the app-side record the roster, tasks and team pages read. Create
  // only the first and the person can sign in to a portal that knows nothing
  // about them: no name, no availability, not on any list.
  async function createTestAccounts(){
    const rows=[], out=[];
    for(const a of TEST_ACCOUNTS){
      const email = MKR.supa.emailFor(a.username);
      let uid=null;
      const {data:su, error:se} = await MKR.supa.signupClient.auth.signUp({email, password:a.password});
      if(su && su.user){ uid = su.user.id; }
      else {
        // Already created on an earlier run — sign in just to read the uid back.
        const {data:si} = await MKR.supa.signupClient.auth.signInWithPassword({email, password:a.password});
        if(si && si.user) uid = si.user.id;
      }
      if(!uid){ out.push(`${a.username}: ❌ ${se?se.message:'could not get uid'}`); continue; }

      await MKR.db.put('users', {
        id:a.staff_id, role:a.role, name:a.name, username:a.username,
        status:'active', emoji:a.emoji, kitchenId:'k_main',
        // Available all week, so the auto-roster has something to place and the
        // test accounts are useful the moment they exist.
        availability:{0:'all',1:'all',2:'all',3:'all',4:'all',5:'all',6:'all'},
        skills: a.role==='staff' ? ['floor','kitchen'] : ['open','close','lead','floor'],
        employment:'casual', position: a.role==='staff' ? 'Kitchen' : '',
        onboarded: a.role!=='staff',
      });

      out.push(`${a.username}: ✅ auth user ${uid} · users row ${a.staff_id}`);
      rows.push(`  ('${uid}','${a.username}','${a.name.replace(/'/g,"''")}','${a.role}','${a.staff_id}','k_main','${a.emoji}',true)`);
    }
    await MKR.supa.signupClient.auth.signOut().catch(()=>{});
    const sql = rows.length ? (
      `\n-- Paste this into the Supabase SQL Editor (it bypasses RLS) to grant the roles:\n`+
      `insert into public.profiles (id,username,name,role,staff_id,kitchen_id,emoji,active) values\n`+
      rows.join(',\n')+`\n`+
      `on conflict (id) do update set role=excluded.role, kitchen_id=excluded.kitchen_id, active=true;\n`+
      `\n-- Sign in with the username (not the email): test_boss1 / threepandas\n`
    ) : '';
    const report = out.join('\n')+sql;
    console.log(report);
    return report;
  }

  MKR.setup = { createDemoAccounts, ACCOUNTS, createTestAccounts, TEST_ACCOUNTS };
})();
