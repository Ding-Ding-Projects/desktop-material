import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it, mock } from 'node:test'

import {
  buildCheapLfsUnattendedEncryptionSkip,
  CheapLfsSavedPasswordState,
  decideCheapLfsUnattendedEncryption,
  ICheapLfsUnattendedEncryptionInput,
  ICheapLfsUnattendedSkipTarget,
} from '../../../src/lib/cheap-lfs/unattended-encryption'
import { cheapLfsFailedFileRowText } from '../../../src/lib/cheap-lfs/failure-reason'
import {
  IFunnyLevels,
  translateWithFunnyLevel,
} from '../../../src/lib/funny-level-text'
import {
  cantoneseTranslations,
  englishTranslations,
} from '../../../src/lib/i18n-resources'
import { AppStore } from '../../../src/lib/stores/app-store'
import { TokenStore } from '../../../src/lib/stores/token-store'
import {
  defaultBuildRunPreferences,
  IBuildRunPreferences,
} from '../../../src/models/build-run-preferences'
import { Popup } from '../../../src/models/popup'
import { Repository } from '../../../src/models/repository'

function input(
  overrides: Partial<ICheapLfsUnattendedEncryptionInput> = {}
): ICheapLfsUnattendedEncryptionInput {
  return {
    isBackgroundTask: true,
    encryptionEnabled: true,
    savedPassword: 'missing',
    ...overrides,
  }
}

const targets: ReadonlyArray<ICheapLfsUnattendedSkipTarget> = [
  { relativePath: 'art/hero.psd', sizeInBytes: 300 * 1024 * 1024 },
  { relativePath: 'art/villain.psd', sizeInBytes: 120 * 1024 * 1024 },
]

/** Translate the notice body at an exact per-language band. */
function bodyAt(levels: IFunnyLevels, mode: 'english' | 'cantonese'): string {
  return buildCheapLfsUnattendedEncryptionSkip(targets, 7, (base, variables) =>
    translateWithFunnyLevel(base, mode, levels, variables)
  ).notice.body
}

describe('decideCheapLfsUnattendedEncryption', () => {
  it('never interferes with an interactive commit', () => {
    for (const savedPassword of [
      'saved',
      'missing',
      'unavailable',
    ] as ReadonlyArray<CheapLfsSavedPasswordState>) {
      assert.strictEqual(
        decideCheapLfsUnattendedEncryption(
          input({ isBackgroundTask: false, savedPassword })
        ),
        'proceed',
        `an attended commit must still be allowed to prompt (${savedPassword})`
      )
    }
  })

  it('leaves an unencrypted automatic commit alone', () => {
    assert.strictEqual(
      decideCheapLfsUnattendedEncryption(
        input({ encryptionEnabled: false, savedPassword: 'missing' })
      ),
      'proceed'
    )
  })

  it('runs the automatic commit when a password was deliberately saved', () => {
    assert.strictEqual(
      decideCheapLfsUnattendedEncryption(input({ savedPassword: 'saved' })),
      'proceed'
    )
  })

  it('skips rather than prompt a machine nobody is sitting at', () => {
    assert.strictEqual(
      decideCheapLfsUnattendedEncryption(input({ savedPassword: 'missing' })),
      'skip-unattended-password'
    )
  })

  it('treats an unreachable vault as no password, never as permission', () => {
    // A locked or broken credential manager cannot produce a key, and it is
    // not a licence to upload the payload in the clear instead.
    assert.strictEqual(
      decideCheapLfsUnattendedEncryption(
        input({ savedPassword: 'unavailable' })
      ),
      'skip-unattended-password'
    )
  })
})

