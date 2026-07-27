import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const operationStyles = readFileSync(
  join(process.cwd(), 'app/styles/ui/_operation-progress.scss'),
  'utf8'
)
const cheapLfsStyles = readFileSync(
  join(process.cwd(), 'app/styles/ui/_cheap-lfs.scss'),
  'utf8'
)

describe('Cheap LFS restore progress styles', () => {
  it('contains long bilingual copy and exact counters without horizontal clipping', () => {
    assert.match(
      operationStyles,
      /\.cheap-lfs-restore-progress,[\s\S]*?box-sizing:\s*border-box;[\s\S]*?min-width:\s*0;/
    )
    assert.match(
      operationStyles,
      /\.cheap-lfs-restore-progress \{[\s\S]*?overflow-wrap:\s*anywhere;/
    )
    assert.match(
      cheapLfsStyles,
      /\.cheap-lfs-restore-lane-path \{[\s\S]*?overflow-wrap:\s*anywhere;/
    )
    assert.match(cheapLfsStyles, /font-variant-numeric:\s*tabular-nums;/)
  })

  it('reflows lanes and stats at narrow widths used by 200% zoom', () => {
    assert.match(operationStyles, /@media \(max-width: 700px\)/)
    assert.match(
      operationStyles,
      /@media \(max-width: 700px\)[\s\S]*?\.cheap-lfs-restore-stats \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/
    )
    assert.match(
      cheapLfsStyles,
      /@media \(max-width: 700px\)[\s\S]*?\.cheap-lfs-restore-lanes \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/
    )
    assert.match(
      operationStyles,
      /\.cheap-lfs-restore-strip[\s\S]*?max-height:\s*min\(50vh, 480px\);[\s\S]*?overflow-y:\s*auto;[\s\S]*?scrollbar-gutter:\s*stable;/
    )
    assert.match(
      operationStyles,
      /\.batch-clone-finalizing-restore \{[\s\S]*?max-height:\s*min\(44vh, 440px\);[\s\S]*?overflow-y:\s*auto;/
    )
  })

  it('uses Material tokens and makes reduced-motion progress static', () => {
    assert.match(operationStyles, /--md-sys-color-primary-container/)
    assert.match(operationStyles, /--md-sys-color-secondary-container/)
    assert.match(cheapLfsStyles, /--md-sys-color-error-container/)
    assert.match(
      operationStyles,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.cheap-lfs-restore-progress[\s\S]*?\.operation-progress-track\.indeterminate::after \{[\s\S]*?animation:\s*none;[\s\S]*?transform:\s*none;/
    )
  })
})
