import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile } from 'fs/promises'
import * as Path from 'path'

const src = Path.resolve(__dirname, '../../src')
const styles = Path.resolve(__dirname, '../../styles')

describe('popover clipping contract', () => {
  it('scrolls content that does not fit instead of clipping it away', async () => {
    const popover = await readFile(Path.join(src, 'ui/lib/popover.tsx'), 'utf8')

    // `--available-height` caps the content to what fits between the anchor
    // and the viewport edge. Paired with `overflow: hidden` that cap silently
    // deleted everything past it — a calendar lost its last rows and offered
    // no scrollbar to say anything was missing.
    assert.match(
      popover,
      /overflow: 'hidden auto'/,
      'popover content must scroll vertically rather than clip'
    )
    assert.doesNotMatch(
      popover,
      /overflow: 'hidden',\s*\n\s*width: '100%'/,
      'the clipping form must be gone, not merely accompanied'
    )
  })

  it('bounds every popover, decorated or not', async () => {
    const popover = await readFile(Path.join(src, 'ui/lib/popover.tsx'), 'utf8')
    const dropdown = await readFile(
      Path.join(styles, 'ui/_popover-dropdown.scss'),
      'utf8'
    )

    // The height and width caps used to live only under `.popover-component`,
    // which an undecorated popover never gets — so an undecorated popover was
    // unbounded and painted straight over whatever was behind it.
    assert.match(
      popover,
      /containerDiv\.style\.setProperty\(\s*'--available-height'/
    )
    assert.match(
      popover,
      /containerDiv\.style\.setProperty\(\s*'--available-width'/
    )
    const containerStyle = popover.match(
      /const style: React\.CSSProperties = \{([\s\S]*?)\n    \}/
    )
    assert.ok(containerStyle, 'the positioned container style must exist')
    assert.match(
      containerStyle[1],
      /maxHeight: 'var\(--available-height, calc\(100vh - 20px\)\)'/
    )
    assert.match(
      containerStyle[1],
      /maxWidth: 'var\(--available-width, calc\(100vw - 20px\)\)'/
    )
    assert.match(popover, /maxHeight: 'var\(--available-height\)'/)
    assert.match(popover, /maxWidth: 'var\(--available-width\)'/)
    assert.match(
      dropdown,
      /min-height: min\(200px, var\(--available-height, 200px\)\);/
    )
  })

  it('gives the changelog date picker a real surface to sit on', async () => {
    const dialog = await readFile(
      Path.join(src, 'ui/changelog/changelog-dialog.tsx'),
      'utf8'
    )

    // Without a decoration the popover has no background, no border and no
    // elevation: the category filter chips read straight through the calendar.
    assert.match(dialog, /decoration=\{PopoverDecoration\.Bordered\}/)
    assert.match(dialog, /PopoverDecoration,/)
  })

  it('leaves no popover in the app without a surface of its own', async () => {
    // A popover with neither a decoration nor its own background class is the
    // exact defect above, waiting to happen somewhere else.
    const files = [
      'ui/changelog/changelog-dialog.tsx',
      'ui/history/commit-list.tsx',
    ]
    for (const file of files) {
      const source = await readFile(Path.join(src, file), 'utf8')
      const hasDecoration = /decoration=\{PopoverDecoration\./.test(source)
      const hasOwnSurface = /className="[a-z-]*popover"/.test(source)
      assert.ok(
        hasDecoration || hasOwnSurface,
        `${file} renders a popover with no surface of its own`
      )
    }

    const commitList = await readFile(
      Path.join(styles, 'ui/history/_commit-list.scss'),
      'utf8'
    )
    assert.match(
      commitList,
      /\.reorder-commits-hint-popover \{[\s\S]{0,200}background-color:/,
      'the undecorated hint popover must keep painting its own background'
    )
  })
})
