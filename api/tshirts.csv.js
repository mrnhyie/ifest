import { query } from './_lib/db.js';
import { jsonError, isAdmin } from './_lib/http.js';

function esc(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export default async function handler(req, res) {
  if (!isAdmin(req)) return jsonError(res, 401, 'unauthorized');
  try {
    const { rows } = await query(
      `SELECT code, name, email, phone, org, role, team_code, team_name,
              items, unit_price, amount, pickup, collector,
              momo_network, momo_ref, momo_sender, notes, status, created_at
       FROM tshirt_requests ORDER BY id DESC`
    );
    const head = ['request_code', 'status', 'requested_at', 'requester', 'email', 'phone', 'org', 'role',
      'team_code', 'team_name', 'wearer', 'size', 'colour', 'quantity', 'unit_price_ghs', 'request_amount_ghs',
      'momo_network', 'momo_reference', 'momo_sender', 'pickup', 'collector', 'notes'];
    const lines = [head.join(',')];
    for (const r of rows) {
      for (const it of r.items || []) {
        lines.push([
          r.code, r.status, new Date(r.created_at).toISOString(), r.name, r.email, r.phone, r.org, r.role,
          r.team_code, r.team_name, it.name, it.size, it.color, it.qty, r.unit_price, r.amount,
          r.momo_network, r.momo_ref, r.momo_sender,
          r.pickup === 'proxy' ? 'collected by ' + (r.collector || 'someone else') : 'self',
          r.collector, r.notes,
        ].map(esc).join(','));
      }
    }
    res.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="ifest2026-tshirts.csv"',
    });
    res.end(lines.join('\n') + '\n');
  } catch (e) {
    console.error('tshirt csv failed:', e);
    jsonError(res, 500, e.message);
  }
}