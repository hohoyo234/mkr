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
**Preview without an account** box — pick Owner / Manager / Staff and it opens the
app against sample data on that device. There is no auth session in preview mode, so
every cloud query is refused by Row Level Security; it can only ever see local data.

Real sign-in goes through Supabase Auth. Passwords are never stored in this repo —
create accounts in the Supabase dashboard (Authentication → Users) and give each one
a matching row in `profiles`.

---

## What it does

| Area | What it covers |
|---|---|
| **Home, three ways** | **Blocks** is the default: every page as a block the owner arranges themselves, each carrying its own count and what that count means ("3 to top up", "All clear"). **Floor** draws the same numbers as six rooms — cold room, back door, kitchen, staff area, training room, office — each linking to the page that does the work. **List** is the plain rundown. Same data underneath; the choice sticks per device. There is no front-of-house room on purpose: with no point of sale there is nothing on a dining-room floor this app can honestly count. Takings are a page, not a room — they are a number you type, not a thing to walk into. |
| **One colour per module** | A module's colour is its identity (cold room blue, kitchen green, rostering violet) and is the same on its block, its room, its kitchen station and its menu row. A *badge's* colour is only ever status, on one three-step scale: green all clear · amber worth a look · red do it today. The two never borrow each other's palette. Defined once in `js/ui.js` (`TONE`, `tier()`). |
| **One icon set** | Interface glyphs are inline SVG from `js/ui.js`, never emoji — emoji can't take a colour, don't align to a baseline and render differently on every OS. Three deliberate exceptions: the ~45 ingredient pictograms a dish cost card falls back to when an item has no photo (45 line icons would all look alike at 22px), push-notification titles (the OS renders those as plain text), and `<option>` / modal-title / toast text, which is escaped before it reaches the DOM — those simply lost their glyph. |
| **Light & dark** | Follows the OS; overridable per device in Settings → Appearance. Every colour in the app is a token, so the dark theme is one `:root[data-theme="dark"]` block and no per-component overrides. The docket and receipt facsimiles stay on white — they are pretending to be paper — and `@media print` forces the light tokens back so a docket printed in dark mode isn't a blank page. |
| **AI rostering** | Asks the owner a preference questionnaire first, then plans from staff availability, skills and how many people were actually rostered in past weeks. Warnings only — never blocks. |
| **Takings & covers** | Cash, card and covers, typed once a day at close. One row per venue per day, so re-entering a day corrects it. No POS integration on purpose — a till gets replaced every few years and an integration would take the app with it. This is the denominator every cost ratio in the app is measured against. |
| **Labour cost** | The roster priced at hourly rates the owner types in themselves, plus their own weekend and public-holiday multipliers. Planned cost per week, clocked cost once people clock on and off, labour % against the days that actually have takings, and a per-pay-period timesheet CSV for the bookkeeper. Explicitly **not** a pay calculation — see below. |
| **Stock & costs** | Ingredients and non-perishable tools. Quantity, unit price, amount, total value, and a price history per item with ▲▼ movement. |
| **Item photos** | Any stock item can carry a photo of the actual thing — taken on the phone or picked from the library, never required. It shows on the stock list and on the dish cost cards, because a picture beats a name in a language the next person on shift doesn't read. Resized to 480px before it is stored, so a shelf of photos still syncs. |
| **Suppliers & purchases** | Who you buy from, who you actually ring, and every invoice. |
| **Usage forecasting** | Derived from stocktakes, not sales: `last count + purchases since − this count`. Days of cover and a suggested order list. |
| **Dish cost cards** | The link between the store room and the menu board: a coarse recipe per dish (the three to five things that move the cost, in the unit stock already uses) against what it sells for. Cost, food cost %, what you keep — and when an ingredient moves, the card says what the dish cost a month ago. Menu prices are treated as GST-inclusive by default and the GST is taken out before the ratio, because comparing a GST-inclusive price against GST-free ingredient costs flatters every dish by about a tenth. |
| **Stocktake variance** | A count in money, not just quantities: the gap shows as you type it (so a 90-for-9 typo gets caught while you are still standing at the shelf), the finding is a screen rather than a toast, and the last 30 days roll up on the forecast page. Each line keeps the price it was counted at, so a later price rise can't rewrite a number the owner already acted on. This is *not* the bin — recorded waste already came off the book, so what's left is what nobody wrote down. |
| **Deliveries** | Back-door confirmation form: ordered vs received, condition, chilled temperature, photo, signature. A delivery is booked with the date it is *expected*, which is what the calendar reads. |
| **Calendar** | The owner's month: deliveries (read from the delivery log, never retyped) plus the jobs the venue does to itself — pest control, the deep clean, the grease trap — each with who is doing it and a repeat if it repeats. Reads and writes `.ics`, so it is never the only place the pest control date exists. |
| **First-run setup** | One form the first time an owner signs in, and nothing else in the owner portal opens until it is finished: the venue, its hours, who works there, who they buy from and what they keep in stock. Every block writes real records, so the team page, the supplier list and the stock page are populated before they are first opened. Blank rows are skipped. |
| **Photograph the paperwork** | On that form: upload a photo of a menu, a business card, a supplier invoice or the staff list on the wall, and a vision model fills in what it can read — venue details, people, suppliers, stock lines. It fills blanks only and never overwrites what was typed; the owner checks it before finishing. Same Edge Function and same key as the assistant, so there is one secret to manage. |
| **Your own pictures on the home screen** | The greeting can sit on a photo of the venue, and each block can carry its own picture as a watermark. Both are uploaded in the home screen's own **Edit** mode and stored on the kitchen record, so every device in the venue sees the same home screen (the block *layout* stays per device). Upload nothing and the home screen looks exactly as it does now. |
| **Staff stock count** | Counting is the only source of usage data in this app, and the person who can count the shelf is the one standing at it — so staff get a count page of their own. No prices, no stock value, no supplier, and the book figure is deliberately hidden: a blind count is the only kind worth having. Its own feature switch, separate from Stock & costs. |
| **Training & SOP** | Write a procedure once, assign it with a due date, staff sign it off by name. |
| **Certificates** | RSA, Food Safety Supervisor, first aid — type, number, expiry and a photo of the ticket itself, sorted soonest-first on one screen so it can be produced while an inspector is standing in the kitchen. Alerts before it lapses. The staff member's own visa expiry is folded into the same list, read-only, from their onboarding record. |
| **Melbourne, specifically** | Victorian public holidays are drawn on the roster grid (Melbourne Cup is a rostering problem, not a trivia question), and the roster warns when a fortnight goes over a work-hour limit recorded against someone. The AFL Grand Final Friday is gazetted each year and is typed in as an extra date. |
| **Daily tasks** | Cleaning, prep and temperature checks with photo evidence. |

