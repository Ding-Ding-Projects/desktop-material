import assert from 'node:assert'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it, mock } from 'node:test'

import { AppStore } from '../../../src/lib/stores/app-store'
import { TokenStore } from '../../../src/lib/stores/token-store'
import {
  defaultBuildRunPreferences,
  IBuildRunPreferences,
} from '../../../src/models/build-run-preferences'
import {
  CHEAP_LFS_POINTER_VERSION,
  ICheapLfsPointer,
} from '../../../src/lib/cheap-lfs/pointer'
import {
  CheapLfsAuthenticationError,
  CheapLfsEncryptionError,
} from '../../../src/lib/cheap-lfs/payload-encryption'
import { Popup, PopupType } from '../../../src/models/popup'
import { Repository } from '../../../src/models/repository'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
  WorkingDirectoryStatus,
} from '../../../src/models/status'
import { DiffSelection, DiffSelectionType } from '../../../src/models/diff'

const encryptedReleasePreferences: IBuildRunPreferences = {
  ...defaultBuildRunPreferences,
  cheapLfsStorageProvider: 'release',
  cheapLfsPayloadEncryption: true,
  cheapLfsPayloadEncryptionConfirmed: true,
}

const repository = {
  id: 42,
  path: 'C:\\work\\encrypted-repository',
  gitHubRepository: null,
  buildRunPreferences: encryptedReleasePreferences,
} as Repository

function runtimeCredential(): {
  readonly value: string
  readonly digest: string
} {
  const value = randomBytes(32).toString('base64url')
  return {
    value,
    digest: createHash('sha256').update(value).digest('hex'),
  }
}

function assertCredentialDigest(
  value: Buffer | string | null | undefined,
  expectedDigest: string
): void {
  assert.equal(
    createHash('sha256')
      .update(Buffer.isBuffer(value) ? value : value ?? '')
      .digest('hex'),
    expectedDigest
  )
}

type PasswordFlowStore = {
  _showPopup(popup: Popup): Promise<void>
  acquireCheapLfsEncryptionPassword(
    repository: Repository,
    requiredForEncryptedPointer?: boolean
  ): Promise<
    | {
        readonly password: Buffer
        readonly source: 'vault' | 'prompt'
        readonly rememberPassword: boolean
      }
    | undefined
  >
  acquireCheapLfsMaterializationPassword(
    repository: Repository,
    pointer: ICheapLfsPointer
  ): Promise<
    | {
        readonly password: Buffer
        readonly source: 'vault' | 'prompt'
        readonly rememberPassword: boolean
      }
    | undefined
  >
  acquireCheapLfsCommitEncryptionPassword(repository: Repository): Promise<
    | {
        readonly password: Buffer
        readonly source: 'vault' | 'prompt'
        readonly rememberPassword: boolean
      }
    | undefined
  >
  shouldReplaceStaleCheapLfsEncryptionPassword(
    credential:
      | {
          readonly password: Buffer
          readonly source: 'vault' | 'prompt'
          readonly rememberPassword: boolean
        }
      | undefined,
    error: unknown
  ): boolean
  replaceStaleCheapLfsEncryptionPassword(repository: Repository): Promise<{
    readonly password: Buffer
    readonly source: 'vault' | 'prompt'
    readonly rememberPassword: boolean
  } | null>
  postPersistentErrorNotice(...args: ReadonlyArray<unknown>): void
}

type CommitPasswordFlowStore = PasswordFlowStore &
  Pick<AppStore, '_commitIncludedChanges'> & {
    performScheduledCommitPush(
      repository: Repository,
      fence: {
        readonly repositoryIdentity: string
        readonly selectionEpoch: number
      }
    ): Promise<void>
  }

