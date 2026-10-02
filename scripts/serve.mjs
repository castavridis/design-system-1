/**
 * Serves `demo/` over HTTP so the generated palette page can be opened in a
 * browser (e.g. a forwarded devcontainer port). No dependencies — Node's own
 * http/fs — so it runs on whatever Node the container has.
 *
 * Port is `$PORT` or 4321. `/` serves `palette.html`.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

const root = new URL('../demo/', import.meta.url)
const port = Number(process.env.PORT) || 4321

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

const server = createServer(async (req, res) => {
  // Path only, no query; `/` → palette.html; strip leading slash for the URL base.
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (path === '/') path = '/palette.html'

  // Keep requests inside demo/ — reject any `..` traversal.
  if (path.includes('..')) {
    res.writeHead(403).end('Forbidden')
    return
  }

  try {
    const body = await readFile(new URL('.' + path, root))
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
  }
})

server.listen(port, () => {
  console.log(`▸ serving demo/ at http://localhost:${port}/ (Ctrl-C to stop)`)
})
