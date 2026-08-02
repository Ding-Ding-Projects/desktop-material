import './profile-history-test-env'
import assert from 'node:assert'
import { readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it, TestContext } from 'node:test'

import {
  readCrashSafeText,
  writeCrashSafeText,
} from '../../src/lib/crash-safe-file'
import { git } from '../../src/lib/git/core'
import {
  commitAllChanges,
  ensureProfileRepository,
  restoreProfileTo,
} from '../../src/lib/profiles/profile-git'
import { Repository } from '../../src/models/repository'
import { createTempDirectory } from '../helpers/temp'

const SettingFile = 'setting.json'
const StateFiles = [SettingFile]
const MarkerFile = 'marker.json'
const PersistenceMarker = '.desktop-material-persistence-'

function settingPath(repository: Repository): string {
  return join(repository.path, SettingFile)
}

async function writeSetting(
  repository: Repository,
  value: string
): Promise<void> {
  await writeCrashSafeText(
    settingPath(repository),
    `${JSON.stringify({ value })}\n`
  )
}

/** The ignored sidecars crash-safe persistence keeps beside a state file. */
async function persistenceSidecars(
  repository: Repository
): Promise<ReadonlyArray<string>> {
  const names = await readdir(repository.path)
  return names.filter(name => name.includes(PersistenceMarker)).sort()
}

async function run(
  repository: Repository,
  args: ReadonlyArray<string>
): Promise<string> {
  const result = await git([...args], repository.path, 'restorePersistenceTest')
  return result.stdout.trim()
}

/**
 * A repository whose first commit predates the state file, with the state file
 * written twice so the second write has installed its backup sidecar.
 */
async function createRepositoryWithBackedUpSetting(
  t: TestContext
): Promise<{ repository: Repository; beforeSetting: string }> {
  const repository = await ensureProfileRepository(await createTempDirectory(t))
  await writeFile(join(repository.path, MarkerFile), '{}\n', 'utf8')
  await commitAllChanges(repository, 'Initialize profile')
  const beforeSetting = await run(repository, ['rev-parse', 'HEAD'])

  await writeSetting(repository, 'first')
  await writeSetting(repository, 'second')
  await commitAllChanges(repository, 'Add setting')

  return { repository, beforeSetting }
}

describe('profile history restore of crash-safe state files', () => {
  it('retires the persistence backup of a state file it deletes', async t => {
    const { repository, beforeSetting } =
      await createRepositoryWithBackedUpSetting(t)
    assert.deepStrictEqual(await persistenceSidecars(repository), [
      `.${SettingFile}${PersistenceMarker}backup`,
    ])

    await restoreProfileTo(repository, beforeSetting, StateFiles)

    await assert.rejects(stat(settingPath(repository)), /ENOENT/)
    assert.deepStrictEqual(
      await persistenceSidecars(repository),
      [],
      'a surviving sidecar can still recover the deleted state'
    )
  })

  it('does not let the next read resurrect a state file it deleted', async t => {
    const { repository, beforeSetting } =
      await createRepositoryWithBackedUpSetting(t)

    await restoreProfileTo(repository, beforeSetting, StateFiles)

    assert.equal(await readCrashSafeText(settingPath(repository)), null)
    await assert.rejects(
      stat(settingPath(repository)),
      /ENOENT/,
      'the read reinstalled the primary the restore removed'
    )
    assert.equal(
      await run(repository, ['status', '--porcelain']),
      '',
      'a resurrected state file is committed back as a new user change'
    )
  })
})
