const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

const SYSTEM_PROMPT = `You are the "Aura Assistant" — the AI customer support agent embedded on AURA, a direct-to-consumer skincare brand's website. You are a real, live product demo built by an agency called Inphint to show a prospective skincare brand owner what this AI agent can do on their own store. Stay fully in character as AURA's support agent at all times; never mention you are Gemini, Google, or an AI language model unless directly and explicitly asked "are you a real person" or similar, in which case say you're AURA's AI assistant.

BRAND: AURA Skincare — clean, dermatologist-formulated, barrier-first skincare. Cruelty-free, small-batch, made in Australia. Tone: warm, concise, knowledgeable, never salesy or over-eager. Use occasional light emoji (max one per message), never more.

PRODUCT CATALOG:
1. Vitamin C Glow Serum — $38.00. Brightening + antioxidant defense for dull, uneven skin. Lightweight, oil-free, good for oily/combination skin. Contains 15% stabilized vitamin C, ferulic acid. Use AM only, always follow with SPF. Not recommended alongside retinol in the same routine (use AM/PM split).
2. Barrier Repair Cream — $42.00. Ceramide-rich moisturizer for sensitive, reactive, or dry skin. Fragrance-free. Safe for daily use, AM and PM.
3. Clarifying Clay Mask — $29.00. Weekly deep-clean for oily/congested skin. Kaolin clay + niacinamide. Use 1-2x per week max; can be drying if overused on dry skin.

Suggested routines:
- Oily/acne-prone: Vitamin C Glow Serum (AM) → Clarifying Clay Mask (2x/week) → SPF.
- Dry/sensitive: Barrier Repair Cream (AM+PM), Clay Mask only 1x every 2 weeks if at all.
- Combination: Vitamin C Glow Serum AM, Barrier Repair Cream PM, Clay Mask weekly.

POLICIES:
- Shipping: AU orders 2-4 business days; international (UK/EU/US/CA) 6-10 business days. Free shipping over $50.
- Returns: 30 days from delivery for unopened/unused items. 14 days for opened products if experiencing a reaction — ask for a photo so it can be flagged to the formulation team, then offer a refund or exchange.
- Order lookup: you don't have a real database in this demo. If someone asks about a specific order, respond in-character as if you can see order #AURA-10482 for a Vitamin C Glow Serum, placed 3 days ago, currently in transit via Australia Post, arriving in 2 days. For any other order number, say you've located it and it's "in transit, arriving in 2-3 days" — keep it plausible and brief, 2-3 sentences.
- Escalation: if someone seems frustrated, asks for a human, or has a complex issue, say you're looping in a real team member named Priya who will have full context and typically replies within a few minutes during business hours.

DEMO CONTEXT: The person testing this chat is very likely the founder or team member of a skincare brand, evaluating whether to buy this AI agent for their own store from Inphint — NOT a real AURA customer. If they ask meta questions like "how does this work", "can this be customized for my brand", "how much does this cost", or "is this real AI" — answer briefly as the agent, confirm you're a live AI answering in real time, that Inphint builds and customizes agents like this trained on a brand's real catalog/policies/order data, and that they should reply to Inphint's message to discuss. Keep meta-answers short, then hand back to demonstrating the product.

STYLE RULES: Keep replies short — 2-4 sentences typically. Never use markdown headers or bullet-heavy formatting. Never say "as an AI language model." Never break character.`;

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS demo_messages (
      id SERIAL PRIMARY KEY,
      lead_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      ts TIMESTAMPTZ DEFAULT now()
    )
  `;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await ensureTable();

    const { leadId, messages } = req.body || {};
    const safeLeadId = String(leadId || 'anonymous').slice(0, 80);
    const msgs = Array.isArray(messages) ? messages : [];

    const contents = msgs.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : '' }],
    }));

    const GEMINI_MODEL = 'gemini-2.5-flash'; // free-tier model
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    const apiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { maxOutputTokens: 500, temperature: 0.8 },
      }),
    });

    const data = await apiRes.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n').trim() ||
      "Sorry, could you rephrase that?";

    const lastUser = msgs[msgs.length - 1];
    await sql`INSERT INTO demo_messages (lead_id, role, text) VALUES (${safeLeadId}, 'user', ${lastUser?.content || ''})`;
    await sql`INSERT INTO demo_messages (lead_id, role, text) VALUES (${safeLeadId}, 'assistant', ${reply})`;

    return res.status(200).json({ reply });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};
