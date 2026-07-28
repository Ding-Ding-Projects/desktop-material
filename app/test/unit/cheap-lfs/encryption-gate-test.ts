import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  CheapLfsEncryptionGateError,
  decideCheapLfsEncryption,
  offersCheapLfsPassphraseForget,
  requiresCheapLfsEncryptionAcknowledgement,
} from '../../../src/lib/cheap-lfs/encryption-gate'
import { defaultBuildRunPreferences } from '../../../src/models/build-run-preferences'
import {
  cantoneseTranslations,
  englishTranslations,
} from '../../../src/lib/i18n-resources'

const read = (relative: string): string =>
  readFileSync(
    join(process.cwd(), 'app', 'src', ...relative.split('/')),
    'utf8'
  )

describe('Cheap LFS encryption gate', () => {
  it('is off by default and never global', () => {
    assert.equal(defaultBuildRunPreferences.cheapLfsEncryption, undefined)
    assert.equal(
      defaultBuildRunPreferences.cheapLfsEncryptionAcknowledged,
      undefined
    )
    assert.equal(
      defaultBuildRunPreferences.cheapLfsEncryptionSavePassphrase,
      undefined
    )
    assert.equal(decideCheapLfsEncryption(undefined), 'plaintext')
    assert.equal(decideCheapLfsEncryption({}), 'plaintext')
    assert.equal(
      decideCheapLfsEncryption({
        enabled: false,
        acknowledgedIrreversible: true,
      }),
      'plaintext'
    )
  })

  it('refuses to pin rather than falling back to plaintext when unconfirmed', () => {
    // The dangerous middle state: settings say "encrypted", the user was never
    // shown the warning. Uploading in the clear here would leave someone
    // believing their release holds ciphertext when it holds their file.
    assert.equal(
      decideCheapLfsEncryption({ enabled: true }),
      'blocked-needs-acknowledgement'
    )
    assert.equal(
      decideCheapLfsEncryption({
        enabled: true,
        acknowledgedIrreversible: false,
      }),
      'blocked-needs-acknowledgement'
    )
  })

  it('encrypts only once the irreversibility gate is confirmed', () => {
    assert.equal(
      decideCheapLfsEncryption({
        enabled: true,
        acknowledgedIrreversible: true,
      }),
      'encrypt'
    )
    assert.equal(requiresCheapLfsEncryptionAcknowledgement({}), true)
    assert.equal(
      requiresCheapLfsEncryptionAcknowledgement({
        acknowledgedIrreversible: true,
      }),
      false
    )
  })

  it('offers forget from the same place that offered to save', () => {
    assert.equal(offersCheapLfsPassphraseForget({}), false)
    assert.equal(offersCheapLfsPassphraseForget({ savePassphrase: true }), true)
    const settings = read('ui/repository-settings/cheap-lfs-settings.tsx')
    assert.match(settings, /offersCheapLfsPassphraseForget\(\{/)
    assert.match(settings, /cheapLfs\.settings\.forgetPassphrase/)
    assert.match(settings, /forgetCheapLfsEncryptionPassphrase/)
  })

  it('names neither a passphrase nor a repository in the gate error', () => {
    const error = new CheapLfsEncryptionGateError()
    assert.equal(error.name, 'CheapLfsEncryptionGateError')
    assert.match(error.message, /nothing was uploaded/)
    assert.doesNotMatch(error.message, /passphrase is/)
  })
})

describe('Cheap LFS encryption gate wiring', () => {
  it('consults the gate on the pin path and throws when blocked', () => {
    const store = read('lib/stores/app-store.ts')
    const start = store.indexOf('private async resolveCheapLfsPinEncryption')
    assert.notEqual(start, -1, 'missing resolveCheapLfsPinEncryption')
    const body = store.slice(start, store.indexOf('\n  }\n', start))

    assert.match(body, /decideCheapLfsEncryption\(\{/)
    assert.match(body, /cheapLfsEncryption,/)
    assert.match(body, /cheapLfsEncryptionAcknowledged,/)
    assert.match(body, /if \(decision === 'plaintext'\) \{\s*return null/)
    assert.match(
      body,
      /'blocked-needs-acknowledgement'\) \{\s*throw new CheapLfsEncryptionGateError\(\)/
    )
    // The pin path must actually receive it.
    assert.match(
      store,
      /const encryption = await this\.resolveCheapLfsPinEncryption\(repository\)/
    )
    assert.match(
      store,
      /\.\.\.\(encryption === null \? \{\} : \{ encryption \}\)/
    )
  })

  it('opens the modal instead of toggling the preference on', () => {
    const settings = read('ui/repository-settings/cheap-lfs-settings.tsx')
    const start = settings.indexOf('onCheapLfsEncryptionChanged = (')
    const end = settings.indexOf('private onEncryptionSetUpClicked', start)
    assert.notEqual(start, -1, 'missing onCheapLfsEncryptionChanged')
    assert.notEqual(end, -1, 'missing onEncryptionSetUpClicked boundary')
    const body = settings.slice(start, end)

    // Ticking the box shows the gate and changes nothing; only confirming it
    // writes both the enabled flag and the acknowledgement.
    assert.match(
      body,
      /if \(event\.currentTarget\.checked\) \{\s*this\.setState\(\{ showingEncryptionGate: true \}\)\s*return/
    )
    assert.doesNotMatch(body, /cheapLfsEncryption: true/)
    assert.match(settings, /cheapLfsEncryptionAcknowledged: true,/)
    assert.match(settings, /<CheapLfsEncryptionGate/)
  })

  it('uses real password inputs and confirms the passphrase twice', () => {
    const gate = read('ui/repository-settings/cheap-lfs-encryption-gate.tsx')

    assert.equal((gate.match(/type="password"/g) ?? []).length, 2)
    assert.match(gate, /passphrase !== confirmation/)
    assert.match(gate, /okButtonDisabled=\{!acknowledged\}/)
    assert.match(gate, /modal=\{true\}/)
  })

  it('never accepts a passphrase from argv, an environment variable, or a URL', () => {
    for (const relative of [
      'lib/cheap-lfs/encrypted-payload.ts',
      'lib/cheap-lfs/passphrase-vault.ts',
      'lib/cheap-lfs/encryption-gate.ts',
      'ui/repository-settings/cheap-lfs-encryption-gate.tsx',
    ]) {
      const source = read(relative)
      assert.doesNotMatch(source, /process\.argv/)
      assert.doesNotMatch(source, /process\.env/)
      assert.doesNotMatch(source, /searchParams|URLSearchParams/)
    }
  })
})

describe('Cheap LFS encryption copy', () => {
  it('states irreversibility unambiguously in both languages', () => {
    const english = englishTranslations['cheapLfs.encryptionGate.irreversible']
    const cantonese =
      cantoneseTranslations['cheapLfs.encryptionGate.irreversible']

    assert.ok(english.includes('cannot be recovered'))
    assert.ok(english.includes('no reset'))
    assert.ok(english.includes('nobody'))
    assert.ok(cantonese !== undefined)
    assert.ok(cantonese!.includes('救唔返'))
    assert.ok(cantonese!.includes('冇後備 key'))
  })

  it('gives the warning no funny-level variants at all', () => {
    // The framing carries bands; the consequence does not. A `.playful`
    // variant of this sentence would be a variant of the fact.
    for (const band of ['plain', 'light', 'playful']) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(
          englishTranslations,
          `cheapLfs.encryptionGate.irreversible.${band}`
        ),
        false
      )
    }
    for (const key of [
      'cheapLfs.encryptionGate.intro.plain',
      'cheapLfs.encryptionGate.intro.light',
      'cheapLfs.encryptionGate.intro.playful',
    ] as const) {
      assert.ok(englishTranslations[key].length > 0)
      assert.ok((cantoneseTranslations[key] ?? '').length > 0)
    }
  })

  it('tells the user what saving costs before they opt in', () => {
    const english =
      englishTranslations['cheapLfs.encryptionGate.rememberWarning']
    assert.ok(
      english.includes('anyone who can sign in to this machine account')
    )
    assert.ok(english.includes('never in a settings file'))
    assert.ok(
      (
        cantoneseTranslations['cheapLfs.encryptionGate.rememberWarning'] ?? ''
      ).includes('唔會入設定檔')
    )
  })

  it('discloses what the committed pointer still reveals', () => {
    const english =
      englishTranslations['cheapLfs.encryptionGate.pointerDisclosure']
    assert.ok(english.includes('SHA-256'))
    assert.ok(english.includes('byte size'))
  })
})
