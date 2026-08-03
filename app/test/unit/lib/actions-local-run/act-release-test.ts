import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  actArchiveExtension,
  actAssetName,
  actDownloadUrl,
  actExecutableName,
  ActReleaseError,
} from '../../../../src/lib/actions-local-run/act-release'

describe('act release asset resolution', () => {
  it('uses the release spellings, not Node’s', () => {
    // process.arch says x64; the asset says x86_64. Deriving one from the
    // other is exactly the mistake that 404s mid-install.
    assert.strictEqual(actAssetName('win32', 'x64'), 'act_Windows_x86_64.zip')
    assert.strictEqual(actAssetName('linux', 'x64'), 'act_Linux_x86_64.tar.gz')
    assert.strictEqual(
      actAssetName('darwin', 'arm64'),
      'act_Darwin_arm64.tar.gz'
    )
  })

  it('names the archive and executable each platform actually ships', () => {
    assert.strictEqual(actArchiveExtension('win32'), 'zip')
    assert.strictEqual(actArchiveExtension('linux'), 'tar.gz')
    assert.strictEqual(actExecutableName('win32'), 'act.exe')
    assert.strictEqual(actExecutableName('darwin'), 'act')
  })

  it('says so up front when the host has no published build', () => {
    assert.throws(
      () => actAssetName('aix', 'ppc64'),
      ActReleaseError,
      'an unpublished host should fail before any download starts'
    )
  })

  it('resolves latest without having to look a version up first', () => {
    assert.strictEqual(
      actDownloadUrl('act_Windows_x86_64.zip'),
      'https://github.com/nektos/act/releases/latest/download/act_Windows_x86_64.zip'
    )
  })

  it('pins an explicit tag when one is given', () => {
    assert.strictEqual(
      actDownloadUrl('act_Linux_x86_64.tar.gz', 'v0.2.70'),
      'https://github.com/nektos/act/releases/download/v0.2.70/act_Linux_x86_64.tar.gz'
    )
  })

  it('refuses an asset or version that could leave the release path', () => {
    assert.throws(() => actDownloadUrl('../../../etc/passwd'), ActReleaseError)
    assert.throws(
      () => actDownloadUrl('act_Linux_x86_64.tar.gz', '../../evil'),
      ActReleaseError
    )
  })
})
