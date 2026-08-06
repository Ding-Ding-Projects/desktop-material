import { describe, it } from 'node:test'
import assert from 'node:assert'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const root = process.cwd()
const galleryPath = join(root, 'docs', 'wiki', 'Feature-Gallery.md')
const screenshotDirectory = join(root, 'docs', 'assets', 'screenshots')
const canonicalRawImagePrefix =
  'https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/main/docs/assets/screenshots/'
const historicalLinuxAssets = [
  'linux-tui-bilingual-narrow.png',
  'linux-tui-cheap-lfs.png',
  'linux-tui-overview.png',
  'linux-tui-regex-builder.png',
  'linux-tui-text-input.png',
].sort()
const historicalGalleryAssets = [
  ...historicalLinuxAssets,
  'auto-updater-update-ready.png',
  'material-blank-startup-fixed-20260806.png',
  'material-command-palette-notification-before.png',
  'material-actions-job-log-404-recovery.png',
  'material-actions-job-log-404-recovered.png',
].sort()

describe('wiki function screenshot catalog', () => {
  it('assigns every tracked screenshot to exactly one named visual function', () => {
    const gallery = readFileSync(galleryPath, 'utf8')
    const rows = [
      ...gallery.matchAll(/^\| `([^`]+\.png)` \| ([^|]+?) \|$/gm),
    ].map(([, asset, name]) => ({ asset, name: name.trim() }))
    const assets = readdirSync(screenshotDirectory)
      .filter(name => name.endsWith('.png'))
      .sort()

    const archivedRows = [
      ...gallery.matchAll(
        /^\| `([^`]+\.png)` \| [^|]+ \| Excluded from the current Windows gallery \|$/gm
      ),
    ].map(([, asset]) => asset)

    assert.equal(rows.length, 93)
    assert.equal(new Set(rows.map(row => row.asset)).size, rows.length)
    assert.equal(new Set(rows.map(row => row.name)).size, rows.length)
    assert.deepEqual(archivedRows.sort(), historicalGalleryAssets)
    assert.deepEqual(
      [...rows.map(row => row.asset), ...archivedRows].sort(),
      assets
    )
    for (const row of rows) {
      assert.ok(existsSync(join(screenshotDirectory, row.asset)), row.asset)
    }
    assert.ok(
      rows.some(row => row.asset === 'auto-updater-current-source-ready.png')
    )
    assert.ok(
      rows.some(row => row.asset === 'material-publish-organization-picker.png')
    )
    assert.ok(!rows.some(row => row.asset === 'auto-updater-update-ready.png'))
  })

  it('renders one distinct raw-main image for every catalog row', () => {
    const gallery = readFileSync(galleryPath, 'utf8')
    const rowAssets = [
      ...gallery.matchAll(/^\| `([^`]+\.png)` \| ([^|]+?) \|$/gm),
    ].map(([, asset]) => asset)
    const renderedAssets = [
      ...gallery.matchAll(/!\[[^\]]+\]\((https:\/\/[^)]+\.png)\)/g),
    ]
      .map(([, url]) => url)
      .map(url => {
        return url.startsWith(canonicalRawImagePrefix)
          ? url.slice(canonicalRawImagePrefix.length)
          : undefined
      })
      .filter((asset): asset is string => asset !== undefined)

    assert.equal(renderedAssets.length, rowAssets.length)
    assert.equal(new Set(renderedAssets).size, renderedAssets.length)
    assert.deepEqual(renderedAssets.sort(), rowAssets.sort())
    assert.ok(
      gallery.includes(
        `${canonicalRawImagePrefix}material-ollama-model-manager.png`
      )
    )
    assert.ok(
      gallery.includes(
        `${canonicalRawImagePrefix}cheap-lfs-bambu-build-live.png`
      )
    )
    assert.ok(
      gallery.includes(
        `${canonicalRawImagePrefix}auto-updater-current-source-ready.png`
      )
    )
    assert.ok(
      gallery.includes(
        `${canonicalRawImagePrefix}material-publish-organization-picker.png`
      )
    )
    assert.match(
      gallery,
      /desktop-material\/923dbb51acad8f01f01f1c100c6945c7a2e08e23\/docs\/assets\/screenshots\/auto-updater-update-ready\.png/
    )
  })

  it('keeps Linux captures linked as history rather than current screenshots', () => {
    for (const file of [
      join(root, 'README.md'),
      join(root, 'docs', 'readme-tabs', 'screenshots.md'),
    ]) {
      const markdown = readFileSync(file, 'utf8')
      assert.match(
        markdown,
        /verification\/linux-tui-2026-07-27\/run-manifest\.md/
      )
      for (const asset of historicalLinuxAssets) {
        assert.ok(!markdown.includes(asset), `${file} still renders ${asset}`)
      }
    }
  })

  it('links the complete catalog from the wiki home and user guide', () => {
    for (const file of ['Home.md', 'User-Guide.md']) {
      const markdown = readFileSync(join(root, 'docs', 'wiki', file), 'utf8')
      assert.match(markdown, /\[Guided Feature Gallery\]\(Feature-Gallery\)/)
    }
  })
})

const submodulesGuidePath = join(root, 'docs', 'wiki', 'Submodules.md')
const illustrationDirectory = join(root, 'docs', 'assets', 'illustrations')
const rawIllustrationPrefix =
  'https://raw.githubusercontent.com/Ding-Ding-Projects/desktop-material/main/docs/assets/illustrations/'

describe('wiki submodules guide', () => {
  it('links the beginner submodule guide from the wiki home and user guide', () => {
    for (const file of ['Home.md', 'User-Guide.md']) {
      const markdown = readFileSync(join(root, 'docs', 'wiki', file), 'utf8')
      assert.match(markdown, /\[Submodules\]\(Submodules\)/)
    }
  })

  it('renders every tracked illustration exactly once from raw main', () => {
    const guide = readFileSync(submodulesGuidePath, 'utf8')
    const renderedAssets = [
      ...guide.matchAll(/!\[[^\]]+\]\((https:\/\/[^)]+\.svg)\)/g),
    ]
      .map(([, url]) => url)
      .filter(url => url.startsWith(rawIllustrationPrefix))
      .map(url => url.slice(rawIllustrationPrefix.length))
    const assets = readdirSync(illustrationDirectory)
      .filter(name => name.endsWith('.svg'))
      .sort()

    assert.ok(assets.length > 0, 'expected tracked submodule illustrations')
    assert.equal(new Set(renderedAssets).size, renderedAssets.length)
    assert.deepEqual([...renderedAssets].sort(), assets)
    for (const asset of renderedAssets) {
      assert.ok(existsSync(join(illustrationDirectory, asset)), asset)
    }
  })

  it('reuses the tracked Add Submodule screenshot', () => {
    const guide = readFileSync(submodulesGuidePath, 'utf8')
    assert.ok(
      guide.includes(`${canonicalRawImagePrefix}add-submodule-dialog.png`)
    )
  })
})
