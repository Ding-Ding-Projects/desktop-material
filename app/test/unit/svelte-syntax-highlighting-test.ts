import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile } from 'fs/promises'
import * as Path from 'path'

const root = Path.resolve(__dirname, '../../..')

describe('Svelte syntax highlighting', () => {
  it('highlights .svelte files with the Vue single-file-component mode', async () => {
    const source = await readFile(
      Path.join(root, 'app/src/highlighter/index.ts'),
      'utf8'
    )
    const vueMode = source.slice(
      source.indexOf("import('codemirror/mode/vue/vue')")
    )
    const mappings = vueMode.slice(0, vueMode.indexOf('},'))
    assert.match(mappings, /'\.vue': 'text\/x-vue'/)
    assert.match(mappings, /'\.svelte': 'text\/x-vue'/)
  })

  it('lists Svelte among the documented languages', async () => {
    const docs = await readFile(
      Path.join(root, 'docs/technical/syntax-highlighting.md'),
      'utf8'
    )
    assert.match(docs, /\bSvelte\b/)
  })
})
