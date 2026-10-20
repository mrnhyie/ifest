import { query } from '../../../_lib/db.js';

export default async function handler(req, res) {
  const { code, key, secret } = req.query;
  if (!/^IF26-[A-Z0-9]{6}$/.test(code || '') || !/^[a-zA-Z0-9_]{1,40}$/.test(key || '') || !/^[a-f0-9]{16}$/.test(secret || '')) {
    res.writeHead(404);
    return res.end('not found');
  }
  try {
    const { rows } = await query(
      'SELECT filename, content_type, data FROM uploads WHERE code = $1 AND field_key = $2 AND secret = $3',
      [code, key, secret]
    );
    if (!rows.length) {
      res.writeHead(404);
      return res.end('not found');
    }
    const r = rows[0];
    res.writeHead(200, {
      'Content-Type': r.content_type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${(r.filename || key).slice(0, 100)}"`,
      'Cache-Control': 'private, max-age=3600',
    });
    res.end(r.data);
  } catch (e) {
    console.error('file failed:', e);
    res.writeHead(500);
    res.end('error');
  }
}