describe('buildCheapLfsUnattendedEncryptionSkip', () => {
  const skip = buildCheapLfsUnattendedEncryptionSkip(
    targets,
    42,
    (base, variables) =>
      translateWithFunnyLevel(base, 'english', undefined, variables)
  )

  it('reports every skipped file with a localized, actionable reason', () => {
    assert.deepStrictEqual(
      skip.failures.map(failure => failure.relativePath),
      ['art/hero.psd', 'art/villain.psd']
    )
    for (const failure of skip.failures) {
      assert.strictEqual(
        failure.reasonKey,
        'cheapLfs.unattendedEncryption.reason'
      )
      assert.match(failure.message, /not uploaded, and not committed/)
    }
  })

  it('states nothing was transferred, because nothing was', () => {
    assert.strictEqual(skip.progress.phase, 'preparing')
    assert.strictEqual(skip.progress.transferredBytes, 0)
    assert.strictEqual(skip.progress.succeededFiles, 0)
    assert.strictEqual(skip.progress.failedFiles, 2)
    assert.strictEqual(skip.progress.totalFiles, 2)
    assert.strictEqual(
      skip.progress.totalBytes,
      targets[0].sizeInBytes + targets[1].sizeInBytes
    )
  })

  it('gives the commit terminal a reason on every failed row', () => {
    for (const detail of skip.progress.failedFileDetails ?? []) {
      assert.notStrictEqual(
        cheapLfsFailedFileRowText(detail.relativePath, detail),
        ''
      )
      assert.doesNotMatch(
        cheapLfsFailedFileRowText(detail.relativePath, detail),
        /undefined/
      )
    }
  })

  it('collapses repeated skips for one repository into a single card', () => {
    assert.strictEqual(
      skip.notice.dedupeKey,
      'cheap-lfs-unattended-encryption:42'
    )
    assert.notStrictEqual(
      buildCheapLfsUnattendedEncryptionSkip(targets, 43, () => '').notice
        .dedupeKey,
      skip.notice.dedupeKey
    )
  })

  it('names the skipped files and never understates the total', () => {
    const many = buildCheapLfsUnattendedEncryptionSkip(
      Array.from({ length: 9 }, (_, index) => ({
        relativePath: `assets/take-${index}.mov`,
        sizeInBytes: 1,
      })),
      1,
      (base, variables) =>
        translateWithFunnyLevel(base, 'english', undefined, variables)
    )
    assert.match(many.notice.body, /assets\/take-0\.mov/)
    assert.match(many.notice.body, /assets\/take-2\.mov/)
    // Only the first three are named, but the count is the honest total.
    assert.doesNotMatch(many.notice.body, /assets\/take-3\.mov/)
    assert.match(many.notice.body, /9 in total/)
  })

  it('keeps a hostile path out of the notice without dropping the file', () => {
    const hostile = `evil${String.fromCharCode(10)}Totally safe.txt`
    const built = buildCheapLfsUnattendedEncryptionSkip(
      [{ relativePath: hostile, sizeInBytes: 1 }],
      1,
      (base, variables) =>
        translateWithFunnyLevel(base, 'english', undefined, variables)
    )
    assert.match(built.notice.body, /evil Totally safe\.txt/)
    // The failure row keeps the exact path, because that is what the commit
    // selection is matched against.
    assert.strictEqual(built.failures[0].relativePath, hostile)
  })
})