function createStore(
  onPopup: (
    popup: Extract<Popup, { type: PopupType.CheapLfsPayloadPassword }>
  ) => void
): PasswordFlowStore {
  const store = Object.create(
    AppStore.prototype
  ) as unknown as PasswordFlowStore
  store._showPopup = async (popup: Popup) => {
    assert.equal(popup.type, PopupType.CheapLfsPayloadPassword)
    onPopup(
      popup as Extract<Popup, { type: PopupType.CheapLfsPayloadPassword }>
    )
  }
  store.postPersistentErrorNotice = () => undefined
  return store
}

function configureCommitRoute(
  store: PasswordFlowStore,
  autoPin: (...args: ReadonlyArray<unknown>) => Promise<{
    readonly pinned: ReadonlyArray<never>
    readonly failures: ReadonlyArray<{
      readonly relativePath: string
      readonly sizeInBytes: number
      readonly message: string
      readonly reasonKey?: string
    }>
    readonly commitPaths: ReadonlyArray<string>
  }>
): {
  readonly store: CommitPasswordFlowStore
  readonly gitOperations: () => number
} {
  const selectedFile = new WorkingDirectoryFileChange(
    'large.bin',
    { kind: AppFileStatusKind.Modified },
    DiffSelection.fromInitialSelection(DiffSelectionType.All)
  )
  const state = {
    changesState: {
      workingDirectory: WorkingDirectoryStatus.fromFiles([selectedFile]),
    },
    allowEmptyCommit: false,
  }
  let gitOperations = 0
  const commitStore = store as CommitPasswordFlowStore
  Object.assign(commitStore, {
    assertTemporaryRepositoryIsSafe: async () => undefined,
    resumePendingCommitPushBatch: async () => undefined,
    isTemporaryRepositoryActive: () => true,
    repositoryStateCache: {
      get: () => state,
    },
    gitStoreCache: {
      get: () => ({
        performFailableOperation: async () => {
          gitOperations++
          return undefined
        },
      }),
    },
    withIsCommitting: async (
      _repository: Repository,
      operation: () => Promise<boolean>
    ) => await operation(),
    autoPinLargeFilesBeforeCommit: autoPin,
    cheapLfsCommitCancelRequests: new Set<number>(),
    _loadStatus: async () => null,
    postCheapLfsPinNotification: () => undefined,
    postCheapLfsAlreadyStoredNotification: () => undefined,
    postCheapLfsPinFailureNotification: () => undefined,
    emitError: () => undefined,
    _refreshRepository: async () => undefined,
    isScheduledAutomationFenceCurrent: () => true,
    generateAutomationCommitMessage: async () => null,
    _changeIncludeAllFiles: async () => undefined,
    setOneClickCommitPushPhase: () => undefined,
    repositoryWithCanonicalRemoteForNetwork: async () => repository,
  })
  return { store: commitStore, gitOperations: () => gitOperations }
}

afterEach(() => {
  mock.restoreAll()
})

