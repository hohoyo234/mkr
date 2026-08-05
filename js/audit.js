/* ===== Audit Trail =====
   Append-only — no edit or delete path exists anywhere in the app.

   What belongs in here: WHO did WHAT and WHEN, for the handful of actions that
   move money, move a roster, or open someone's record. What must never end up
   in here: the contents of any of that. An audit row is read by more people
   than the thing it describes — the whole point is that it is reviewable — so a
   log line carrying a number that was meant to stay behind a reveal button
   leaks it to everyone with the audit page instead of protecting it.

   Rule of thumb for `desc`: name the person and the action, never the value.
     good  "Viewed the stored ID for Maria Lopez"
     bad   "Viewed Maria Lopez's ID: 1234 5678"

   `amount` is for the venue's own purchase costs only — what a docket cost.
   It is not for wages, refunds or takings; the app records none of those.

   Table: audit
*/
window.MKR = window.MKR || {};
(function(){
  // Every action the app actually raises, and nothing it doesn't. The list used
  // to carry the POS / payroll / membership era — order.refund, pay.blinddrop,
  // labor.approve, member.topup, coupon.issue — modules that were removed. Dead
  // labels are not harmless: they describe a system that reads takings and pays
  // wages, so anyone auditing this file would conclude the app still does.
  //
  // Meanwhile the actions it raises most — stock.purchase, delivery.confirm —
  // were missing, and fell through to the raw key. The audit page showed
  // "stock.purchase" to owners.
  const LABELS = {
    // Roster
    'shift.create':'Add shift', 'shift.remove':'Remove shift',
    'sos.post':'Post SOS shift', 'swap.approve':'Approve swap',
    // People
    'staff.hire':'Hire / onboard', 'staff.offboard':'Offboard staff',
    'reward':'Staff reward',
    // An access record, deliberately kept: knowing who opened someone's stored
    // ID is a protection, and it is the only trace that it happened at all.
    // Renamed off `tfn.view` — this app stores no TFN, and a label claiming
    // otherwise is a compliance claim it cannot back.
    'id.view':'Viewed a stored ID',
    // Stock & supply chain
    'stock.purchase':'Record purchase', 'stock.count':'Stocktake',
    'stock.waste':'Record waste', 'stock.statement':'Supplier statement check',
    'delivery.confirm':'Confirm delivery', 'delivery.reject':'Turn away delivery',
    'delivery.claim':'Supplier claim',
    // Training
    'training.assign':'Assign training', 'training.complete':'Training signed off',
    // Venue
    'settings.update':'Update settings', 'kitchen.create':'Create kitchen',
    'kitchen.approve':'Approve kitchen',
    'booking.create':'New booking', 'booking.update':'Booking update',
    // Referrals out (the app never interprets either)
    'partner.lawyer':'Opened awards help', 'partner.vevo':'Opened work-rights check',
    // Session
    'login':'Sign in', 'export':'Export data',
  };

  const A = {
    async log({action, desc, amount=null, target=null, meta=null}){
      const sess = MKR.auth.current();
      return MKR.db.append('audit', {
        action, desc,
        amount,
        target,
        actor: sess ? sess.name : 'System',
        actorRole: sess ? sess.role : 'system',
        meta
      });
    },
    async all(){ const rows = await MKR.db.getAll('audit'); return rows.sort((a,b)=>b.ts-a.ts); },
    // Rows written before an action was renamed still carry the old key, and an
    // audit log that cannot render its own history is worse than one with an
    // ugly label — so the retired names resolve rather than falling through.
    label(action){
      return LABELS[action] || ({'tfn.view':'Viewed a stored ID'})[action] || action;
    },
    LABELS,
  };
  MKR.audit = A;
})();