### What it deliberately does not do

These are omissions by design, not gaps in the roadmap:

- **No point of sale.** No orders, no item-level sales, no cash reconciliation.
  Daily takings are a figure the owner types in at close, not a till feed.
  Dish cost cards are a calculator over stock prices, not a menu: nothing in
  them is shown to a customer, ordered or sold.
- **No payroll.** The app costs a roster using rates the OWNER typed in, and says
  so on every screen that shows one. It reads no award, applies no penalty rates
  of its own, produces no payslip, and calculates no tax or superannuation.
  Getting an award wrong costs a venue real money, so nothing here guesses one.
- **No super or bank details** are collected anywhere.
- **No government integration.** No STP, no ATO, no filing of any kind.
- **No compliance judgements.** The app never reads a visa's conditions, never
  infers a limit from a subclass, and never decides who is entitled to work.
  It does warn when a fortnight goes over a limit — but that limit is a number
  the **owner** recorded against a person, counted against the venue's own
  roster, and it warns rather than blocks, like every other roster warning.
  Certificate expiries are the dates people typed, counted down; nothing is
  verified with an issuing body.
- **No customer-facing role.** No QR ordering, loyalty, points or coupons.

### Employment records the app does hold

A venue's payroll needs the staff member's TFN and work-rights status to exist
somewhere the owner can retrieve them, so the app holds both — recorded, never
interpreted:

