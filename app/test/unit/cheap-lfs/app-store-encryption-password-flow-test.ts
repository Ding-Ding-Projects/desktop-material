import assert from 'node:assert'
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

afterEach(() => mock.restoreAll())

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
    let promptCount = 0
    const store = createStore(popup => {
      assert.equal(popup.purpose, 'decrypt')
      promptCount++
      popup.onSubmit(Buffer.from(`one-shot-${promptCount}`), false)
    })

    const first = await store.acquireCheapLfsEncryptionPassword(
      repository,
      true
    )
    assert.equal(first?.source, 'prompt')
    assert.equal(first?.password.toString('utf8'), 'one-shot-1')
    first?.password.fill(0)

    const second = await store.acquireCheapLfsEncryptionPassword(
      repository,
      true
    )
    assert.equal(second?.source, 'prompt')
    assert.equal(second?.password.toString('utf8'), 'one-shot-2')
    second?.password.fill(0)
    assert.equal(promptCount, 2)
  })

  it('confirms stale-vault removal before asking for a replacement', async () => {
    let saved: string | null = 'stale-password'
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
          : Buffer.from('replacement-password'),
        false
      )
    })

    const replacement = await store.replaceStaleCheapLfsEncryptionPassword(
      repository
    )
    assert.deepEqual(purposes, ['forget-stale', 'decrypt'])
    assert.equal(replacement?.source, 'prompt')
    assert.equal(replacement?.password.toString('utf8'), 'replacement-password')
    replacement?.password.fill(0)
    assert.equal(saved, null)
  })

  it('never hides a plaintext cleanup failure behind a stale-vault retry', () => {
    const store = createStore(() => undefined)
    const credential = {
      password: Buffer.from('stale-password'),
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

  it('forgets the saved password while removing a repository', () => {
    // A password the user asked to be remembered must not outlive the app's
    // knowledge of the repository. After removal nothing in the UI can reach
    // the entry, so it would sit in the operating system credential manager
    // for good.
    const removal = removalSource.match(
      /public async _removeRepository\([\s\S]*?\n  \}\n/
    )
    assert.notEqual(removal, null, '_removeRepository must be findable')
    assert.match(
      removal?.[0] ?? '',
      /forgetSavedCheapLfsPayloadPassword\(repository\)/,
      'removing a repository must clear its saved Cheap LFS password'
    )
    // Before `removeRepository`, while the path and remote can still derive
    // the vault account.
    const body = removal?.[0] ?? ''
    assert.ok(
      body.indexOf('forgetSavedCheapLfsPayloadPassword(repository)') <
        body.indexOf('repositoriesStore.removeRepository(repository)'),
      'the vault entry must be cleared before the repository record goes'
    )
  })

  it('does not let an unreachable vault block the removal', () => {
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
      'a locked or broken vault is logged, never thrown'
    )
    assert.doesNotMatch(
      afterForget.slice(0, afterForget.indexOf('removeRepository(repository)')),
      /return 'error'/,
      'a vault failure must not abort removing the repository'
    )
  })
})
