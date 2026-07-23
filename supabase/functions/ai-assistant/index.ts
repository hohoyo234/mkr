// Supabase Edge Function: ai-assistant
// Proxies the in-app assistant's free-form questions to an LLM. The API key
// lives ONLY here (as a Supabase secret) — never in the front-end.
//
// This build calls NVIDIA's API (build.nvidia.com), which is OpenAI-compatible.
// Default model is Qwen (great Chinese); change NVIDIA_MODEL to any model id from
// build.nvidia.com (e.g. meta/llama-3.3-70b-instruct, deepseek-ai/deepseek-r1).
//
// Deploy:
//   supabase functions deploy ai-assistant --no-verify-jwt
//   supabase secrets set NVIDIA_API_KEY=nvapi-xxxxxxxx
//   # optional:
//   supabase secrets set NVIDIA_MODEL=qwen/qwen2.5-72b-instruct
//
// The front-end (js/assistant.js → MKR.assistant.llm) POSTs { question, role, lang, context }.
// Returns { text }.

const NVIDIA_API_KEY = Deno.env.get('NVIDIA_API_KEY') || '';
const MODEL = Deno.env.get('NVIDIA_MODEL') || 'qwen/qwen2.5-72b-instruct';
const BASE_URL = (Deno.env.get('NVIDIA_BASE_URL') || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey' };
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// What the assistant knows about the product, so answers stay accurate + on-topic.
const APP_OVERVIEW = `My Kitchen Rules is a time-saving back-of-house manager for small restaurants in Australia. Its whole purpose is to give the owner their hours back. It has three roles:
- Owner: Today dashboard (who's on, checklist progress, low stock, deliveries waiting, training overdue, alerts), AI Assistant, Stock & costs, Deliveries, Training & SOP, Alerts, Team, Performance, Branches, Customer feedback, Audit log, Switch view, Settings (module toggles, EN/中文, data export).
- Manager: AI Rostering, My shifts, My availability, Daily tasks, Stock & costs, Deliveries, Training, Swaps/SOS, Add Users, Bookings & queue.
- Staff: My shifts (one-tap clock-in, drop a shift), Availability, Today's tasks, My training, Deliveries, Swap market, My profile.

Key features:
- AI rostering: asks the owner a preference questionnaire first (headcount per day-part, what to warn about, who can open/close/cook), then plans from staff availability, skills and how many people they actually rostered in past weeks. It produces WARNINGS ONLY — long weeks, too many days straight, short breaks, missing skill cover, understaffed slots. Nothing is ever blocked or capped.
- Stock & costs: raw ingredients plus non-perishable tools (chopsticks, containers, gloves). Quantity, unit price, amount, total stock value, and a price history per item showing ▲/▼ against the last price paid. Suppliers with contact names and phone numbers, and full purchase history.
- Usage forecasting WITHOUT a point of sale: consumption is derived from stocktakes — last count + purchases since − this count. Days of cover and a suggested order list come from that. It needs at least two stocktakes before it can say anything.
- Deliveries: a back-door confirmation form. Ordered vs actually received, condition (good/short/damaged/wrong), chilled temperature, photo, signature. Confirming pushes the received quantities into stock at the invoiced prices.
- Training & SOP: the venue writes procedures, assigns them to people with a due date, and staff sign them off by name.
- Daily tasks: cleaning, prep and temperature checks with photo evidence.

What this app deliberately does NOT do — be clear and direct about all of these:
- No point of sale, no orders, no sales figures, no cash reconciliation or blind drop.
- No pay. No wage rates, no award or penalty-rate calculations, no payslips, no labour-cost ratios.
- No TFN, super, or bank details are collected anywhere.
- No STP, no ATO, no filing or reporting to any government system whatsoever.
- No compliance judgements and no visa hour limits. It stores no visa data.
- No customer-facing role: no table QR ordering, loyalty, points, memberships or coupons.
Two OPTIONAL add-ons exist, off by default, and both are referrals only: "Awards help" opens the venue's partner employment lawyer, and "Check work rights" opens VEVO (the Department of Home Affairs' own checker). The app itself never interprets either.

Money is AUD, and the only money in the app is what the owner paid a supplier for stock.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!NVIDIA_API_KEY) return json({ error: 'NVIDIA_API_KEY not configured' }, 500);

  const p = await req.json().catch(() => ({} as any));
  const question = String(p.question || '').slice(0, 2000).trim();
  if (!question) return json({ error: 'empty question' }, 400);
  const role = ['owner', 'manager', 'staff', 'superadmin'].includes(p.role) ? p.role : 'a user';
  const lang = p.lang === 'zh' ? '简体中文' : 'English';
  const context = String(p.context || '').slice(0, 1200).trim();

  const system = `You are the in-app help assistant for My Kitchen Rules. You are talking to a ${role}.
${APP_OVERVIEW}
${context ? `\nLive snapshot of THIS venue's data right now (current and accurate — use it to answer questions about their own numbers):\n${context}\n` : ''}
Rules:
- Answer in ${lang}.
- Be concise and practical — usually 1-4 sentences. Use simple steps when explaining how to do something. Plain words a busy restaurant owner can follow; avoid jargon.
- Help with using the app and with general small-restaurant operations questions (rostering, stock and ordering, suppliers, deliveries, training, staffing, cleaning routines).
- ${context ? `Use the live snapshot above for questions about their own numbers (who's on shift, checklist progress, stock on hand, what's low, price moves, deliveries waiting, training outstanding). If a specific number they ask for isn't in the snapshot, tell them which screen to open rather than inventing it.` : `You do NOT have access to this venue's live data; if asked for their own numbers, tell them which screen to open instead of inventing figures.`}
- Never give legal, industrial-relations, tax or pay advice. If asked about awards, wages, entitlements or work rights, say plainly that this app does not do that, and point to the optional partner-lawyer or VEVO buttons.
- If a question is unrelated to the app or running a restaurant, answer briefly and steer back.`;

  try {
    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        temperature: 0.3,
        top_p: 0.9,
        stream: false,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: question },
        ],
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return json({ error: 'upstream', status: r.status, detail: detail.slice(0, 300) }, 502);
    }
    const data = await r.json();
    const text = String(data?.choices?.[0]?.message?.content || '').trim();
    return json({ text: text || "Sorry, I couldn't generate an answer." });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
