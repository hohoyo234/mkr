# My Kitchen Rules

A time-saving back-of-house manager for small restaurants in Australia. The whole
point is to give the owner their hours back — rostering, ordering, stocktaking and
training new starters, all in one place, on a phone.

No build step. It is plain HTML + vanilla JS on a global `MKR` namespace, backed by
IndexedDB locally and Supabase in the cloud.

---

## Run it

```bash
python3 -m http.server 8899
```

Then open <http://localhost:8899/index.html>. Double-clicking `index.html` also works
(`file://` is supported).

**No account? Use the preview.** At the bottom of the sign-in page there is a
**👀 Preview without an account** box — pick Owner / Manager / Staff and it opens the
app against sample data on that device. There is no auth session in preview mode, so
every cloud query is refused by Row Level Security; it can only ever see local data.

Real sign-in goes through Supabase Auth. Passwords are never stored in this repo —
create accounts in the Supabase dashboard (Authentication → Users) and give each one
a matching row in `profiles`.

---

## What it does

| Area | What it covers |
|---|---|
| **The restaurant floor** | The owner's home screen. Six rooms — cold room, back door, kitchen, staff area, training room, office — each with a live badge counting what's waiting in it, and each linking to the page that does the work. Counts come from the same modules the list dashboard reads. `☰ List` switches back to the old list, and the choice sticks. There is no front-of-house/takings room on purpose: no till, nothing honest to show. |
| **AI rostering** | Asks the owner a preference questionnaire first, then plans from staff availability, skills and how many people were actually rostered in past weeks. Warnings only — never blocks. |
| **Stock & costs** | Ingredients and non-perishable tools. Quantity, unit price, amount, total value, and a price history per item with ▲▼ movement. |
| **Shelf view** | The default way the Stock tab draws that data: a cold room and a dry store with every item standing on a shelf, where how full the jar is *is* the quantity. Tap a jar to count it or drop it in the basket; the basket groups itself by supplier and becomes the order. `☰ List` switches back to the table, and the choice sticks. |
| **Suppliers & purchases** | Who you buy from, who you actually ring, and every invoice. |
| **Usage forecasting** | Derived from stocktakes, not sales: `last count + purchases since − this count`. Days of cover and a suggested order list. |
| **Deliveries** | Back-door confirmation form: ordered vs received, condition, chilled temperature, photo, signature. |
| **Training & SOP** | Write a procedure once, assign it with a due date, staff sign it off by name. |
| **Daily tasks** | Cleaning, prep and temperature checks with photo evidence. |

### What it deliberately does not do

These are omissions by design, not gaps in the roadmap:

- **No point of sale.** No orders, no sales figures, no cash reconciliation.
- **No pay.** No wage rates, no award or penalty-rate calculations, no payslips,
  no labour-cost ratios.
- **No TFN, super or bank details** are collected anywhere.
- **No government integration.** No STP, no ATO, no filing of any kind.
- **No compliance judgements** and no visa hour limits. No visa data is stored.
- **No customer-facing role.** No QR ordering, loyalty, points or coupons.

Two optional add-ons exist, **off by default**, and both are referrals only:
*Awards help* opens the venue's partner employment lawyer, and *Check work rights*
opens VEVO. The app itself never interprets either.

---

## Layout

```
index.html            app shell — loads every module in order
landing.html          marketing page
sw.js                 service worker (offline shell + push)
assets/css/styles.css single stylesheet
js/
  util.js ui.js i18n.js        helpers, icons, EN/中文 dictionary
  supa.js db.js                Supabase config; local-first data layer + sync
  auth.js features.js          sessions & roles; module on/off switches
  roster.js roster-view.js     rostering engine + page
  stock.js stock-view.js       stock/cost model + page
  stock-game.js                shelf view — the same stock data drawn as the room
  game-map.js                  the restaurant floor — the owner's home screen
  deliveries.js training.js    delivery confirmation; SOPs & training
  partners.js                  optional lawyer / VEVO referrals
  assistant.js                 in-app AI assistant
  router.js app.js             hash router; boot
  views/                       owner · manager · staff · superadmin · login · admin
supabase/
  *.sql                        schema + Row Level Security (run security-setup first)
  functions/                   Edge Functions (AI assistant, email, push)
```

## Data model notes

- Every table is `id + data(jsonb) + updated_at`, scoped per venue by
  `data->>'kitchenId'` under RLS. Run `supabase/security-setup.sql` before anything
  else, then `supabase/stock-training-setup.sql` for the stock and training tables.
- Shifts carry a `week` key (the Monday, `YYYY-MM-DD`) so past weeks stay on the
  record and the roster can learn from them.
- Writes are local-first: IndexedDB immediately, Supabase in the background, with an
  outbox queue that drains when the connection returns.

## Security

The Supabase URL and anon key in `js/supa.js` are front-end keys and are meant to be
public — Row Level Security is what actually guards the data, and it re-checks the
real signed-in user on every query. A tampered client-side profile grants nothing.
See [SECURITY.md](SECURITY.md) for the pre-launch checklist.
