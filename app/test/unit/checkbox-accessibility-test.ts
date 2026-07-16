import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const readUI = (name: string) =>
  readFileSync(join(process.cwd(), 'app', 'src', 'ui', name), 'utf8')

describe('checkbox accessible names', () => {
  it('forwards an explicit accessible name to the native checkbox', () => {
    const checkbox = readUI('lib/checkbox.tsx')
    assert.match(checkbox, /readonly ariaLabel\?: string/)
    assert.match(checkbox, /aria-label=\{this\.props\.ariaLabel\}/)
  })

  it('names row checkboxes whose visible text lives outside the control', () => {
    assert.match(
      readUI('changes/changed-file.tsx'),
      /ariaLabel=\{`Include \$\{path\} in commit`\}/
    )
    assert.match(
      readUI('clone-repository/cloneable-repository-filter-list.tsx'),
      /ariaLabel=\{`Select \$\{item\.text\[0\]\} for cloning`\}/
    )
    assert.match(
      readUI('repository-list-transfer/import-repositories-dialog.tsx'),
      /ariaLabel=\{`Select \$\{props\.url\} for import`\}/
    )
    assert.match(
      readUI('repository-list-transfer/export-repositories-dialog.tsx'),
      /ariaLabel=\{`Select \$\{repository\.name\} for export`\}/
    )
  })
})