- **Staff enter their own.** Nobody types them on someone else's behalf.
- **Quoting a TFN is optional**, as it is in law. "I'd rather not" is a
  first-class answer that still completes onboarding.
- **Encrypted at rest** (`tfnEnc`, `passportEnc`) and readable only by the staff
  member and the owner — never a manager, never another staff member. That is
  enforced by Row Level Security on `onboarding`, not by the browser.
- **Masked until deliberately revealed**, and every reveal writes an audit row
  naming who opened whose record — never the value.
- **Never exported.** No CSV or report path touches the `onboarding` table.
- **Work rights are a status, not a judgement.** The app stores "citizen / PR /
  subclass 500 expiring March" and does nothing with it. It does not count hours
  against a visa and does not decide whether someone may work.

Two optional add-ons exist, **off by default**, and both are referrals only:
*Awards help* opens the venue's partner employment lawyer, and *Check work rights*
opens VEVO. The app itself never interprets either.

---

## Layout

```
index.html            app shell — loads every module in order (also resolves the theme before first paint)
landing.html          marketing page
sw.js                 service worker (offline shell + push)
assets/css/styles.css single stylesheet — every colour is a token, so the dark
                      theme is one `:root[data-theme="dark"]` block and no
                      per-component overrides
js/
  util.js ui.js i18n.js        helpers, icons + module colours + theme, EN/中文 dictionary
  supa.js db.js                Supabase config; local-first data layer + sync
  auth.js features.js          sessions & roles; module on/off switches
  roster.js roster-view.js     rostering engine (incl. roster costing) + page
  takings.js                   daily takings — the denominator for every ratio
  stock.js stock-view.js       stock/cost model + page
  calendar.js                  the venue's month: deliveries + its own jobs, .ics in and out
  game-map.js                  the restaurant floor — the owner's home screen (Floor view)
  tiles.js                     the blocks the owner arranges — the default home (Blocks view)
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
  else, then `supabase/stock-training-setup.sql` for the stock and training tables and
  `supabase/takings-setup.sql` for daily takings, `supabase/certs-setup.sql` for
  certificates and `supabase/recipes-setup.sql` for dish cost cards.
- Shifts carry a `week` key (the Monday, `YYYY-MM-DD`) so past weeks stay on the
  record and the roster can learn from them.
- Takings are keyed `tk_<kitchenId>_<date>` — one row per venue per day, so
  entering the same day twice is a correction rather than a second row.
- Pay rates and fortnightly hour limits live on the staff record
  (`users.payRate`, `users.fortnightCap`); the multipliers, the default rate and
  any extra public holidays live in `settings.rosterPrefs`.
- Work rights stay on the staff member's own onboarding record and are never
  copied. The certificate screen reads them alongside `certs` rows and shows
  them read-only — an owner quietly editing someone's visa expiry is not a thing
  this app makes easy.
- Stocktake lines carry `unitPrice` and a signed `amount` from the moment they
  are counted. Counts saved before that are valued at today's price and the
  screen says so rather than quietly mixing the two.
- A ratio is only ever taken over days that have BOTH sides. One day of takings
  against a fortnight of dockets reads as a 98% food cost, which is not a bad
  week — it is a mismatched divisor. Food cost and labour cost both restrict
  themselves to the days actually entered.
- Writes are local-first: IndexedDB immediately, Supabase in the background, with an
  outbox queue that drains when the connection returns.

## Security

The Supabase URL and anon key in `js/supa.js` are front-end keys and are meant to be
public — Row Level Security is what actually guards the data, and it re-checks the
real signed-in user on every query. A tampered client-side profile grants nothing.
See [SECURITY.md](SECURITY.md) for the pre-launch checklist.
