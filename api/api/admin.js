const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  const { key } = req.query;
  if (key !== process.env.ADMIN_KEY) {
    return res.status(401).send('Unauthorized — add ?key=YOUR_ADMIN_KEY to the URL');
  }

  try {
    const leadKeys = (await kv.smembers('lead_keys')) || [];
    const leads = [];
    for (const k of leadKeys) {
      const val = await kv.get(k);
      if (val) leads.push(val);
    }
    leads.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Inphint — Demo Leads</title>
      <style>
        body{font-family:Arial,sans-serif;background:#F6F1E7;color:#1B2B22;padding:32px;max-width:820px;margin:0 auto;}
        h1{font-size:22px;}
        .lead{background:#fff;border:1px solid #e2ddd0;border-radius:14px;padding:18px 20px;margin-bottom:16px;}
        .lead h3{margin:0 0 4px;font-size:16px;}
        .meta{font-size:12px;color:#666;margin-bottom:12px;}
        .msg{font-size:13px;margin-bottom:6px;line-height:1.4;}
        .msg b{color:#4C6355;}
        .empty{color:#888;font-size:14px;}
      </style></head><body>
      <h1>🔎 Who's tried the AURA demo</h1>
      <p class="meta">${leads.length} lead(s) so far. Refresh anytime.</p>`;

    if (leads.length === 0) html += `<p class="empty">No conversations yet.</p>`;

    for (const l of leads) {
      html += `<div class="lead"><h3>${l.leadId}</h3>
        <div class="meta">First seen: ${new Date(l.firstSeen).toLocaleString()} · Last active: ${new Date(l.lastSeen).toLocaleString()} · ${l.transcript.length} messages</div>`;
      for (const m of l.transcript) {
        html += `<div class="msg"><b>${m.role === 'user' ? 'Them' : 'Agent'}:</b> ${(m.text || '').replace(/</g, '&lt;')}</div>`;
      }
      html += `</div>`;
    }
    html += `</body></html>`;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send('Error loading leads');
  }
};
