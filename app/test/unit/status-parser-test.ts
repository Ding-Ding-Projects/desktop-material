import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  IStatusEntry,
  IStatusHeader,
  parsePorcelainStatus,
  mapStatus,
  stripUntrackedDirectorySuffix,
  UntrackedSubmoduleStatusCode,
} from '../../src/lib/status-parser'

const parse = (input: string) => parsePorcelainStatus(Buffer.from(input))

describe('parsePorcelainStatus', () => {
  it('parses a standard status', () => {
    const entries = parse(
      [
        '1 .D N... 100644 100644 000000 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 deleted',
        '1 .M N... 100644 100644 100644 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 modified',
        '? untracked',
      ].join('\0') + '\0'
    ) as ReadonlyArray<IStatusEntry>

    assert.equal(entries.length, 3)

    let i = 0
    assert.equal(entries[i].statusCode, '.D')
    assert.equal(entries[i].path, 'deleted')
    i++

    assert.equal(entries[i].statusCode, '.M')
    assert.equal(entries[i].path, 'modified')
    i++

    assert.equal(entries[i].statusCode, '??')
    assert.equal(entries[i].path, 'untracked')
  })

  it('parses renames', () => {
    const entries = parse(
      [
        '2 R. N... 100644 100644 100644 2de0487c2d3e977f5f560b746833f9d7f9a054fd 2de0487c2d3e977f5f560b746833f9d7f9a054fd R100 new\0old',
        '2 RM N... 100644 100644 100644 a3cba7afce66ef37a228e094273c27141db21f36 a3cba7afce66ef37a228e094273c27141db21f36 R100 to\0from',
      ].join('\0') + '\0'
    ) as ReadonlyArray<IStatusEntry>

    assert.equal(entries.length, 2)

    let i = 0

    assert.equal(entries[i].statusCode, 'R.')
    assert.equal(entries[i].path, 'new')
    assert.equal(entries[i].oldPath, 'old')
    i++

    assert.equal(entries[i].statusCode, 'RM')
    assert.equal(entries[i].path, 'to')
    assert.equal(entries[i].oldPath, 'from')
  })

  it('ignores ignored files', () => {
    // We don't run status with --ignored so this shouldn't be a problem
    // but we test it all the same

    const entries = parse(
      ['! foo'].join('\0') + '\0'
    ) as ReadonlyArray<IStatusEntry>

    assert.equal(entries.length, 0)
  })

  it('parses status headers', () => {
    // We don't run status with --ignored so this shouldn't be a problem
    // but we test it all the same

    const entries = parse(
      [
        '# branch.oid 2de0487c2d3e977f5f560b746833f9d7f9a054fd',
        '# branch.head master',
        '# branch.upstream origin/master',
        '# branch.ab +1 -0',
      ].join('\0') + '\0'
    ) as ReadonlyArray<IStatusHeader>

    assert.equal(entries.length, 4)

    let i = 0

    assert.equal(
      entries[i++].value,
      'branch.oid 2de0487c2d3e977f5f560b746833f9d7f9a054fd'
    )
    assert.equal(entries[i++].value, 'branch.head master')
    assert.equal(entries[i++].value, 'branch.upstream origin/master')
    assert.equal(entries[i++].value, 'branch.ab +1 -0')
  })

  it('parses a path which includes a newline', () => {
    const x = `1 D. N... 100644 000000 000000 dc9fb24e86f7445720b39dcb39a7fc0e410d9583 0000000000000000000000000000000000000000 ProjectSID/Images.xcassets/iPhone 67/Status Center/Report X68 Y461
      /.DS_Store`
    const entries = parse(x) as ReadonlyArray<IStatusEntry>

    assert.equal(entries.length, 1)

    const expectedPath = `ProjectSID/Images.xcassets/iPhone 67/Status Center/Report X68 Y461
      /.DS_Store`

    assert.equal(entries[0].path, expectedPath)
    assert.equal(entries[0].statusCode, 'D.')
  })

  it('parses a typechange', () => {
    const x =
      '1 .T N... 120000 120000 100755 6165716e8b408ad09b51d1a37aa1ef50e7f84376 6165716e8b408ad09b51d1a37aa1ef50e7f84376 pdf_linux-x64/lib/libQt5Core.so.5'
    const entries = parse(x) as ReadonlyArray<IStatusEntry>

    assert.equal(entries.length, 1)

    assert.equal(entries[0].path, 'pdf_linux-x64/lib/libQt5Core.so.5')
    assert.equal(entries[0].statusCode, '.T')
  })

  it('parses submodule changes', () => {
    const x = `1 .M SCMU 100644 100644 100644 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 submodule/submodule`
    const entries = parse(x) as ReadonlyArray<IStatusEntry>
    assert.equal(entries.length, 1)
    assert.equal(entries[0].path, 'submodule/submodule')
    assert.equal(entries[0].submoduleStatusCode, 'SCMU')
  })

  it('flags an untracked directory without rewriting its path', () => {
    // Git collapses a directory it will not recurse into - under
    // `--untracked-files=all` that means a nested repository. The trailing
    // slash has to stay put here: `git update-index` skips `foo/` silently but
    // fails outright on `foo` when it really is an ordinary directory.
    const entries = parse(
      ['? vendor/sub/', '? plain.txt'].join('\0') + '\0'
    ) as ReadonlyArray<IStatusEntry>

    assert.equal(entries.length, 2)

    assert.equal(entries[0].path, 'vendor/sub/')
    assert.equal(entries[0].statusCode, '??')
    assert.equal(entries[0].untrackedDirectory, true)

    assert.equal(entries[1].path, 'plain.txt')
    assert.equal(entries[1].untrackedDirectory, undefined)
  })

  it('does not treat a lone slash as a directory suffix', () => {
    const entries = parse('? /\0') as ReadonlyArray<IStatusEntry>

    assert.equal(entries.length, 1)
    assert.equal(entries[0].path, '/')
    assert.equal(entries[0].untrackedDirectory, undefined)
  })
})

describe('stripUntrackedDirectorySuffix', () => {
  it('removes a single trailing slash', () => {
    assert.equal(stripUntrackedDirectorySuffix('vendor/sub/'), 'vendor/sub')
  })

  it('leaves ordinary paths untouched', () => {
    assert.equal(stripUntrackedDirectorySuffix('vendor/sub'), 'vendor/sub')
    assert.equal(stripUntrackedDirectorySuffix('/'), '/')
    assert.equal(stripUntrackedDirectorySuffix(''), '')
  })
})

describe('mapStatus', () => {
  it('maps the synthesized untracked-submodule code to a submodule status', () => {
    const entry = mapStatus('??', UntrackedSubmoduleStatusCode, undefined)

    assert.equal(entry.kind, 'untracked')
    assert.deepStrictEqual(entry.submoduleStatus, {
      commitChanged: true,
      modifiedChanges: false,
      untrackedChanges: false,
    })
  })

  it('leaves a plain untracked entry without a submodule status', () => {
    const entry = mapStatus('??', '????', undefined)

    assert.equal(entry.kind, 'untracked')
    assert.equal(entry.submoduleStatus, undefined)
  })
})
