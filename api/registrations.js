import { query } from './_lib/db.js';
import { sendJson, jsonError, isAdmin } from './_lib/http.js';

export default async function handler(req, res) {
  if (!isAdmin(req)) return jsonError(res, 401, 'unauthorized');
  const params = new URL(req.url, 'http://r.sc').searchParams;
  const q = (params.get('q') || '').trim();
  const cat = params.get('category') || '';

  const where = [];
  const args = [];
  if (q) {
    args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    where.push(`(team_name ILIKE $1 OR institution ILIKE $2 OR lead_email ILIKE $3 OR code ILIKE $4)`);
  }
  if (cat) {
    args.push(cat);
    where.push(`categories @> jsonb_build_array($${args.length}::text)`);
  }
  const sql = `
    SELECT id, code, team_name, institution, categories, lead_email,
           created_at, payload::text AS payload
    FROM registrations
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY id DESC`;
  try {
    const { rows } = await query(sql, args);
    const out = rows.map(r => {
      const p = JSON.parse(r.payload);
      return {
        id: Number(r.id),
        code: r.code,
        teamName: r.team_name,
        institution: r.institution,
        categories: r.categories,
        leadEmail: r.lead_email,
        createdAt: r.created_at,
        members: (p.members || []).length,
        payload: { team: p.team, categories: p.categories },
      };
    });
    sendJson(res, 200, out);
  } catch (e) {
    console.error('list failed:', e);
    jsonError(res, 500, e.message);
  }
}
