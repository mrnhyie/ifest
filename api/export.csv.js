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
      `SELECT id, code, team_name, institution, categories, lead_email, created_at, payload::text AS payload
       FROM registrations ORDER BY id DESC`
    );
    const head = ['id', 'code', 'team', 'institution', 'categories', 'lead', 'lead_email', 'lead_phone', 'members', 'registered_at', 'payload_json'];
    const lines = [head.join(',')];
    for (const r of rows) {
      const p = JSON.parse(r.payload);
      lines.push([
        r.id, r.code, r.team_name, r.institution, JSON.stringify(r.categories),
        p.team?.leadName, r.lead_email, p.team?.leadPhone,
        (p.members || []).length, new Date(r.created_at).toISOString(), JSON.stringify(p),
      ].map(esc).join(','));
    }
    res.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="ifest2026-registrations.csv"',
    });
    res.end(lines.join('\n') + '\n');
  } catch (e) {
    console.error('csv failed:', e);
    jsonError(res, 500, e.message);
  }
}
