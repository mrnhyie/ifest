import crypto from 'node:crypto';

export function sendJson(res, status, v) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(v));
}

export function jsonError(res, status, msg) {
  sendJson(res, status, { error: msg });
}

export function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const b = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) s += alphabet[b[i] % alphabet.length];
  return 'IF26-' + s;
}

export function newSecret() {
  return crypto.randomBytes(8).toString('hex');
}

export function isAdmin(req) {
  const tok = process.env.ADMIN_TOKEN;
  if (!tok) return false;
  return req.headers['x-admin-token'] === tok;
}
