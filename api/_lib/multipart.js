import busboy from 'busboy';

const MAX_FILE = 6 << 20;
const MAX_TOTAL = 20 << 20;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
export const ALLOWED_FIELDS = new Set([
  'consent', 'robotPhoto', 'pitchDeck',
  'memberId_0', 'memberId_1', 'memberId_2', 'memberId_3', 'memberId_4',
]);

export function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers, limits: { files: 10, fileSize: MAX_FILE, fields: 40 } });
    const fields = {};
    const files = {};
    let total = 0;
    let failed = null;

    bb.on('field', (name, val) => {
      if (name === 'payload') fields.payload = val;
    });
    bb.on('file', (name, stream, info) => {
      if (!ALLOWED_FIELDS.has(name)) {
        stream.resume();
        return;
      }
      const chunks = [];
      stream.on('data', c => {
        chunks.push(c);
        total += c.length;
        if (total > MAX_TOTAL) {
          failed = { status: 413, error: 'uploads exceed 20 MB total' };
          bb.destroy();
        }
      });
      stream.on('limit', () => {
        failed = { status: 413, error: `file too large (max 6 MB): ${name}` };
        bb.destroy();
      });
      stream.on('end', () => {
        if (failed) return;
        if (!ALLOWED_MIME.has(info.mimeType)) {
          failed = { status: 422, error: `unsupported file type for ${name}: ${info.mimeType}` };
          bb.destroy();
          return;
        }
        files[name] = { data: Buffer.concat(chunks), filename: info.filename, contentType: info.mimeType };
      });
    });
    bb.on('close', () => (failed ? reject(failed) : resolve({ fields, files })));
    bb.on('error', reject);
    req.on('error', reject);
    req.pipe(bb);
  });
}
