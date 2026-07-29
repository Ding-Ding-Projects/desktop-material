import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  isValidOciNameComponent,
  OciNameComponentMaximumLength,
} from '../../../src/lib/cheap-lfs/oci-name-component'

describe('OCI name component validation', () => {
  it('accepts the OCI separator grammar and its maximum length', () => {
    for (const value of [
      'a',
      'desktop.material',
      'desktop_material',
      'desktop__material',
      'desktop---material',
      'a'.repeat(OciNameComponentMaximumLength),
    ]) {
      assert.equal(isValidOciNameComponent(value), true, value)
    }
  })

  it('rejects malformed separators and non-lowercase ASCII input', () => {
    for (const value of [
      '',
      'Desktop',
      '.desktop',
      'desktop.',
      'desktop..material',
      'desktop___material',
      'desktop-_material',
      'desktop/material',
      'desktoπ',
    ]) {
      assert.equal(isValidOciNameComponent(value), false, value)
    }
  })

  it('rejects oversized adversarial input before scanning it', () => {
    const adversarial = `${'a'.repeat(1_000_000)}!`
    assert.equal(isValidOciNameComponent(adversarial), false)
    assert.equal(
      isValidOciNameComponent(`${'a'.repeat(OciNameComponentMaximumLength)}!`),
      false
    )
  })
})
