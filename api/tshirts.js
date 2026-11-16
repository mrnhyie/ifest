import { query } from './_lib/db.js';
import { sendJson, jsonError, isAdmin, newCode, readJson } from './_lib/http.js';
import { validateRequest, sizeRun, colorRun } from './_lib/tshirts.js';

export default async function handler(req, res) {
  if (req.method === 'GET') return list(req, res);
  if (req.method !== 'POST') return jsonError(res, 405, 'method not allowed');

  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    if (e.status) return jsonError(res, e.status, e.message);
    return jsonError(res, 400, 'invalid JSON body');
  }

  let v;
  try {
    v = validateRequest(body);
  } catch (e) {
    return jsonError(res, 422, e.message);
  }

  let teamName = null;
  if (v.teamCode) {
    try {
      const { rows } = await query('SELECT team_name FROM registrations WHERE code = $1', [v.teamCode]);
      if (!rows.length) {
        return jsonError(res, 422, `team code ${v.teamCode} was not found — leave it blank if you have not registered yet`);
      }
      teamName = rows[0].team_name;
    } catch (e) {
      console.error('team lookup failed:', e);
      return jsonError(res, 500, 'failed to save your request');
    }
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode('TS26-');
    try {
      const ins = await query(
        `INSERT INTO tshirt_requests
           (code, name, email, phone, org, role, team_code, team_name, items, total,
            unit_price, amount, pickup, collector, momo_network, momo_ref, momo_sender, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10,
                 $11, $12, $13, $14, $15, $16, $17, $18)
         ON CONFLICT (code) DO NOTHING RETURNING created_at`,
        [code, v.name, v.email, v.phone, v.org, v.role, v.teamCode || null, teamName,
         JSON.stringify(v.items), v.total, v.unitPrice, v.amount, v.pickup, v.collector,
         v.momoNetwork, v.momoRef, v.momoSender, v.notes]
      );
      if (!ins.rowCount) continue;
      return sendJson(res, 200, {
        ok: true, code, total: v.total, sizes: sizeRun(v.items), colors: colorRun(v.items),
        unitPrice: v.unitPrice, amount: v.amount, teamName,
        createdAt: ins.rows[0].created_at,
      });
    } catch (e) {
      console.error('tshirt request failed:', e);
      return jsonError(res, 500, 'failed to save your request');
    }
  }
  return jsonError(res, 500, 'could not allocate a request code, please try again');
}

async function list(req, res) {
  if (!isAdmin(req)) return jsonError(res, 401, 'unauthorized');
  try {
    const { rows } = await query(
      `SELECT id, code, name, email, phone, org, role, team_code, team_name,
              items, total, unit_price, amount, pickup, collector,
              momo_network, momo_ref, momo_sender, notes, status, created_at
       FROM tshirt_requests ORDER BY id DESC`
    );
    sendJson(res, 200, rows.map(r => ({
      id: Number(r.id),
      code: r.code,
      name: r.name,
      email: r.email,
      phone: r.phone,
      org: r.org,
      role: r.role,
      teamCode: r.team_code,
      teamName: r.team_name,
      items: r.items,
      total: r.total,
      unitPrice: r.unit_price,
      amount: r.amount,
      pickup: r.pickup,
      collector: r.collector,
      momoNetwork: r.momo_network,
      momoRef: r.momo_ref,
      momoSender: r.momo_sender,
      notes: r.notes,
      status: r.status,
      createdAt: r.created_at,
    })));
  } catch (e) {
    console.error('tshirt list failed:', e);
    jsonError(res, 500, e.message);
  }
}