describe('unattended skip localization', () => {
  it('ships every band in both languages', () => {
    for (const key of [
      'cheapLfs.unattendedEncryption.title',
      'cheapLfs.unattendedEncryption.reason',
      'cheapLfs.unattendedEncryption.body.plain',
      'cheapLfs.unattendedEncryption.body.light',
      'cheapLfs.unattendedEncryption.body.playful',
    ] as const) {
      assert.ok(
        (englishTranslations[key] ?? '').length > 0,
        `${key} must have English copy`
      )
      assert.ok(
        (cantoneseTranslations[key] ?? '').length > 0,
        `${key} must have Cantonese copy`
      )
    }
  })

  it('changes voice with the funny level and never the facts', () => {
    const bands: ReadonlyArray<IFunnyLevels> = [
      { english: 1, cantonese: 1 },
      { english: 3, cantonese: 3 },
      { english: 5, cantonese: 5 },
    ]
    const english = bands.map(levels => bodyAt(levels, 'english'))
    const cantonese = bands.map(levels => bodyAt(levels, 'cantonese'))

    assert.strictEqual(new Set(english).size, 3, 'each English band differs')
    assert.strictEqual(
      new Set(cantonese).size,
      3,
      'each Cantonese band differs'
    )
    for (const body of english) {
      // Which files were skipped, how many, that nothing was uploaded, and how
      // to fix it are identical at every level.
      assert.match(body, /art\/hero\.psd/)
      assert.match(body, /art\/villain\.psd/)
      assert.match(body, /2 in total/)
      assert.match(body, /nothing was uploaded/)
      assert.match(body, /Large files & storage/)
    }
    for (const body of cantonese) {
      assert.match(body, /art\/hero\.psd/)
      assert.match(body, /art\/villain\.psd/)
      assert.match(body, /總共 2 個/)
      assert.match(body, /冇上載過任何嘢/)
      assert.match(body, /大檔案同儲存/)
    }
  })

  it('reads each language at its own level, and both in bilingual mode', () => {
    const levels: IFunnyLevels = { english: 1, cantonese: 5 }
    const bilingual = buildCheapLfsUnattendedEncryptionSkip(
      targets,
      1,
      (base, variables) =>
        translateWithFunnyLevel(base, 'bilingual', levels, variables)
    ).notice.body

    assert.ok(
      bilingual.includes(bodyAt(levels, 'english')),
      'bilingual keeps the plain English band'
    )
    assert.ok(
      bilingual.includes(bodyAt(levels, 'cantonese')),
      'bilingual keeps the maximally playful Cantonese band'
    )
  })
})

type UnattendedGateStore = {
  skipUnattendedCheapLfsEncryptedPin(
    repository: Repository,
    targets: ReadonlyArray<ICheapLfsUnattendedSkipTarget>,
    isBackgroundTask: boolean
  ): Promise<ReturnType<typeof buildCheapLfsUnattendedEncryptionSkip> | null>
  _showPopup(popup: Popup): Promise<void>
}

const encryptedReleasePreferences: IBuildRunPreferences = {
  ...defaultBuildRunPreferences,
  cheapLfsStorageProvider: 'release',
  cheapLfsPayloadEncryption: true,
  cheapLfsPayloadEncryptionConfirmed: true,
}

function repositoryWith(
  preferences: IBuildRunPreferences = encryptedReleasePreferences
): Repository {
  return {
    id: 42,
    path: 'C:\\work\\encrypted-repository',
    gitHubRepository: null,
    buildRunPreferences: preferences,
  } as Repository
}

/** An app store whose only wired surface is the popup it must never open. */
function createStore(): UnattendedGateStore {
  const store = Object.create(
    AppStore.prototype
  ) as unknown as UnattendedGateStore
  store._showPopup = async () => {
    throw new Error('an unattended commit must never open a password popup')
  }
  return store
}

afterEach(() => mock.restoreAll())

