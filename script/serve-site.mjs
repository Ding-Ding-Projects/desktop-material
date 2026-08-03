#!/usr/bin/env node
//
// Static file server for previewing the published site locally.
//
//   node script/serve-site.mjs [rootDir] [--port 4173]
//
// Defaults to serving `site/`, which is what GitHub Pages publishes at the
// root. Pass `_site` after running the Pages workflow's assembly steps to
// preview the site together with the rendered documentation tree.
//
// Deliberately minimal: no dependencies, no caching, no directory listing, and
// it refuses any path that escapes the root. It exists so a change to the site
// can be looked at in a browser before it is pushed — nothing in the build
// depends on it.

import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.lua': 'text/plain; charset=utf-8',
}

const positional = []
let port = 4173
for (let index = 2; index < process.argv.length; index++) {
  const argument = process.argv[index]
  if (argument === '--port') port = Number(process.argv[++index])
  else if (argument.startsWith('--port=')) port = Number(argument.slice(7))
  else positional.push(argument)
}

const root = resolve(positional[0] ?? 'site')

const resolveTarget = async urlPath => {
  // normalize() collapses any `..` before the prefix check, so a crafted URL
  // cannot read outside the served directory.
  const relative = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(
    /^([/\\])+/,
    ''
  )
  const candidate = resolve(join(root, relative))
  if (candidate !== root && !candidate.startsWith(root + sep)) return null
  try {
    const info = await stat(candidate)
    if (!info.isDirectory()) return candidate
  } catch {
    return null
  }
  const index = join(candidate, 'index.html')
  try {
    await stat(index)
    return index
  } catch {
    return null
  }
}

createServer((request, response) => {
  resolveTarget(request.url ?? '/')
    .then(target => {
      if (target == null) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end(`404 — ${request.url}\n`)
        return
      }
      response.writeHead(200, {
        'Content-Type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      createReadStream(target).pipe(response)
    })
    .catch(error => {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end(`500 — ${error.message}\n`)
    })
}).listen(port, () => {
  process.stdout.write(`Serving ${root} on http://localhost:${port}/\n`)
})
