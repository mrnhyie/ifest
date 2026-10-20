import { query } from './_lib/db.js';
import { sendJson } from './_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 200, { registered: false });
  const params = new URL(req.url, 'http://r.sc').searchParams;
  const email = (params.get('email') || '').trim().toLowerCase();
  if (!email) return sendJson(res, 200, { registered: false });
  try {
    const { rows } = await query('SELECT code FROM member_emails WHERE email = $1 LIMIT 1', [email]);
    sendJson(res, 200, { registered: rows.length > 0, team: rows.length ? rows[0].code : '' });
  } catch (e) {
    console.error('check-member failed:', e);
    sendJson(res, 200, { registered: false });
  }
}
