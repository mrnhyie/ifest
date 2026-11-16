import crypto from 'node:crypto';

export function sendJson(res, status, v) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(v));
}

export function jsonError(res, status, msg) {
  sendJson(res, status, { error: msg });
}

export function newCode(prefix = 'IF26-') {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const b = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) s += alphabet[b[i] % alphabet.length];
  return prefix + s;
}

export function newSecret() {
  return crypto.randomBytes(8).toString('hex');
}

export function isAdmin(req) {
  const tok = process.env.ADMIN_TOKEN;
  if (!tok) return false;
  return req.headers['x-admin-token'] === tok;
}

// Vercel hands us a pre-parsed req.body; the plain Node server hands us a stream.
export async function readJson(req, limit = 64 * 1024) {
  const tooBig = () => Object.assign(new Error('request body too large'), { status: 413 });
  if (req.body != null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    const s = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    if (s.length > limit) throw tooBig();
    return JSON.parse(s);
  }
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limit) throw tooBig();
    chunks.push(c);
  }
  const s = Buffer.concat(chunks).toString('utf8');
  if (!s.trim()) throw Object.assign(new Error('empty request body'), { status: 400 });
  return JSON.parse(s);
}
