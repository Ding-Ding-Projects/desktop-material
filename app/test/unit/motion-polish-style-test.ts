import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile } from 'fs/promises'
import * as Path from 'path'

const styles = Path.resolve(__dirname, '../../styles')
const read = (...parts: ReadonlyArray<string>) =>
  readFile(Path.join(styles, ...parts), 'utf8')

describe('motion polish style contract', () => {
  it('loads after the per-surface switches so they can still switch it off', async () => {
    const material = await read('_material.scss')
    const transitions = material.indexOf("@import 'material/transitions';")
    const polish = material.indexOf("@import 'material/polish';")
    assert.ok(transitions >= 0)
    assert.ok(polish > transitions)
  })

  it('only ever applies at the full and calm motion levels', async () => {
    const source = await read('material', '_polish.scss')
    // Every declaration block that animates lives inside the scoping mixin.
    const outside = source
      .replace(/@mixin dm-polish \{[\s\S]*?\n\}\n/, '')
      .replace(/@include dm-polish \{[\s\S]*?\n {2}\}/g, '')
      .replace(/@keyframes[\s\S]*?\n\}\n/g, '')
    assert.doesNotMatch(outside, /\b(transition|animation|transform)\s*:/)
    assert.match(source, /body\[data-dm-motion='full'\] &/)
    assert.match(source, /body\[data-dm-motion='calm'\] &/)
    assert.doesNotMatch(source, /data-dm-motion='reduced'/)
  })

  it('changes nothing at rest: no colour, size or layout declarations', async () => {
    const source = (await read('material', '_polish.scss')).replace(
      /\/\/.*$/gm,
      ''
    )
    assert.doesNotMatch(
      source,
      /^\s*(color|background(-color)?|border(-radius|-color|-width)?|width|height|min-\w+|max-\w+|margin\S*|padding\S*|display|position|font\S*|box-shadow)\s*:/m
    )
  })

  it('uses the resolved durations instead of fixed times', async () => {
    const source = await read('material', '_polish.scss')
    assert.match(source, /var\(--dm-motion-short, 200ms\)/)
    assert.doesNotMatch(source, /transition:[^;]*\b\d+m?s\b/)
  })

  it('staggers only the first rows of a sheet that has just opened', async () => {
    const source = await read('material', '_polish.scss')
    assert.match(
      source,
      /\.foldout\[data-dm-just-opened\] \.list-item \{\s*@include dm-polish \{\s*@for \$row from 1 through 10 \{\s*&:nth-child\(#\{\$row\}\) \{\s*animation: dmPolishFade/
    )
    const dropdown = await readFile(
      Path.resolve(__dirname, '../../src/ui/toolbar/dropdown.tsx'),
      'utf8'
    )
    // The mark must outlast the last row's delay plus its fade, and must be
    // removed so rows that appear while scrolling are not animated again.
    const lifetime = Number(
      /FoldoutJustOpenedMs = (\d+)/.exec(dropdown)?.[1] ?? 0
    )
    assert.ok(lifetime >= 9 * 28 + 300)
    assert.match(dropdown, /removeAttribute\(FoldoutJustOpenedAttribute\)/)
  })
})
