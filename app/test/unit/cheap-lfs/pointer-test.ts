import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  CHEAP_LFS_POINTER_VERSION,
  ICheapLfsPointer,
  isCheapLfsPointerText,
  parseCheapLfsPointer,
  serializeCheapLfsPointer,
  validateCheapLfsTrackedPath,
} from '../../../src/lib/cheap-lfs/pointer'

const NUL = String.fromCharCode(0)
const BOM = String.fromCharCode(0xfeff)

const pointer: ICheapLfsPointer = {
  version: CHEAP_LFS_POINTER_VERSION,
  releaseTag: 'v1.0.0',
  assetName: 'game assets.bin',
  sizeInBytes: 123456,
  sha256: 'a'.repeat(64),
}

describe('cheap LFS pointer', () => {
  it('round-trips a serialized pointer and ends with a trailing newline', () => {
    const text = serializeCheapLfsPointer(pointer)
    assert.equal(text.endsWith('\n'), true)
    assert.equal(text.split('\n').filter(line => line.length > 0).length, 5)
    assert.deepEqual(parseCheapLfsPointer(text), pointer)
  })

  it('preserves an asset name that contains spaces', () => {
    const parsed = parseCheapLfsPointer(serializeCheapLfsPointer(pointer))
    assert.equal(parsed?.assetName, 'game assets.bin')
  })

  it('tolerates CRLF line endings, a leading BOM, and surrounding whitespace', () => {
    const crlf = serializeCheapLfsPointer(pointer).replace(/\n/g, '\r\n')
    assert.deepEqual(parseCheapLfsPointer(`${BOM}\n  ${crlf}  \n`), pointer)
  })

  it('rejects every malformation and returns null', () => {
    const lines = serializeCheapLfsPointer(pointer).trimEnd().split('\n')
    const rejected: ReadonlyArray<string> = [
      // Wrong version marker.
      lines.map(l => l.replace(/^version .*/, 'version other/v9')).join('\n'),
      // SHA-256 that is not 64 hex characters.
      lines.map(l => l.replace(/^sha256 .*/, 'sha256 deadbeef')).join('\n'),
      // Uppercase hex is not accepted.
      lines
        .map(l => l.replace(/^sha256 .*/, `sha256 ${'A'.repeat(64)}`))
        .join('\n'),
      // Non-integer size.
      lines.map(l => l.replace(/^size .*/, 'size 12.5')).join('\n'),
      // Negative size.
      lines.map(l => l.replace(/^size .*/, 'size -1')).join('\n'),
      // Empty release tag.
      lines.map(l => l.replace(/^release-tag .*/, 'release-tag ')).join('\n'),
      // Whitespace inside the release tag.
      lines
        .map(l => l.replace(/^release-tag .*/, 'release-tag v 1'))
        .join('\n'),
      // Empty asset name.
      lines.map(l => l.replace(/^asset-name .*/, 'asset-name ')).join('\n'),
      // Missing a line.
      lines.slice(0, 4).join('\n'),
      // Extra line.
      [...lines, 'extra value'].join('\n'),
      // Duplicate key (still five lines, but 'version' appears twice).
      lines.map((l, i) => (i === 4 ? 'version dup' : l)).join('\n'),
      // A NUL byte anywhere disqualifies the text.
      `${serializeCheapLfsPointer(pointer)}${NUL}`,
      // Not a pointer at all.
      'just some file contents\n',
    ]
    for (const text of rejected) {
      assert.equal(parseCheapLfsPointer(text), null, text)
    }
  })

  it('classifies pointer text and rejects binaries with isCheapLfsPointerText', () => {
    assert.equal(isCheapLfsPointerText(serializeCheapLfsPointer(pointer)), true)
    assert.equal(
      isCheapLfsPointerText(`${BOM}${serializeCheapLfsPointer(pointer)}`),
      true
    )
    assert.equal(isCheapLfsPointerText(`${NUL}${NUL}binary`), false)
    assert.equal(isCheapLfsPointerText('#!/bin/sh\necho hi\n'), false)
    assert.equal(isCheapLfsPointerText(''), false)
  })

  it('normalizes safe paths and rejects unsafe ones', () => {
    const table: ReadonlyArray<[string, string | null]> = [
      ['assets/game.bin', 'assets/game.bin'],
      ['assets\\game.bin', 'assets/game.bin'],
      ['  data/file.psd  ', 'data/file.psd'],
      ['file.bin', 'file.bin'],
      ['', null],
      ['/etc/passwd', null],
      ['C:/Windows/system32', null],
      ['../escape.bin', null],
      ['assets/../../escape.bin', null],
      ['./file.bin', null],
      ['assets//file.bin', null],
      ['.git/config', null],
      ['.gitignore', null],
      ['.github/workflows/ci.yml', null],
    ]
    for (const [input, expected] of table) {
      assert.equal(validateCheapLfsTrackedPath(input), expected, input)
    }
  })
})
