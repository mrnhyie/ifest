import { query, transaction } from '../_lib/db.js';
import { sendJson, jsonError, isAdmin } from '../_lib/http.js';

export default async function handler(req, res) {
  if (!isAdmin(req)) return jsonError(res, 401, 'unauthorized');
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) return jsonError(res, 404, 'not found');

  if (req.method === 'DELETE') {
    try {
      const deleted = await transaction(async client => {
        const del = await client.query('DELETE FROM registrations WHERE id = $1 RETURNING code, team_name', [id]);
        if (!del.rowCount) return null;
        const { code, team_name: teamName } = del.rows[0];
        await client.query('DELETE FROM member_emails WHERE code = $1', [code]);
        await client.query('DELETE FROM uploads WHERE code = $1', [code]);
        return { code, teamName };
      });
      if (!deleted) return jsonError(res, 404, 'not found');
      return sendJson(res, 200, { ok: true, ...deleted });
    } catch (e) {
      console.error('delete failed:', e);
      return jsonError(res, 500, e.message);
    }
  }

  if (req.method !== 'GET') return jsonError(res, 405, 'method not allowed');

  try {
    const { rows } = await query(
      `SELECT id, code, team_name, institution, categories, lead_email, created_at, payload::text AS payload
       FROM registrations WHERE id = $1`,
      [id]
    );
    if (!rows.length) return jsonError(res, 404, 'not found');
    const r = rows[0];
    const p = JSON.parse(r.payload);
    sendJson(res, 200, {
      id: Number(r.id),
      code: r.code,
      teamName: r.team_name,
      institution: r.institution,
      categories: r.categories,
      leadEmail: r.lead_email,
      createdAt: r.created_at,
      members: (p.members || []).length,
      payload: p,
    });
  } catch (e) {
    console.error('get failed:', e);
    jsonError(res, 500, e.message);
  }
}
