import { query } from '../_lib/db.js';
import { sendJson, jsonError, isAdmin, readJson } from '../_lib/http.js';
import { STATUSES } from '../_lib/tshirts.js';

export default async function handler(req, res) {
  if (!isAdmin(req)) return jsonError(res, 401, 'unauthorized');
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) return jsonError(res, 404, 'not found');

  if (req.method === 'DELETE') {
    try {
      const del = await query(
        'DELETE FROM tshirt_requests WHERE id = $1 RETURNING code, name, total',
        [id]
      );
      if (!del.rowCount) return jsonError(res, 404, 'not found');
      return sendJson(res, 200, { ok: true, ...del.rows[0] });
    } catch (e) {
      console.error('tshirt delete failed:', e);
      return jsonError(res, 500, e.message);
    }
  }

  if (req.method === 'PATCH') {
    let body;
    try {
      body = await readJson(req, 4096);
    } catch (e) {
      return jsonError(res, e.status || 400, 'invalid JSON body');
    }
    const status = body?.status;
    if (!STATUSES.includes(status)) {
      return jsonError(res, 422, `status must be one of: ${STATUSES.join(', ')}`);
    }
    try {
      const up = await query(
        'UPDATE tshirt_requests SET status = $1 WHERE id = $2 RETURNING code, status',
        [status, id]
      );
      if (!up.rowCount) return jsonError(res, 404, 'not found');
      return sendJson(res, 200, { ok: true, ...up.rows[0] });
    } catch (e) {
      console.error('tshirt status failed:', e);
      return jsonError(res, 500, e.message);
    }
  }

  return jsonError(res, 405, 'method not allowed');
}