import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const branchesStyle = readFileSync(
  join(process.cwd(), 'app', 'styles', 'ui', '_branches.scss'),
  'utf8'
)
const foldoutStyle = readFileSync(
  join(process.cwd(), 'app', 'styles', 'ui', '_foldout.scss'),
  'utf8'
)
const branchesContainer = readFileSync(
  join(process.cwd(), 'app', 'src', 'ui', 'branches', 'branches-container.tsx'),
  'utf8'
)
const branchList = readFileSync(
  join(process.cwd(), 'app', 'src', 'ui', 'branches', 'branch-list.tsx'),
  'utf8'
)
const noPullRequests = readFileSync(
  join(process.cwd(), 'app', 'src', 'ui', 'branches', 'no-pull-requests.tsx'),
  'utf8'
)

describe('repository + branch side sheets v2 styles', () => {
  it('renders branch rows with a bare 19px glyph instead of a tonal chip', () => {
    assert.match(
      branchesStyle,
      /#foldout-container \.branches-container[\s\S]*?\.branches-list-item\s*\{[\s\S]*?padding: 10px 12px;[\s\S]*?\.icon\s*\{[\s\S]*?width: 19px;[\s\S]*?height: 19px;[\s\S]*?background: transparent;[\s\S]*?color: var\(--md-sys-color-on-surface-variant\);/
    )
    // The 34x34 tonal chip and its current-branch tint are gone; the current
    // branch is marked only by the trailing check_circle.
    assert.ok(!branchesStyle.includes('width: 34px'))
    assert.doesNotMatch(branchesStyle, /current-branch \.icon/)
    assert.match(
      branchesStyle,
      /\.current-branch-indicator\s*\{[\s\S]*?color: var\(--md-sys-color-primary\);[\s\S]*?animation: dmPop/
    )
  })

  it('recomputes the sheet row height for the bare-glyph row geometry', () => {
    assert.match(branchesContainer, /export const SheetRowHeight = 42/)
    // The geometry comment stays accurate: 10px padding × 2 around a 22px line.
    assert.match(branchesContainer, /10 \+ 22 \+ 10 = 42/)
    assert.match(branchesContainer, /rowHeight=\{this\.getSheetRowHeight\}/)
    assert.match(
      branchList,
      /rowHeight=\{this\.props\.rowHeight \?\? RowHeight\}/
    )
    // The SCSS line box matches the constant: 22px name line inside 10px pads.
    assert.match(
      branchesStyle,
      /\.name\s*\{[\s\S]*?font-family: var\(--font-family-monospace\);[\s\S]*?line-height: 22px;/
    )
  })

  it('animates the New-branch FAB with the prototype dmPop timing and 8px glyph gap', () => {
    assert.match(
      branchesStyle,
      /\.new-branch-button\s*\{[\s\S]*?gap: 8px;[\s\S]*?animation: dmPop calc\(560ms \* var\(--mdur, 1\)\) var\(--spring-fast\) 240ms\s+backwards;/
    )
    assert.match(
      branchList,
      /className="new-branch-button"[\s\S]*?<MaterialSymbol name="add" \/>/
    )
  })

  it('keeps both merge actions and the New-branch FAB inside the branch sheet', () => {
    assert.match(
      branchesStyle,
      /#foldout-container \.branches-container[\s\S]*?\.merge-button-row\s*\{[\s\S]*?display: grid;[\s\S]*?width: 100%;[\s\S]*?min-width: 0;[\s\S]*?flex: 0 0 auto;[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?gap: var\(--spacing\);/
    )
    // `align-self: stretch` used to be asserted here, and it was the defect
    // rather than the contract. Stretching is only correct while the grid is
    // exactly as tall as its content; the moment it is taller — an empty branch
    // list leaving slack, a container that sizes differently — both buttons
    // inflate to fill it, and two 40px actions become slabs with their labels
    // marooned in the middle. It shipped, it was reported from a screenshot,
    // and this test had been holding it in place.
    //
    // What this test is actually for is that the buttons stay *inside* the
    // sheet: full width, no intrinsic right margin pushing them out, and
    // stretched across the column. That survives unchanged.
    assert.match(
      branchesStyle,
      /\.merge-button-row\s*\{[\s\S]*?> \.button-component\s*\{[\s\S]*?width: 100%;[\s\S]*?max-width: 100%;[\s\S]*?margin-right: 0;[\s\S]*?justify-self: stretch;/
    )
    // Bounded to the button rule's own body rather than written as
    // `.merge-button-row[\s\S]*?align-self: stretch`. A lazy any-character run
    // happily crosses closing braces, so that pattern matches an `align-self`
    // belonging to some entirely different rule further down the file — which
    // is how a negative assertion comes to fail on code that is correct.
    const buttonRule = /> \.button-component \{([^}]*)\}/.exec(
      branchesStyle.slice(branchesStyle.indexOf('.merge-button-row {'))
    )
    assert.ok(buttonRule !== null, 'the merge button rule is missing')
    assert.doesNotMatch(
      buttonRule[1],
      /align-self: stretch/,
      'a merge action must be the height of a button, not of whatever space is going spare'
    )
    assert.match(buttonRule[1], /align-self: start/)
    assert.match(buttonRule[1], /min-height: var\(--button-height\)/)
    assert.match(
      branchesStyle,
      /--dm-merge-bar-height: calc\(var\(--button-height\) \* 2 \+ var\(--spacing\) \* 3 \+ 1px\);/
    )
  })

  it('renders the no-pull-requests empty state as an illustrated blank slate', () => {
    assert.match(
      branchesStyle,
      /\.no-pull-requests\s*\{[\s\S]*?justify-content: center;[\s\S]*?text-align: center;[\s\S]*?padding: 40px;/
    )
    assert.match(
      branchesStyle,
      /\.no-pull-requests-icon\s*\{[\s\S]*?width: 66px;[\s\S]*?height: 66px;[\s\S]*?border-radius: 22px;[\s\S]*?background: var\(--md-sys-color-secondary-container\);[\s\S]*?animation: dmBounce/
    )
    assert.match(
      noPullRequests,
      /className="no-pull-requests-icon"[\s\S]*?<MaterialSymbol name="merge" \/>/
    )
    assert.match(noPullRequests, /No open pull requests/)
  })

  it('styles the in-sheet search fields as 46px pills in both sheets', () => {
    // The pill treatment lives in the shared foldout scope covering both the
    // repository sheet and the branches sheet.
    assert.match(
      foldoutStyle,
      /&:has\(\.repository-list\),\s*&:has\(\.branches-container\) \{/
    )
    assert.match(
      foldoutStyle,
      /\.filter-list-filter-field\.text-box-component\s*\{[\s\S]*?height: 46px;[\s\S]*?border-radius: var\(--md-sys-shape-corner-full\);[\s\S]*?background: var\(--md-sys-color-surface-container-high\);/
    )
    assert.match(
      foldoutStyle,
      /\.prefixed-icon\s*\{[\s\S]*?position: static;[\s\S]*?color: var\(--md-sys-color-on-surface-variant\);/
    )
    // The input inside the pill is borderless and transparent.
    assert.match(
      foldoutStyle,
      /\.filter-list-filter-field\.text-box-component\s*\{[\s\S]*?input\s*\{[\s\S]*?border: 0;[\s\S]*?background: transparent;/
    )
  })
})
