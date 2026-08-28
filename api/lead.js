// Consultation-call request handler. Validates the form, emails Daniel, and
// tells the visitor when to expect a call back.
//
// Email goes out through Resend when RESEND_API_KEY is set. Without a key the
// lead is still accepted and logged — a visitor never sees a failure because
// of a missing env var, and the log line is recoverable from Vercel.

const MAX = { name: 80, phone: 30, business: 100, site: 200, when: 40, notes: 1000 };

// One submission per IP per minute. Same shape as the scanner's limiter.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  for (const [k, t] of hits) if (now - t > 60000) hits.delete(k);
  if (hits.has(ip)) return true;
  hits.set(ip, now);
  return false;
}

const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

// A US phone needs 10 digits, or 11 starting with a 1. Strip everything else
// first so (917) 245-8685 and 917.245.8685 both pass.
function validPhone(raw) {
  const d = raw.replace(/\D/g, '');
  return d.length === 10 || (d.length === 11 && d[0] === '1');
}

async function sendEmail(lead) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'no RESEND_API_KEY set' };

  const rows = [
    ['Name', lead.name],
    ['Phone', lead.phone],
    ['Business', lead.business || '—'],
    ['Current site', lead.site || '—'],
    ['Best time to call', lead.when || 'Anytime'],
    ['Notes', lead.notes || '—']
  ];
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.LEAD_FROM || 'UI Designs Co <onboarding@resend.dev>',
      to: [process.env.LEAD_TO || 'uidesignsco@gmail.com'],
      reply_to: lead.email || undefined,
      subject: `Consultation request — ${lead.name}${lead.business ? ` (${lead.business})` : ''}`,
      text: `${text}\n\nCall back within 24 hours.`
    })
  });
  if (!res.ok) return { sent: false, reason: `resend ${res.status}` };
  return { sent: true };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'You have already sent a request. Give it a minute, or text 917-245-8685.' });
    return;
  }

  const b = req.body || {};

  // Honeypot: a field hidden from people, irresistible to bots. Accept the
  // submission so the bot moves on, but drop it.
  if (clean(b.company, 100)) {
    res.status(200).json({ ok: true });
    return;
  }

  const lead = {
    name: clean(b.name, MAX.name),
    phone: clean(b.phone, MAX.phone),
    business: clean(b.business, MAX.business),
    site: clean(b.site, MAX.site),
    when: clean(b.when, MAX.when),
    notes: clean(b.notes, MAX.notes)
  };

  if (!lead.name) {
    res.status(400).json({ error: 'Please add your name.' });
    return;
  }
  if (!validPhone(lead.phone)) {
    res.status(400).json({ error: 'Please add a phone number I can reach you on.' });
    return;
  }

  try {
    const mail = await sendEmail(lead);
    // Logged either way — a delivery failure must not lose the lead.
    console.log('LEAD', JSON.stringify({ ...lead, emailed: mail.sent, reason: mail.reason }));
    res.status(200).json({ ok: true });
  } catch (e) {
    console.log('LEAD (send failed)', JSON.stringify(lead), e && e.message);
    // The lead is in the log, so the visitor is genuinely booked.
    res.status(200).json({ ok: true });
  }
};
