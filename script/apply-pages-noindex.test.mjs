import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { addNoindex, applyNoindexToSite } from './apply-pages-noindex.mjs'

function robotsInHead(html) {
  const dom = new JSDOM(html)
  const content = [...dom.window.document.head.querySelectorAll('meta[name="robots"]')]
    .map((element) => element.getAttribute('content'))
  dom.window.close()
  return content
}

test('adds a crawlable noindex directive to a page head', () => {
  const html = '<!doctype html><html><head><title>Landing</title></head><body></body></html>'
  const result = addNoindex(html, 'index.html')

  assert.deepEqual(robotsInHead(result), ['noindex'])
})

test('normalizes an existing robots directive to noindex alone', () => {
  const html = '<html><head><meta name="robots" content="noindex, follow" /></head></html>'
  const result = addNoindex(html, 'redirect.html')

  assert.match(result, /<meta name="robots" content="noindex" \/>/)
  assert.doesNotMatch(result, /noindex,\s*follow/)
  assert.deepEqual(robotsInHead(result), ['noindex'])
})

test('ignores robots-looking text inside comments and script strings', () => {
  const html = '<html><head><!-- <meta name="robots" content="index"> --><script>const example = \'<meta name="robots" content="index">\';</script><title>Example</title></head><body></body></html>'
  const result = addNoindex(html, 'comment-and-script.html')

  assert.ok(result.includes('<!-- <meta name="robots" content="index"> -->'))
  assert.ok(result.includes("const example = '<meta name=\"robots\" content=\"index\">'"))
  assert.deepEqual(robotsInHead(result), ['noindex'])
})

test('normalizes crawler-specific directives that could override robots', () => {
  const html = '<html><head><meta name="robots" content="index"><meta name="googlebot" content="index, follow"></head></html>'
  const result = addNoindex(html, 'specific-crawler.html')
  const dom = new JSDOM(result)
  assert.equal(dom.window.document.head.querySelector('meta[name="robots"]')?.content, 'noindex')
  assert.equal(dom.window.document.head.querySelector('meta[name="googlebot"]')?.content, 'noindex')
  dom.window.close()
})

test('normalizes valid unquoted attributes and ignores meta elements outside the head', () => {
  const unquoted = '<html><head><meta name=robots content=index></head><body></body></html>'
  const unquotedResult = addNoindex(unquoted, 'unquoted.html')
  assert.deepEqual(robotsInHead(unquotedResult), ['noindex'])

  const outsideHead = '<html><head></head><body><meta name=robots content=index></body></html>'
  const outsideResult = addNoindex(outsideHead, 'outside-head.html')
  const dom = new JSDOM(outsideResult)
  assert.deepEqual(
    [...dom.window.document.head.querySelectorAll('meta[name="robots"]')].map((element) => element.content),
    ['noindex'],
  )
  assert.equal(dom.window.document.body.querySelector('meta[name="robots"]')?.content, 'index')
  dom.window.close()
})

test('rejects ambiguous duplicate robots directives', () => {
  const html = '<html><head><meta name="robots" content="index"><meta name="robots" content="noindex"></head></html>'
  assert.throws(() => addNoindex(html, 'duplicate.html'), /more than one effective robots meta tag/)
})

test('normalizes every nested HTML artifact and is idempotent', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pages-noindex-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'docs', 'nested'), { recursive: true })
  await writeFile(path.join(root, 'index.html'), '<html><head></head><body>home</body></html>')
  await writeFile(
    path.join(root, 'docs', 'nested', 'index.html'),
    '<html><head><meta name="robots" content="index, follow"></head></html>',
  )

  assert.deepEqual(await applyNoindexToSite(root), { htmlFiles: 2, updated: 2 })
  for (const relativePath of ['index.html', 'docs/nested/index.html']) {
    const html = await readFile(path.join(root, relativePath), 'utf8')
    assert.deepEqual(robotsInHead(html), ['noindex'])
  }
  assert.deepEqual(await applyNoindexToSite(root), { htmlFiles: 2, updated: 0 })
})
