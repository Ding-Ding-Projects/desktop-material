import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  detectSilentInstallFamily,
  isSilentInstallableAsset,
  planSilentInstall,
  reviewSilentInstallTarget,
  sanitizeSilentInstallOutput,
  SilentInstallMaximumOutputLength,
} from '../../src/lib/silent-install'
import {
  claimInFlight,
  EmptyInFlightGuard,
  isInFlight,
  releaseInFlight,
} from '../../src/lib/cheap-lfs/in-flight-guard'

const installerPath = 'C:\\Downloads\\desktop.exe'

describe('silent install flag table', () => {
  it('runs an MSI through msiexec, never through the download itself', () => {
    // Executing a .msi directly would open the Windows Installer UI; the
    // package has to be handed to msiexec as the value of /i.
    const plan = planSilentInstall(
      { fileName: 'desktop.msi' },
      'C:\\Downloads\\desktop.msi'
    )

    assert.ok(plan)
    assert.equal(plan.family, 'msi')
    assert.equal(plan.command, 'msiexec.exe')
    assert.deepEqual(plan.args, [
      '/i',
      'C:\\Downloads\\desktop.msi',
      '/qn',
      '/norestart',
    ])
    assert.equal(plan.certain, true)
  })

  it('uses each identified exe family documented unattended switches', () => {
    const inno = planSilentInstall(
      { fileName: 'desktop.exe', headText: 'Built with Inno Setup 6' },
      installerPath
    )
    assert.equal(inno?.family, 'inno-setup')
    assert.equal(inno?.command, installerPath)
    assert.deepEqual(inno?.args, [
      '/VERYSILENT',
      '/SUPPRESSMSGBOXES',
      '/NORESTART',
    ])
    assert.equal(inno?.certain, true)

    for (const marker of ['Nullsoft Install System', 'NSIS', 'Squirrel']) {
      const plan = planSilentInstall(
        { fileName: 'desktop.exe', headText: marker },
        installerPath
      )
      assert.equal(plan?.family, 'nsis-or-squirrel')
      assert.deepEqual(plan?.args, ['/S'])
      assert.equal(plan?.certain, true)
    }
  })

  it('offers an unidentified exe only as an uncertain attempt', () => {
    // /S is a convention, not a guarantee, so the plan says so and the surface
    // can label the action honestly instead of promising a silent install.
    for (const evidence of [
      { fileName: 'desktop.exe' },
      { fileName: 'desktop.exe', headText: 'MZ this program cannot be run' },
    ]) {
      const plan = planSilentInstall(evidence, installerPath)
      assert.equal(plan?.family, 'unknown-exe')
      assert.deepEqual(plan?.args, ['/S'])
      assert.equal(plan?.certain, false)
    }
  })

  it('offers nothing for an asset that is not an installer', () => {
    for (const fileName of [
      'desktop.zip',
      'desktop.nupkg',
      'RELEASES',
      'notes.md',
      'desktop.exe.sha256',
      'desktop.tar.gz',
      '.exe',
    ]) {
      assert.equal(
        detectSilentInstallFamily({ fileName }),
        null,
        `${fileName} must not be treated as an installer`
      )
      assert.equal(isSilentInstallableAsset(fileName), false)
      assert.equal(planSilentInstall({ fileName }, installerPath), null)
    }
    assert.equal(isSilentInstallableAsset('Desktop.MSI'), true)
    assert.equal(isSilentInstallableAsset('Desktop.Exe'), true)
  })

  it('refuses to plan without a path to run', () => {
    assert.equal(planSilentInstall({ fileName: 'desktop.msi' }, '   '), null)
  })
})

describe('silent install pre-launch review', () => {
  const expected = { fileName: 'desktop.exe', sizeInBytes: 4096 }
  const present = { exists: true, isFile: true, sizeInBytes: 4096 }

  it('permits only the exact downloaded file', () => {
    assert.equal(reviewSilentInstallTarget(expected, present, 'win32'), null)
  })

  it('refuses a file that changed, vanished, or was never a file', () => {
    // "Install the thing I downloaded" is not "execute whatever is at this
    // path now", so every mismatch is named and refused rather than run.
    assert.equal(reviewSilentInstallTarget(expected, null, 'win32'), 'missing')
    assert.equal(
      reviewSilentInstallTarget(
        expected,
        { ...present, exists: false },
        'win32'
      ),
      'missing'
    )
    assert.equal(
      reviewSilentInstallTarget(
        expected,
        { ...present, isFile: false },
        'win32'
      ),
      'not-a-file'
    )
    assert.equal(
      reviewSilentInstallTarget(
        expected,
        { ...present, sizeInBytes: 4097 },
        'win32'
      ),
      'size-mismatch'
    )
  })

  it('refuses a non-installer and a non-Windows host before touching disk', () => {
    assert.equal(
      reviewSilentInstallTarget(
        { fileName: 'desktop.zip', sizeInBytes: 4096 },
        present,
        'win32'
      ),
      'not-installable'
    )
    for (const platform of ['darwin', 'linux']) {
      assert.equal(
        reviewSilentInstallTarget(expected, present, platform),
        'unsupported-platform'
      )
    }
  })
})

describe('silent install output', () => {
  it('flattens control characters and keeps only a bounded tail', () => {
    const forged = [
      'installing',
      String.fromCharCode(13, 10),
      'done',
      String.fromCharCode(0),
      '   now',
    ].join('')
    assert.equal(sanitizeSilentInstallOutput(forged), 'installing done now')

    const long = sanitizeSilentInstallOutput(`${'a'.repeat(900)}TAIL`)
    assert.equal(long.length, SilentInstallMaximumOutputLength)
    assert.ok(long.startsWith('…'))
    // The tail is what matters: an installer reports its failure last.
    assert.ok(long.endsWith('TAIL'))
  })
})

describe('silent install in-flight guard', () => {
  it('refuses a second start for the same file and reopens after release', () => {
    // A stuttered double-click must not launch one installer twice, but a
    // different downloaded file is a different claim.
    const first = claimInFlight(EmptyInFlightGuard, installerPath)
    assert.equal(first.accepted, true)
    assert.equal(isInFlight(first.state, installerPath), true)

    const second = claimInFlight(first.state, installerPath)
    assert.equal(second.accepted, false)
    assert.equal(second.state, first.state)

    const other = claimInFlight(first.state, 'C:\\Downloads\\other.msi')
    assert.equal(other.accepted, true)

    const released = releaseInFlight(first.state, installerPath)
    assert.equal(isInFlight(released, installerPath), false)
    assert.equal(claimInFlight(released, installerPath).accepted, true)
  })
})
