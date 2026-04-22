import { describe, it } from 'node:test'
import assert from 'node:assert'

import { parseCopilotConflictResolution } from '../../src/lib/copilot-conflict-resolution'
import {
  extractSymbols,
  createDependencyAwareChunks,
} from '../../src/lib/stores/copilot-store'
import { IFileConflictContext } from '../../src/lib/copilot-conflict-context'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(
  path: string,
  oursContent: string,
  theirsContent: string,
  opts?: { baseContent?: string; contextBefore?: string; contextAfter?: string }
): IFileConflictContext {
  return {
    path,
    hunks: [
      {
        oursContent,
        theirsContent,
        baseContent: opts?.baseContent ?? null,
        contextBefore: opts?.contextBefore ?? '',
        contextAfter: opts?.contextAfter ?? '',
      },
    ],
  }
}

function paths(
  chunks: ReadonlyArray<ReadonlyArray<IFileConflictContext>>
): ReadonlyArray<ReadonlyArray<string>> {
  return chunks.map(c => c.map(f => f.path))
}

// ---------------------------------------------------------------------------
// parseCopilotConflictResolution
// ---------------------------------------------------------------------------

describe('parseCopilotConflictResolution', () => {
  it('parses a valid JSON response', () => {
    const json = JSON.stringify({
      resolutions: [
        {
          path: 'src/index.ts',
          resolvedContent: 'content',
          reasoning: 'combined both',
        },
      ],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions.length, 1)
    assert.equal(result.resolutions[0].path, 'src/index.ts')
    assert.equal(result.resolutions[0].resolvedContent, 'content')
    assert.equal(result.resolutions[0].reasoning, 'combined both')
  })

  it('unwraps ```json code blocks', () => {
    const wrapped =
      '```json\n{"resolutions":[{"path":"a.ts","resolvedContent":"x","reasoning":"r"}]}\n```'
    const result = parseCopilotConflictResolution(wrapped)
    assert.equal(result.resolutions[0].path, 'a.ts')
  })

  it('unwraps ``` code blocks without json tag', () => {
    const wrapped =
      '```\n{"resolutions":[{"path":"a.ts","resolvedContent":"x","reasoning":"r"}]}\n```'
    const result = parseCopilotConflictResolution(wrapped)
    assert.equal(result.resolutions[0].path, 'a.ts')
  })

  it('handles multiple resolutions', () => {
    const json = JSON.stringify({
      resolutions: [
        { path: 'a.ts', resolvedContent: 'a', reasoning: 'ra' },
        { path: 'b.ts', resolvedContent: 'b', reasoning: 'rb' },
      ],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions.length, 2)
  })

  it('throws on invalid JSON', () => {
    assert.throws(
      () => parseCopilotConflictResolution('not json'),
      /invalid JSON/
    )
  })

  it('throws on non-object payload', () => {
    assert.throws(
      () => parseCopilotConflictResolution('"string"'),
      /expected an object/
    )
  })

  it('throws on missing resolutions array', () => {
    assert.throws(
      () => parseCopilotConflictResolution('{"foo":"bar"}'),
      /"resolutions" must be an array/
    )
  })

  it('throws on empty resolutions array', () => {
    assert.throws(
      () => parseCopilotConflictResolution('{"resolutions":[]}'),
      /"resolutions" must not be empty/
    )
  })

  it('throws on missing path', () => {
    assert.throws(
      () =>
        parseCopilotConflictResolution(
          '{"resolutions":[{"resolvedContent":"c","reasoning":"r"}]}'
        ),
      /"path" at index 0/
    )
  })

  it('throws on empty path', () => {
    assert.throws(
      () =>
        parseCopilotConflictResolution(
          '{"resolutions":[{"path":"  ","resolvedContent":"c","reasoning":"r"}]}'
        ),
      /"path" at index 0/
    )
  })

  it('throws on missing resolvedContent', () => {
    assert.throws(
      () =>
        parseCopilotConflictResolution(
          '{"resolutions":[{"path":"a.ts","reasoning":"r"}]}'
        ),
      /"resolvedContent" at index 0/
    )
  })

  it('throws on missing reasoning', () => {
    assert.throws(
      () =>
        parseCopilotConflictResolution(
          '{"resolutions":[{"path":"a.ts","resolvedContent":"c"}]}'
        ),
      /"reasoning" at index 0/
    )
  })

  it('allows empty resolvedContent (file emptied intentionally)', () => {
    const json = JSON.stringify({
      resolutions: [
        { path: 'a.ts', resolvedContent: '', reasoning: 'emptied' },
      ],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions[0].resolvedContent, '')
  })
})

// ---------------------------------------------------------------------------
// extractSymbols
// ---------------------------------------------------------------------------

describe('extractSymbols', () => {
  it('extracts exports from hunk content', () => {
    const file = makeFile(
      'utils.ts',
      'export function foo() {}',
      'export const bar = 1'
    )
    const { exports } = extractSymbols(file)
    assert.ok(exports.has('foo'))
    assert.ok(exports.has('bar'))
  })

  it('extracts all export kinds', () => {
    const file = makeFile(
      'types.ts',
      [
        'export class MyClass {}',
        'export interface IMyInterface {}',
        'export type MyType = string',
        'export enum MyEnum {}',
        'export let myLet = 1',
      ].join('\n'),
      ''
    )
    const { exports } = extractSymbols(file)
    assert.ok(exports.has('MyClass'))
    assert.ok(exports.has('IMyInterface'))
    assert.ok(exports.has('MyType'))
    assert.ok(exports.has('MyEnum'))
    assert.ok(exports.has('myLet'))
  })

  it('extracts import paths and named references', () => {
    const file = makeFile(
      'app.ts',
      "import { foo, bar as baz } from '../utils'",
      ''
    )
    const { importPaths, references } = extractSymbols(file)
    assert.ok(importPaths.has('../utils'))
    assert.ok(references.has('foo'))
    assert.ok(references.has('bar'))
    assert.ok(
      !references.has('baz'),
      'alias should not be treated as a reference'
    )
  })

  it('extracts default import references', () => {
    const file = makeFile('consumer.ts', "import React from 'react'", '')
    const { importPaths, references } = extractSymbols(file)
    assert.ok(importPaths.has('react'))
    assert.ok(references.has('React'))
  })

  it('extracts extends/implements/instanceof/new/typeof references', () => {
    const file = makeFile(
      'child.ts',
      'class Child extends BaseClass implements IFoo {}',
      'const x = new Widget()\nif (a instanceof Handler) {}\ntype T = typeof Config'
    )
    const { references } = extractSymbols(file)
    assert.ok(references.has('BaseClass'))
    assert.ok(references.has('IFoo'))
    assert.ok(references.has('Widget'))
    assert.ok(references.has('Handler'))
    assert.ok(references.has('Config'))
  })

  it('scans base content when present', () => {
    const file = makeFile('a.ts', '', '', {
      baseContent: 'export function fromBase() {}',
    })
    const { exports } = extractSymbols(file)
    assert.ok(exports.has('fromBase'))
  })

  it('scans context lines', () => {
    const file = makeFile('b.ts', '', '', {
      contextBefore: "import { ctxBefore } from './dep'",
      contextAfter: 'export const ctxAfter = 1',
    })
    const { references, exports } = extractSymbols(file)
    assert.ok(references.has('ctxBefore'))
    assert.ok(exports.has('ctxAfter'))
  })

  it('returns empty sets for a file with no symbols', () => {
    const file = makeFile('readme.md', 'plain text', 'other text')
    const { exports, importPaths, references } = extractSymbols(file)
    assert.equal(exports.size, 0)
    assert.equal(importPaths.size, 0)
    assert.equal(references.size, 0)
  })
})

// ---------------------------------------------------------------------------
// createDependencyAwareChunks
// ---------------------------------------------------------------------------

describe('createDependencyAwareChunks', () => {
  it('returns all files in a single chunk when count <= targetSize', () => {
    const files = [makeFile('a.ts', '', ''), makeFile('b.ts', '', '')]
    const chunks = createDependencyAwareChunks(files, 5)
    assert.equal(chunks.length, 1)
    assert.equal(chunks[0].length, 2)
  })

  it('groups files that import from each other', () => {
    const fileA = makeFile('src/utils.ts', 'export function helper() {}', '')
    const fileB = makeFile('src/app.ts', "import { helper } from './utils'", '')
    const fileC = makeFile('src/unrelated.ts', 'const x = 1', '')

    const chunks = createDependencyAwareChunks([fileA, fileB, fileC], 2)
    const chunkPaths = paths(chunks)

    // A and B should be in the same chunk
    const chunkWithA = chunkPaths.find(c => c.includes('src/utils.ts'))!
    assert.ok(
      chunkWithA.includes('src/app.ts'),
      'utils and app should be grouped'
    )

    // C should be separate (or in a different chunk)
    const chunkWithC = chunkPaths.find(c => c.includes('src/unrelated.ts'))!
    assert.ok(
      !chunkWithC.includes('src/utils.ts'),
      'unrelated should not be with utils'
    )
  })

  it('groups files that share exported/referenced symbols', () => {
    const fileA = makeFile('a.ts', 'export class MyService {}', '')
    const fileB = makeFile('b.ts', '', 'const s = new MyService()')
    const fileC = makeFile('c.ts', 'const y = 2', '')

    const chunks = createDependencyAwareChunks([fileA, fileB, fileC], 2)
    const chunkPaths = paths(chunks)

    const chunkWithA = chunkPaths.find(c => c.includes('a.ts'))!
    assert.ok(chunkWithA.includes('b.ts'), 'a and b share MyService reference')
  })

  it('splits large dependency groups beyond target size', () => {
    // Create a group of 6 files all exporting/referencing the same symbol
    const files: Array<IFileConflictContext> = []
    for (let i = 0; i < 6; i++) {
      files.push(
        makeFile(
          `file${i}.ts`,
          'export function sharedFn() {}',
          'const x = new sharedFn()'
        )
      )
    }

    const chunks = createDependencyAwareChunks(files, 3)

    // Should produce at least 2 chunks since group of 6 exceeds target of 3
    assert.ok(chunks.length >= 2)
    // No chunk should exceed target size
    for (const chunk of chunks) {
      assert.ok(
        chunk.length <= 3,
        `chunk has ${chunk.length} files, expected <= 3`
      )
    }
  })

  it('bin-packs small independent groups', () => {
    // 4 independent files, target size 2
    const files = [
      makeFile('a.ts', 'const a = 1', ''),
      makeFile('b.ts', 'const b = 2', ''),
      makeFile('c.ts', 'const c = 3', ''),
      makeFile('d.ts', 'const d = 4', ''),
    ]

    const chunks = createDependencyAwareChunks(files, 2)
    // Should produce 2 chunks of 2
    assert.equal(chunks.length, 2)
    assert.equal(chunks[0].length, 2)
    assert.equal(chunks[1].length, 2)
  })

  it('every input file appears in exactly one chunk', () => {
    const files: Array<IFileConflictContext> = []
    for (let i = 0; i < 25; i++) {
      files.push(makeFile(`file${i}.ts`, `const x${i} = ${i}`, ''))
    }

    const chunks = createDependencyAwareChunks(files, 5)
    const allPaths = chunks.flatMap(c => c.map(f => f.path))

    // Every file accounted for
    assert.equal(allPaths.length, 25)
    assert.equal(new Set(allPaths).size, 25, 'no duplicates')
  })
})