describe('AppStore unattended encrypted pin gate', () => {
  it('skips the pin instead of prompting a scheduled commit', async () => {
    mock.method(TokenStore, 'getItem', async () => null)
    const skip = await createStore().skipUnattendedCheapLfsEncryptedPin(
      repositoryWith(),
      targets,
      true
    )

    assert.notStrictEqual(skip, null)
    assert.deepStrictEqual(
      skip?.failures.map(failure => failure.relativePath),
      ['art/hero.psd', 'art/villain.psd']
    )
    assert.strictEqual(skip?.progress.transferredBytes, 0)
  })

  it('skips when the credential vault itself cannot be read', async () => {
    mock.method(TokenStore, 'getItem', async () => {
      throw new Error('the credential vault is locked')
    })
    assert.notStrictEqual(
      await createStore().skipUnattendedCheapLfsEncryptedPin(
        repositoryWith(),
        targets,
        true
      ),
      null
    )
  })

  it('lets a scheduled commit run once a password is saved', async () => {
    mock.method(TokenStore, 'getItem', async () => 'saved-password')
    assert.strictEqual(
      await createStore().skipUnattendedCheapLfsEncryptedPin(
        repositoryWith(),
        targets,
        true
      ),
      null
    )
  })

  it('leaves the interactive commit free to open its prompt', async () => {
    mock.method(TokenStore, 'getItem', async () => {
      throw new Error('an attended commit must not consult the gate at all')
    })
    assert.strictEqual(
      await createStore().skipUnattendedCheapLfsEncryptedPin(
        repositoryWith(),
        targets,
        false
      ),
      null
    )
  })

  it('never gates an automatic commit that has nothing to encrypt', async () => {
    mock.method(TokenStore, 'getItem', async () => {
      throw new Error('an unencrypted repository must not consult the vault')
    })
    assert.strictEqual(
      await createStore().skipUnattendedCheapLfsEncryptedPin(
        repositoryWith({
          ...encryptedReleasePreferences,
          cheapLfsPayloadEncryption: false,
        }),
        targets,
        true
      ),
      null
    )
    // Registry-backed storage has no Release payload to encrypt either.
    assert.strictEqual(
      await createStore().skipUnattendedCheapLfsEncryptedPin(
        repositoryWith({
          ...encryptedReleasePreferences,
          cheapLfsStorageProvider: 'ghcr',
        }),
        targets,
        true
      ),
      null
    )
  })
})

describe('unattended commit wiring', () => {
  // Normalized to LF: the working copy is checked out with CRLF on Windows,
  // and a pattern anchored on "\n  }" silently matches nothing there — which
  // reads exactly like the contract being violated.
  const source = readFileSync(
    join(process.cwd(), 'app', 'src', 'lib', 'stores', 'app-store.ts'),
    'utf8'
  ).replace(/\r\n/g, '\n')

  it('hands the background flag to the pin, not just to the commit', () => {
    // Without this the flag stops at `_commitIncludedChanges` and a scheduled
    // commit reaches the password popup exactly as an interactive one does.
    assert.match(
      source,
      /this\.autoPinLargeFilesBeforeCommit\([\s\S]{0,200}?isBackgroundTask[\s\S]{0,20}?\)/,
      'the commit must tell the pin whether anyone is watching'
    )
  })

  it('decides the skip before anything is published or uploaded', () => {
    const gateIndex = source.indexOf('skipUnattendedCheapLfsEncryptedPin(')
    const promptIndex = source.indexOf(
      'await this.acquireCheapLfsEncryptionPassword(repository)'
    )
    const anchorIndex = source.indexOf(
      'await this.ensureCheapLfsReleaseAnchor(repository)'
    )
    assert.ok(gateIndex > 0, 'the unattended gate must exist')
    assert.ok(
      gateIndex < promptIndex,
      'the gate must run before any password prompt'
    )
    assert.ok(
      gateIndex < anchorIndex,
      'a skipped commit must not publish a bootstrap anchor first'
    )
  })

  it('reports the skip without a modal', () => {
    const gate = source.slice(
      source.indexOf('const unattendedSkip = await'),
      source.indexOf('encryptionPassword = (')
    )
    assert.match(
      gate,
      /reportProgress\(unattendedSkip\.progress\)/,
      'the commit terminal must state the skipped counts'
    )
    assert.match(
      gate,
      /postPersistentErrorNotice\(/,
      'the skip must reach a non-blocking notice'
    )
    assert.doesNotMatch(
      gate,
      /_showPopup|emitError/,
      'nothing about an unattended skip may block the app'
    )
    assert.match(
      gate,
      /pinned: \[\],/,
      'a skipped commit reports no pinned file'
    )
    assert.match(
      gate,
      /commitPaths: \[\],/,
      'a skipped commit adds no cheap-LFS path to the commit'
    )
  })
})