describe('AppStore Cheap LFS password prompting', () => {
  it('restores a legacy plaintext pointer without prompting when new uploads are encrypted', async () => {
    mock.method(TokenStore, 'getItem', async () => {
      throw new Error(
        'the plaintext materialization path must not read the vault'
      )
    })
    const store = createStore(() => {
      throw new Error(
        'the plaintext materialization path must not open a password popup'
      )
    })
    const pointer: ICheapLfsPointer = {
      version: CHEAP_LFS_POINTER_VERSION,
      releaseTag: 'desktop-material-lfs',
      assetName: 'legacy.bin',
      sizeInBytes: 12,
      sha256: 'a'.repeat(64),
    }

    const credential = await store.acquireCheapLfsMaterializationPassword(
      repository,
      pointer
    )

    assert.equal(credential, undefined)
  })

  it('uses the masked decrypt popup again for every unsaved operation', async () => {
    mock.method(TokenStore, 'getItem', async () => null)
    const sentinels = [runtimeCredential(), runtimeCredential()]
    let promptCount = 0
    const store = createStore(popup => {
      assert.equal(popup.purpose, 'decrypt')
      const sentinel = sentinels[promptCount++]
      popup.onSubmit(Buffer.from(sentinel.value), false)
    })

    const first = await store.acquireCheapLfsEncryptionPassword(
      repository,
      true
    )
    assert.equal(first?.source, 'prompt')
    assertCredentialDigest(first?.password, sentinels[0].digest)
    first?.password.fill(0)

    const second = await store.acquireCheapLfsEncryptionPassword(
      repository,
      true
    )
    assert.equal(second?.source, 'prompt')
    assertCredentialDigest(second?.password, sentinels[1].digest)
    second?.password.fill(0)
    assert.equal(promptCount, 2)
  })

  it('blocks the exact commit-time auto-pin password path before any encrypted upload can start', async () => {
    mock.method(TokenStore, 'getItem', async () => null)
    const sentinel = runtimeCredential()
    let promptCount = 0
    const store = createStore(popup => {
      promptCount++
      assert.equal(popup.purpose, 'encrypt')
      assert.equal(popup.context, 'commit-auto-pin')
      popup.onSubmit(Buffer.from(sentinel.value), false)
    })

    const credential = await store.acquireCheapLfsCommitEncryptionPassword(
      repository
    )

    assert.equal(promptCount, 1)
    assert.equal(credential?.source, 'prompt')
    assertCredentialDigest(credential?.password, sentinel.digest)
    credential?.password.fill(0)
  })

  it('cancels the commit-time path instead of returning an unencrypted fallback', async () => {
    mock.method(TokenStore, 'getItem', async () => null)
    const store = createStore(popup => {
      assert.equal(popup.context, 'commit-auto-pin')
      popup.onSubmit(undefined, false)
    })

    await assert.rejects(
      store.acquireCheapLfsCommitEncryptionPassword(repository),
      (error: Error) => error.name === 'AbortError'
    )
  })

  it('runs the real commit entry through the blocking password gate before the provider upload', async () => {
    mock.method(TokenStore, 'getItem', async () => null)
    const sentinel = runtimeCredential()
    const events = new Array<string>()
    const passwordStore = createStore(popup => {
      events.push('prompt')
      assert.equal(popup.purpose, 'encrypt')
      assert.equal(popup.context, 'commit-auto-pin')
      popup.onSubmit(Buffer.from(sentinel.value), false)
    })
    const route = configureCommitRoute(passwordStore, async () => {
      const credential =
        await passwordStore.acquireCheapLfsCommitEncryptionPassword(repository)
      events.push('password-acquired')
      assertCredentialDigest(credential?.password, sentinel.digest)
      try {
        events.push('provider-anchor')
        events.push('provider-upload')
      } finally {
        credential?.password.fill(0)
      }
      return {
        pinned: [],
        failures: [
          {
            relativePath: 'large.bin',
            sizeInBytes: 101,
            message: 'stop after the provider-order assertion',
          },
        ],
        commitPaths: [],
      }
    })

    assert.equal(
      await route.store._commitIncludedChanges(repository, {
        summary: 'encrypted auto-pin',
        description: null,
      }),
      false
    )
    assert.deepEqual(events, [
      'prompt',
      'password-acquired',
      'provider-anchor',
      'provider-upload',
    ])
    assert.equal(route.gitOperations(), 0)
  })

  it('cancels the real commit entry with zero provider upload or plaintext fallback', async () => {
    mock.method(TokenStore, 'getItem', async () => null)
    let providerAnchors = 0
    let providerUploads = 0
    let emittedErrors = 0
    const passwordStore = createStore(popup => {
      assert.equal(popup.context, 'commit-auto-pin')
      popup.onSubmit(undefined, false)
    })
    const route = configureCommitRoute(passwordStore, async () => {
      const credential =
        await passwordStore.acquireCheapLfsCommitEncryptionPassword(repository)
      try {
        providerAnchors++
        providerUploads++
      } finally {
        credential?.password.fill(0)
      }
      return { pinned: [], failures: [], commitPaths: [] }
    })
    Object.assign(route.store, {
      emitError: () => {
        emittedErrors++
      },
    })

    assert.equal(
      await route.store._commitIncludedChanges(repository, {
        summary: 'cancel encrypted auto-pin',
        description: null,
      }),
      false
    )
    assert.equal(providerAnchors, 0)
    assert.equal(providerUploads, 0)
    assert.equal(route.gitOperations(), 0)
    assert.equal(emittedErrors, 0)
  })

  it('passes the background-task fence through the real commit entry', async () => {
    let observedBackgroundTask: boolean | undefined
    const store = createStore(() => {
      throw new Error('a background commit must not open a popup')
    })
    const route = configureCommitRoute(
      store,
      async (...args: ReadonlyArray<unknown>) => {
        observedBackgroundTask = args[3] as boolean | undefined
        return {
          pinned: [],
          failures: [
            {
              relativePath: 'large.bin',
              sizeInBytes: 101,
              message: 'stop after the background fence assertion',
            },
          ],
          commitPaths: [],
        }
      }
    )

    assert.equal(
      await route.store._commitIncludedChanges(
        repository,
        {
          summary: 'background encrypted auto-pin',
          description: null,
        },
        false,
        false,
        () => true,
        true
      ),
      false
    )
    assert.equal(observedBackgroundTask, true)
    assert.equal(route.gitOperations(), 0)
  })

  it('handles an all-skipped unattended pin without a duplicate failure notification', async () => {
    let persistentNotices = 0
    let genericFailureCount = -1
    const store = createStore(() => {
      throw new Error('an unattended commit must not open a popup')
    })
    store.postPersistentErrorNotice = () => {
      persistentNotices++
    }
    const route = configureCommitRoute(store, async () => {
      store.postPersistentErrorNotice(
        'Automatic commit did not pin large files',
        'file-aware unattended skip',
        'cheap-lfs-unattended-encryption:42',
        repository.id
      )
      return {
        pinned: [],
        failures: [
          {
            relativePath: 'large.bin',
            sizeInBytes: 101,
            message: 'the file stayed unchanged and out of the commit',
            reasonKey: 'cheapLfs.unattendedEncryption.reason',
          },
        ],
        commitPaths: [],
      }
    })
    Object.assign(route.store, {
      postCheapLfsPinFailureNotification: (
        _repository: Repository,
        failures: ReadonlyArray<unknown>
      ) => {
        genericFailureCount = failures.length
      },
    })

    await route.store.performScheduledCommitPush(repository, {
      repositoryIdentity: repository.path,
      selectionEpoch: 0,
    })

    assert.equal(persistentNotices, 1)
    assert.equal(genericFailureCount, 0)
    assert.equal(route.gitOperations(), 0)
  })

  it('keeps the unattended resolver and interactive password gate ahead of release anchoring and upload', () => {
    const productionAutoPin = (
      AppStore.prototype as unknown as {
        autoPinLargeFilesBeforeCommit(
          ...args: ReadonlyArray<unknown>
        ): Promise<unknown>
      }
    ).autoPinLargeFilesBeforeCommit.toString()
    const unattendedResolver = productionAutoPin.indexOf(
      'resolveUnattendedCheapLfsEncryptedPin'
    )
    const passwordGate = productionAutoPin.indexOf(
      'acquireCheapLfsCommitEncryptionPassword'
    )
    const releaseAnchor = productionAutoPin.indexOf(
      'ensureCheapLfsReleaseAnchor',
      passwordGate
    )
    const providerUpload = productionAutoPin.indexOf(
      'autoPinLargeFilesForCommit',
      releaseAnchor
    )

    assert.ok(unattendedResolver >= 0)
    assert.ok(passwordGate > unattendedResolver)
    assert.ok(releaseAnchor > passwordGate)
    assert.ok(providerUpload > releaseAnchor)
    assert.match(
      productionAutoPin.slice(unattendedResolver, passwordGate),
      /isBackgroundTask/
    )
  })

  it('confirms stale-vault removal before asking for a replacement', async () => {
    const stale = runtimeCredential()
    const replacementSentinel = runtimeCredential()
    let saved: string | null = stale.value
    mock.method(TokenStore, 'getItem', async () => saved)
    mock.method(TokenStore, 'deleteItem', async () => {
      const existed = saved !== null
      saved = null
      return existed
    })

    const purposes = new Array<string>()
    const store = createStore(popup => {
      purposes.push(popup.purpose)
      popup.onSubmit(
        popup.purpose === 'forget-stale'
          ? Buffer.alloc(0)
          : Buffer.from(replacementSentinel.value),
        false
      )
    })

    const replacement = await store.replaceStaleCheapLfsEncryptionPassword(
      repository
    )
    assert.deepEqual(purposes, ['forget-stale', 'decrypt'])
    assert.equal(replacement?.source, 'prompt')
    assertCredentialDigest(replacement?.password, replacementSentinel.digest)
    replacement?.password.fill(0)
    assert.equal(saved, null)
  })

  it('never hides a plaintext cleanup failure behind a stale-vault retry', () => {
    const store = createStore(() => undefined)
    const sentinel = runtimeCredential()
    const credential = {
      password: Buffer.from(sentinel.value),
      source: 'vault' as const,
      rememberPassword: false,
    }
    const authenticationError = new CheapLfsAuthenticationError()

    assert.equal(
      store.shouldReplaceStaleCheapLfsEncryptionPassword(
        credential,
        authenticationError
      ),
      true
    )
    assert.equal(
      store.shouldReplaceStaleCheapLfsEncryptionPassword(
        credential,
        new AggregateError([
          authenticationError,
          new CheapLfsEncryptionError(
            'The plaintext temporary file could not be removed.'
          ),
        ])
      ),
      false
    )
    credential.password.fill(0)
  })
})

