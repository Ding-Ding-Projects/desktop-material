import assert from 'node:assert'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  detectProfiles,
  probeRepository,
} from '../../../../src/lib/build-run/detect'

/**
 * Opt-in real-world corpus test for Build & Run detection.
 *
 * Point BUILD_RUN_FLEET_DIR at a directory of cloned open-source
 * repositories (one repo per child directory) and every repo is probed and
 * detected. The suite asserts the invariants that must hold for ANY real
 * repository — detection never throws, produces at least one positive-score
 * profile for known-buildable projects, argv commands stay shell-free, and
 * ranked profiles are deterministic — without pinning ecosystem specifics
 * that upstream projects could change. Skipped entirely when the corpus
 * directory is absent so CI stays hermetic.
 */

const fleetDir = process.env.BUILD_RUN_FLEET_DIR

/** Repos that intentionally have no buildable manifest at their root. */
const NoProfileAllowlist = new Set<string>([])

describe('build-run real-world fleet', { skip: fleetDir === undefined }, () => {
  const repos =
    fleetDir !== undefined && existsSync(fleetDir)
      ? readdirSync(fleetDir, { withFileTypes: true })
          .filter(entry => entry.isDirectory())
          .map(entry => entry.name)
      : []

  it('finds a corpus to exercise', () => {
    assert.ok(repos.length > 0, `no repositories under ${fleetDir}`)
  })

  for (const repo of repos) {
    it(`detects profiles for ${repo}`, async () => {
      const repoPath = join(fleetDir as string, repo)
      const probe = await probeRepository(repoPath)

      assert.ok(probe.sampleFiles.length > 0, 'probe walked no entries')

      const profiles = detectProfiles(probe)

      if (!NoProfileAllowlist.has(repo)) {
        assert.ok(profiles.length > 0, `no build profile detected for ${repo}`)
      }

      for (const profile of profiles) {
        assert.ok(profile.score > 0, `${profile.id} has non-positive score`)
        assert.ok(profile.label.length > 0, `${profile.id} lacks a label`)
        assert.ok(
          profile.reasons.length > 0,
          `${profile.id} lacks detection reasons`
        )

        for (const command of [
          ...(profile.install ?? []),
          ...(profile.build ?? []),
          ...(profile.run ?? []),
          profile.toolchainCheck.cmd,
        ]) {
          assert.ok(command.exe.length > 0, `${profile.id} stage lacks an exe`)
          assert.ok(
            !/[&|;<>^%$`"']/.test(command.exe),
            `${profile.id} exe looks shell-interpolated: ${command.exe}`
          )
          for (const arg of command.args) {
            assert.equal(
              typeof arg,
              'string',
              `${profile.id} has a non-string arg`
            )
          }
        }
      }

      // Determinism: probing the same tree twice ranks identically.
      const again = detectProfiles(probe)
      assert.deepEqual(
        again.map(p => p.id),
        profiles.map(p => p.id),
        `${repo} detection is not deterministic`
      )
    })
  }
})
