import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

loadEnv();
loadEnv({ path: '.env.local' });

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const WEB = join(ROOT, 'web');
const PORT = Number(process.env.PORT || 8090);

const ROUTES = [
  { method: 'POST', pattern: /^\/api\/register$/, file: 'api/register.js' },
  { method: 'GET', pattern: /^\/api\/check-member$/, file: 'api/check-member.js' },
  { method: 'GET', pattern: /^\/api\/registrations$/, file: 'api/registrations.js' },
  { method: 'GET', pattern: /^\/api\/export\.csv$/, file: 'api/export.csv.js' },
  {
    method: 'GET',
    pattern: /^\/api\/registrations\/(\d+)$/,
    file: 'api/registrations/[id].js',
    params: m => ({ id: m[1] }),
  },
  {
    method: 'GET',
    pattern: /^\/api\/file\/([^/]+)\/([^/]+)\/([^/]+)$/,
    file: 'api/file/[code]/[key]/[secret].js',
    params: m => ({ code: decodeURIComponent(m[1]), key: decodeURIComponent(m[2]), secret: decodeURIComponent(m[3]) }),
  },
];

const handlers = new Map();
async function handlerFor(route) {
  if (!handlers.has(route.file)) {
    const mod = await import(new URL(`./${route.file}`, import.meta.url).href);
    handlers.set(route.file, mod.default);
  }
  return handlers.get(route.file);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const STATIC_ROUTES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/admin': 'admin.html',
  '/admin.html': 'admin.html',
};

async function serveStatic(res, pathname) {
  const rel = STATIC_ROUTES[pathname] ?? (pathname.startsWith('/assets/') ? pathname.slice(1) : null);
  if (!rel) return false;
  const filePath = normalize(join(WEB, rel));
  if (!filePath.startsWith(WEB + sep) && filePath !== join(WEB, 'index.html')) return false;
  try {
    const buf = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(buf);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  for (const route of ROUTES) {
    if (route.method !== req.method) continue;
    const m = route.pattern.exec(pathname);
    if (!m) continue;
    const query = Object.fromEntries(url.searchParams);
    if (route.params) Object.assign(query, route.params(m));
    req.query = query;
    try {
      await (await handlerFor(route))(req, res, query);
    } catch (e) {
      console.error('handler failed:', pathname, e);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal error' }));
      }
    }
    return;
  }

  if (req.method === 'GET' && (await serveStatic(res, pathname))) return;
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

if (!process.env.DATABASE_URL) {
  console.warn('WARNING: DATABASE_URL is not set — API calls will fail. Set it in .env.local (Neon pooled URL).');
}
server.listen(PORT, () => {
  console.log(`iFESTIVAL portal: http://localhost:${PORT}/ (admin: /admin)`);
});
