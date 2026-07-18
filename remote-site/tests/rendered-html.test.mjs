import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function render(path = '/') {
  const workerUrl = new URL('../dist/server/index.js', import.meta.url)
  workerUrl.searchParams.set('test', `${process.pid}-${Date.now()}-${path}`)
  const { default: worker } = await import(workerUrl.href)

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: 'text/html' },
    }),
    {
      ASSETS: {
        fetch: async () => new Response('Not found', { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    }
  )
}

test('server-renders the Desktop Material Remote pairing route', async () => {
  const response = await render('/connect')
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /^text\/html\b/i)
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('x-frame-options'), 'DENY')
  assert.match(
    response.headers.get('content-security-policy') ?? '',
    /frame-ancestors 'none'/
  )

  const html = await response.text()
  assert.match(html, /<title>Connect · Desktop Material Remote<\/title>/i)
  assert.match(html, /Your repositories, within reach\./)
  assert.match(html, /Connect this device/)
  assert.match(html, /One-time pairing code or link/)
  assert.match(html, /Stay logged in/)
  assert.match(html, /Use a private same-origin gateway/)
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i)
  assert.doesNotMatch(html, /Your site is taking shape|Starter Project/i)
})

test('ships the secure remote contract and removes starter artifacts', async () => {
  const [
    client,
    page,
    layout,
    css,
    packageJson,
    caddy,
    compose,
    dockerfile,
    worker,
    standaloneFix,
  ] = await Promise.all([
    readFile(new URL('app/remote-app.tsx', root), 'utf8'),
    readFile(new URL('app/page.tsx', root), 'utf8'),
    readFile(new URL('app/layout.tsx', root), 'utf8'),
    readFile(new URL('app/globals.css', root), 'utf8'),
    readFile(new URL('package.json', root), 'utf8'),
    readFile(new URL('Caddyfile', root), 'utf8'),
    readFile(new URL('docker-compose.yml', root), 'utf8'),
    readFile(new URL('Dockerfile', root), 'utf8'),
    readFile(new URL('worker/index.ts', root), 'utf8'),
    readFile(new URL('scripts/fix-vinext-standalone.mjs', root), 'utf8'),
  ])

  assert.match(page, /<RemoteApp \/>/)
  assert.match(layout, /Desktop Material Remote/)
  assert.match(layout, /desktop-material-remote-social\.png/)
  assert.doesNotMatch(layout, /codex-preview|_sites-preview/)
  assert.doesNotMatch(packageJson, /react-loading-skeleton/)
  assert.match(packageJson, /"name": "desktop-material-remote"/)

  assert.match(client, /remote\/status/)
  assert.match(client, /remote\/pair/)
  assert.match(client, /remote\/devices/)
  assert.match(client, /body: \{ name: command, args \}/)
  assert.match(client, /list-ssh-hosts/)
  assert.match(client, /clone-to-ssh/)
  assert.match(client, /UNSAFE YOLO LAN MODE/)
  assert.match(client, /new URLSearchParams\(window\.location\.hash/)
  assert.match(client, /window\.history\.replaceState/)
  assert.match(client, /window\.localStorage\.setItem\(/)
  assert.match(client, /window\.sessionStorage\.setItem\(/)
  assert.match(client, /pairingInvitationRef\.current = invitation/)
  assert.match(client, /setPairCode\(''\)/)
  assert.doesNotMatch(client, /Invitation for \{pairingAgent\}/)
  assert.match(client, /trimmed\.startsWith\('\/\/'\)/)
  assert.match(client, /trimmed\.includes\('\\\\'\)/)
  assert.ok(
    client.indexOf("'remote/status'") < client.indexOf("'info'"),
    'public status must be checked before authenticated info'
  )
  const revocationContract = client.slice(
    client.indexOf('function isRevocationError'),
    client.indexOf('function formatLastSeen')
  )
  assert.match(revocationContract, /error\.status === 401/)
  assert.doesNotMatch(revocationContract, /error\.status === 403/)
  assert.doesNotMatch(client, /console\.(?:log|info|debug|warn|error)/)

  assert.match(css, /--md-primary:/)
  assert.match(css, /min-height:\s*48px/)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)

  assert.match(caddy, /@agent path \/api\/v1/)
  assert.doesNotMatch(caddy, /header_up -Origin/)
  assert.match(caddy, /header_up -Cookie/)
  assert.match(caddy, /header_up Host \{upstream_hostport\}/)
  assert.match(caddy, /Content-Security-Policy/)
  assert.doesNotMatch(caddy, /^\s*log\s/m)
  assert.match(compose, /DESKTOP_MATERIAL_AGENT_URL/)
  assert.doesNotMatch(compose, /host\.docker\.internal/)
  assert.match(compose, /read_only:\s*true/)
  assert.match(dockerfile, /FROM node:22\.13-alpine AS runtime/)
  assert.match(dockerfile, /HOST=0\.0\.0\.0/)
  assert.match(dockerfile, /USER node/)
  assert.match(packageJson, /dist\/standalone\/server\.js/)
  assert.match(standaloneFix, /split\(path\.sep\)\.join\("\/"\)/)
  assert.match(worker, /Content-Security-Policy/)
  assert.match(worker, /Strict-Transport-Security/)
  assert.match(worker, /withSecurityHeaders\(request, await handler\.fetch/)

  await Promise.all([
    assert.rejects(
      access(new URL('app/_sites-preview/SkeletonPreview.tsx', root))
    ),
    assert.rejects(access(new URL('app/_sites-preview/preview.css', root))),
    assert.rejects(access(new URL('public/window.svg', root))),
    access(new URL('public/desktop-material-remote-social.png', root)),
  ])
})
