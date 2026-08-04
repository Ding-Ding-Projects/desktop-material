import { describe, it } from 'node:test'
import assert from 'node:assert'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const root = process.cwd()
const readSite = () => readFileSync(join(root, 'site', 'index.html'), 'utf8')

/**
 * Every Cheap LFS document the site is expected to hand off to.
 *
 * The site's Cheap LFS pages are a tour: a couple of thousand characters of
 * summary against roughly three thousand lines of reference under `docs/`.
 * That is a reasonable split right up until the tour links to none of it,
 * which is what it did — the only "docs" link in the whole section was the
 * in-page `#docs` anchor, so the summary was where the subject ended.
 */
const REFERENCES = [
  'features/repository-management/release-backed-cheap-lfs',
  'features/repository-management/cheap-lfs-vs-git-lfs',
  'features/repository-management/cheap-lfs-oci-registry-backend',
  'features/repository-management/cheap-lfs-asset-versioning',
  'features/repository-management/cheap-lfs-release-payload-encryption',
  'features/linux-tui/cheap-lfs',
  'features/linux-tui/cheap-lfs-git-wrapper',
]

describe('site Cheap LFS reference links', () => {
  it('hands off from the summary to every Cheap LFS document', () => {
    const site = readSite()

    for (const reference of REFERENCES) {
      assert.ok(
        site.includes(`./docs/${reference}.html`),
        `the site must link to ${reference}, or its summary is a dead end`
      )
    }
  })

  it('links only at documents that actually exist', () => {
    // A link into `docs/` is a promise about a file the Pages build renders
    // from markdown. A typo here ships a 404 rather than failing anything.
    for (const reference of REFERENCES) {
      assert.ok(
        existsSync(join(root, 'docs', `${reference}.md`)),
        `docs/${reference}.md is linked from the site but does not exist`
      )
    }
  })

  it('points at rendered pages, not at raw markdown', () => {
    // The Pages build renders `docs/**.md` to `.html`; linking the `.md` would
    // download the source instead of opening the page.
    const site = readSite()
    const markdownLinks = site.match(/href="\.\/docs\/[^"]+\.md"/g)

    assert.strictEqual(markdownLinks, null)
  })
})
