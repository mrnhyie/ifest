import { validate } from './_lib/validate.js';
import { transaction } from './_lib/db.js';
import { sendJson, jsonError, newCode, newSecret } from './_lib/http.js';
import { parseMultipart } from './_lib/multipart.js';

function fail(status, msg) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonError(res, 405, 'method not allowed');

  let parsed;
  try {
    parsed = await parseMultipart(req);
  } catch (e) {
    return jsonError(res, e.status || 400, e.error || e.message || 'upload failed');
  }
  const raw = parsed.fields.payload;
  if (!raw) return jsonError(res, 400, 'missing payload');
  if (raw.length > 512000) return jsonError(res, 413, 'payload too large');

  let p;
  try {
    p = JSON.parse(raw);
  } catch {
    return jsonError(res, 400, 'invalid payload JSON');
  }
  try {
    validate(p);
  } catch (e) {
    return jsonError(res, 422, e.message);
  }

  p.team.institution = p.team.institution.trim();
  const lowInst = p.team.institution.toLowerCase();
  const leadEmail = p.team.leadEmail.trim().toLowerCase();
  const memberEmails = p.members.map(m => m.email.trim().toLowerCase());

  const seen = new Set();
  for (const e of memberEmails) {
    if (seen.has(e)) return jsonError(res, 409, `duplicate member email within this team: ${e}`);
    seen.add(e);
  }
  if (p.declarations.minorConsent && !parsed.files.consent) {
    return jsonError(res, 422, 'parental/guardian consent form upload is required when a member is under 18');
  }

  const allEmails = [...new Set([leadEmail, ...memberEmails])];

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    try {
      await transaction(async client => {
        for (const cat of p.categories) {
          await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`reg:${lowInst}:${cat}`]);
          const { rows } = await client.query(
            `SELECT count(*)::int AS n FROM registrations
             WHERE lower(institution) = $1 AND categories @> jsonb_build_array($2::text)`,
            [lowInst, cat]
          );
          if (rows[0].n >= 2) {
            throw fail(409, `institution "${p.team.institution}" already has 2 teams registered for ${cat}`);
          }
        }
        for (const e of allEmails) {
          const ins = await client.query(
            'INSERT INTO member_emails (email, code) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING email',
            [e, code]
          );
          if (ins.rowCount === 0) {
            const ex = await client.query('SELECT code FROM member_emails WHERE email = $1', [e]);
            throw fail(409, `member ${e} is already registered in team ${ex.rows[0] ? ex.rows[0].code : 'another'}`);
          }
        }
        p.files = {};
        for (const [k, f] of Object.entries(parsed.files)) {
          const secret = newSecret();
          await client.query(
            `INSERT INTO uploads (code, field_key, filename, content_type, size, secret, data)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [code, k, sanitize(f.filename), f.contentType, f.data.length, secret, f.data]
          );
          p.files[k] = `/api/file/${code}/${k}/${secret}`;
        }
        const cats = JSON.stringify(p.categories);
        const blob = JSON.stringify(p);
        const ins = await client.query(
          `INSERT INTO registrations (code, team_name, institution, categories, lead_email, payload)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (code) DO NOTHING RETURNING id`,
          [code, p.team.name, p.team.institution, cats, leadEmail, blob]
        );
        if (ins.rowCount === 0) throw Object.assign(new Error('code collision'), { retry: true });
      });
      return sendJson(res, 200, { ok: 'true', code });
    } catch (e) {
      if (e.retry) continue;
      if (e.status) return jsonError(res, e.status, e.message);
      console.error('register failed:', e);
      return jsonError(res, 500, 'failed to save registration');
    }
  }
  return jsonError(res, 500, 'could not allocate a team code, please try again');
}

function sanitize(name = '') {
  return name.replace(/[\\/]/g, '').replace(/[\u0000-\u001f\u0022]/g, '').slice(-120);
}