describe('Cheap LFS saved password lifetime', () => {
  // Normalized to LF: the working copy is checked out with CRLF on Windows,
  // and a pattern anchored on "\n  }" silently matches nothing there — which
  // reads exactly like the contract being violated.
  const removalSource = readFileSync(
    join(process.cwd(), 'app', 'src', 'lib', 'stores', 'app-store.ts'),
    'utf8'
  ).replace(/\r\n/g, '\n')

  it('forgets the saved password only after removing a repository succeeds', () => {
    // A password the user asked to be remembered must not outlive the app's
    // knowledge of the repository. After removal nothing in the UI can reach
    // the entry, so startup cleanup must be able to retry a vault failure.
    const removal = removalSource.match(
      /public async _removeRepository\([\s\S]*?\n  \}\n/
    )
    assert.notEqual(removal, null, '_removeRepository must be findable')
    assert.match(
      removal?.[0] ?? '',
      /forgetSavedCheapLfsPayloadPassword\(repository\)/,
      'removing a repository must clear its saved Cheap LFS password'
    )
    // The repository object still carries the stable path-derived account after
    // its store entry is removed. Forget only then so a failed filesystem/store
    // removal never strands an encrypted checkout without its remembered key.
    const body = removal?.[0] ?? ''
    assert.ok(
      body.indexOf('forgetSavedCheapLfsPayloadPassword(repository)') >
        body.indexOf('repositoriesStore.removeRepository(repository)'),
      'the vault entry must be cleared only after repository removal succeeds'
    )
  })

  it('reports an unreachable vault without rolling back the removal', () => {
    const removal =
      removalSource.match(
        /public async _removeRepository\([\s\S]*?\n  \}\n/
      )?.[0] ?? ''
    const forgetIndex = removal.indexOf(
      'forgetSavedCheapLfsPayloadPassword(repository)'
    )
    const afterForget = removal.slice(forgetIndex)
    assert.match(
      afterForget,
      /forgotten === 'unavailable'[\s\S]*?log\.warn/,
      'a locked or broken vault is logged'
    )
    assert.match(
      afterForget,
      /postPersistentErrorNotice\(/,
      'a vault failure must leave a non-secret retry notice'
    )
  })
})
