import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, it } from 'node:test'

const root = join(import.meta.dirname, '..')
const rootPreview = join(root, 'social-preview.png')
const servedPreview = join(root, 'docs', 'assets', 'social-preview.png')
const requiredMeta = [
  'og:title',
  'og:description',
  'og:url',
  'og:type',
  'og:site_name',
  'og:image',
  'og:image:width',
  'og:image:height',
  'og:image:alt',
]

function htmlPages(directory) {
  const result = []
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        visit(path)
      } else if (entry.name.endsWith('.html')) {
        result.push(path)
      }
    }
  }
  visit(directory)
  return result.sort()
}

function validateMeta(source, path) {
  const errors = []
  for (const property of requiredMeta) {
    if (!source.includes(`property="${property}"`)) {
      errors.push(`${path} is missing ${property}`)
    }
  }
  if (!source.includes('name="twitter:card" content="summary_large_image"')) {
    errors.push(`${path} is missing the large-image card`)
  }
  if (!source.includes('name="theme-color"')) {
    errors.push(`${path} is missing theme-color`)
  }
  if (
    !source.includes(
      'content="https://ding-ding-projects.github.io/desktop-material/assets/social-preview.png"'
    )
  ) {
    errors.push(`${path} does not use the absolute HTTPS preview URL`)
  }
  return errors
}

describe('repository and page social preview', () => {
  it('keeps a real 1280 by 640 root preview byte-identical to the served copy', () => {
    const rootBytes = readFileSync(rootPreview)
    const servedBytes = readFileSync(servedPreview)

    assert.deepEqual(rootBytes, servedBytes)
    assert.deepEqual(
      [...rootBytes.subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10]
    )
    assert.equal(rootBytes.readUInt32BE(16), 1280)
    assert.equal(rootBytes.readUInt32BE(20), 640)
    assert.ok(statSync(rootPreview).size > 50_000)
  })

  it('serves complete static metadata on every HTML page', () => {
    const pages = htmlPages(join(root, 'docs'))
    assert.equal(pages.length, 131)
    for (const page of pages) {
      const path = relative(root, page).split(sep).join('/')
      assert.deepEqual(validateMeta(readFileSync(page, 'utf8'), path), [])
    }
  })

  it('turns red when any required metadata boundary disappears', () => {
    const source = readFileSync(join(root, 'docs', 'index.html'), 'utf8')
    for (const property of requiredMeta) {
      const broken = source.replace(
        `property="${property}"`,
        'property="removed"'
      )
      assert.ok(
        validateMeta(broken, 'docs/index.html').some(error =>
          error.includes(`missing ${property}`)
        )
      )
    }
    assert.ok(
      validateMeta(
        source.replace('summary_large_image', 'summary'),
        'docs/index.html'
      ).some(error => error.includes('large-image card'))
    )
  })
})
