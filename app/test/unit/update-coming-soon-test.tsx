import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { ActionsMetadataJSONError } from '../../src/lib/actions-response'
import {
  getUpdateFeedRepository,
  isNewerDesktopMaterialBuildInProgress,
  probeUpdateComingSoon,
  updateBuildProbeDegradation,
} from '../../src/lib/desktop-material-update-build'
import { translate, translatedVariable } from '../../src/lib/i18n'
import {
  cantoneseTranslations,
  englishTranslations,
  TranslationKey,
} from '../../src/lib/i18n-resources'
import {
  deriveUpdateArrivalEstimate,
  dismissUpdateComingSoon,
  IDismissalStorage,
  isUpdateComingSoonDismissed,
  IUpdateComingSoonSignal,
  UpdateComingSoonDismissalKey,
} from '../../src/lib/update-coming-soon-estimate'
import { About, isRealUpdaterState } from '../../src/ui/about/about'
import { UpdateComingSoon } from '../../src/ui/banners/update-coming-soon'
import {
  IUpdateState,
  UpdateStatus,
  UpdateStore,
} from '../../src/ui/lib/update-store'
import { fireEvent, render, screen } from '../helpers/ui/render'

const installedSHA = '1'.repeat(40)
const buildSHA = '2'.repeat(40)
const laterSHA = '3'.repeat(40)
const ciRunID = 123456788
const installerRunID = 123456789
const updatesURL =
  'https://github.com/Ding-Ding-Projects/desktop-material/releases/latest/download/'

// A fixed clock, so every estimate below is exact rather than approximately
// asserted. Estimates are derived from elapsed time, never from the wall clock.
const minute = 60 * 1000
const day = 24 * 60 * minute
const now = Date.UTC(2026, 6, 24, 12, 0, 0)

function isoDate(epochMilliseconds: number): string {
  return new Date(epochMilliseconds).toISOString()
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** A response body larger than the probe reads in one go (2 MiB). */
function oversizedResponse(): Response {
  return new Response(
    JSON.stringify({ status: 'ahead', filler: 'x'.repeat(2 * 1024 * 1024) }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

function storageSnapshot(): Map<string, string> {
  const result = new Map<string, string>()
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (key !== null) {
      result.set(key, localStorage.getItem(key) ?? '')
    }
  }
  return result
}

function updateStoreAccess(store: UpdateStore) {
  return store as unknown as {
    readonly onUpdateNotAvailable: () => Promise<void>
    readonly onUpdateAvailable: () => void
    readonly onUpdateDownloaded: () => void
  }
}

function updateState(status: UpdateStatus): IUpdateState {
  return {
    status,
    lastSuccessfulCheck: new Date(),
    isX64ToARM64ImmediateAutoUpdate: false,
    newReleases: [],
    prioritizeUpdate: false,
    prioritizeUpdateInfoUrl: undefined,
    comingSoonSignal: null,
  }
}

/** A minimal observed signal; each test overrides only what it exercises. */
function comingSoonSignal(
  overrides: Partial<IUpdateComingSoonSignal> = {}
): IUpdateComingSoonSignal {
  return {
    kind: 'build-running',
    headSHA: buildSHA,
    commitURL: null,
    runURL: null,
    runStartedAt: null,
    recentRunDurations: [],
    recentReleaseTimes: [],
    targetTag: null,
    latestReleaseTag: null,
    ...overrides,
  }
}

describe('update coming soon', () => {
  it('derives only a safe GitHub repository from the configured release feed', () => {
    assert.deepEqual(getUpdateFeedRepository(updatesURL), {
      owner: 'Ding-Ding-Projects',
      name: 'desktop-material',
    })
    assert.equal(
      getUpdateFeedRepository(
        'https://example.test/Ding-Ding-Projects/desktop-material/releases/latest/download/'
      ),
      null
    )
    assert.equal(
      getUpdateFeedRepository(
        'http://github.com/Ding-Ding-Projects/desktop-material/releases/latest/download/'
      ),
      null
    )
  })

  it('uses an in-progress CI build job and compare result to prove a newer commit', async () => {
    const requests = new Array<string>()
    const fetcher = async (input: RequestInfo) => {
      const url = input.toString()
      requests.push(url)
      if (url.includes('/jobs?')) {
        return jsonResponse({
          jobs: [
            {
              name: 'Windows x64',
              status: 'in_progress',
              run_id: ciRunID,
              head_sha: buildSHA,
            },
          ],
        })
      }
      return url.includes('/compare/')
        ? jsonResponse({ status: 'ahead' })
        : jsonResponse({
            workflow_runs: [
              {
                id: ciRunID,
                status: 'in_progress',
                event: 'push',
                head_branch: 'main',
                head_sha: buildSHA,
                path: '.github/workflows/ci.yml',
              },
            ],
          })
    }

    assert.equal(
      await isNewerDesktopMaterialBuildInProgress({
        updatesURL,
        installedSHA,
        fetcher,
      }),
      true
    )
    assert.equal(requests.length, 3)
    assert.match(requests[0], /actions\/workflows\/ci\.yml\/runs\?/)
    assert.match(requests[0], /status=in_progress/)
    assert.match(requests[1], new RegExp(`/runs/${ciRunID}/jobs\\?`))
    assert.match(requests[1], /filter=latest/)
    assert.match(
      requests[2],
      new RegExp(`${installedSHA}\\.\\.\\.${buildSHA}$`)
    )
  })

  it('also recognizes an exact in-progress installer packaging job', async () => {
    const requests = new Array<string>()
    const fetcher = async (input: RequestInfo) => {
      const url = input.toString()
      requests.push(url)
      if (url.includes('/workflows/ci.yml/runs?')) {
        return jsonResponse({ workflow_runs: [] })
      }
      if (url.includes('/jobs?')) {
        return jsonResponse({
          jobs: [
            {
              name: 'Windows x64',
              status: 'in_progress',
              run_id: installerRunID,
              head_sha: buildSHA,
            },
          ],
        })
      }
      return url.includes('/compare/')
        ? jsonResponse({ status: 'ahead' })
        : jsonResponse({
            workflow_runs: [
              {
                id: installerRunID,
                status: 'in_progress',
                event: 'workflow_run',
                head_branch: 'main',
                head_sha: buildSHA,
                path: '.github/workflows/build-installers.yml',
              },
            ],
          })
    }

    assert.equal(
      await isNewerDesktopMaterialBuildInProgress({
        updatesURL,
        installedSHA,
        fetcher,
      }),
      true
    )
    assert.equal(requests.length, 4)
    assert.match(requests[0], /actions\/workflows\/ci\.yml\/runs\?/)
    assert.match(
      requests[1],
      /actions\/workflows\/build-installers\.yml\/runs\?/
    )
    assert.match(requests[2], new RegExp(`/runs/${installerRunID}/jobs\\?`))
    assert.match(
      requests[3],
      new RegExp(`${installedSHA}\\.\\.\\.${buildSHA}$`)
    )
  })

  it('fails closed for stale, malformed, or non-building provider state', async () => {
    for (const workflowRuns of [
      [
        {
          id: installerRunID,
          status: 'completed',
          event: 'workflow_run',
          head_branch: 'main',
          head_sha: buildSHA,
          path: '.github/workflows/build-installers.yml',
        },
      ],
      [
        {
          id: installerRunID,
          status: 'in_progress',
          event: 'pull_request',
          head_branch: 'feature',
          head_sha: buildSHA,
          path: '.github/workflows/build-installers.yml',
        },
      ],
      [{ status: 'in_progress', head_sha: 'not-an-object-id' }],
    ]) {
      let requests = 0
      const fetcher = async () => {
        requests++
        return jsonResponse({ workflow_runs: workflowRuns })
      }
      assert.equal(
        await isNewerDesktopMaterialBuildInProgress({
          updatesURL,
          installedSHA,
          fetcher,
        }),
        false
      )
      assert.equal(requests, 2)
    }

    assert.equal(
      await isNewerDesktopMaterialBuildInProgress({
        updatesURL,
        installedSHA: 'development-build',
        fetcher: async () => {
          throw new Error('must not request')
        },
      }),
      false
    )

    let manualRequests = 0
    assert.equal(
      await isNewerDesktopMaterialBuildInProgress({
        updatesURL,
        installedSHA,
        fetcher: async input => {
          manualRequests++
          const url = input.toString()
          if (url.includes('/workflows/ci.yml/runs?')) {
            return jsonResponse({ workflow_runs: [] })
          }
          return url.includes('/jobs?')
            ? jsonResponse({
                jobs: [
                  {
                    name: 'Verify manually dispatched release',
                    status: 'in_progress',
                    run_id: installerRunID,
                    head_sha: buildSHA,
                  },
                ],
              })
            : jsonResponse({
                workflow_runs: [
                  {
                    id: installerRunID,
                    status: 'in_progress',
                    event: 'workflow_dispatch',
                    head_branch: 'main',
                    head_sha: buildSHA,
                    path: '.github/workflows/build-installers.yml',
                  },
                ],
              })
        },
      }),
      false
    )
    assert.equal(manualRequests, 3)
  })

  it('binds CI runs and jobs to exact path, event, branch, run ID, and SHA', async () => {
    const baseRun = {
      id: ciRunID,
      status: 'in_progress',
      event: 'push',
      head_branch: 'main',
      head_sha: buildSHA,
      path: '.github/workflows/ci.yml',
    }
    for (const run of [
      { ...baseRun, event: 'pull_request' },
      { ...baseRun, head_branch: 'feature' },
      { ...baseRun, head_sha: 'not-an-object-id' },
      { ...baseRun, path: '.github/workflows/build-installers.yml' },
    ]) {
      let jobsRequested = false
      const result = await isNewerDesktopMaterialBuildInProgress({
        updatesURL,
        installedSHA,
        fetcher: async input => {
          const url = input.toString()
          if (url.includes('/jobs?')) {
            jobsRequested = true
          }
          return jsonResponse({
            workflow_runs: url.includes('/workflows/ci.yml/runs?') ? [run] : [],
          })
        },
      })
      assert.equal(result, false)
      assert.equal(jobsRequested, false)
    }

    for (const job of [
      {
        name: 'Lint',
        status: 'in_progress',
        run_id: ciRunID,
        head_sha: buildSHA,
      },
      {
        name: 'Windows x64',
        status: 'queued',
        run_id: ciRunID,
        head_sha: buildSHA,
      },
      {
        name: 'Windows x64',
        status: 'in_progress',
        run_id: ciRunID + 1,
        head_sha: buildSHA,
      },
      {
        name: 'Windows x64',
        status: 'in_progress',
        run_id: ciRunID,
        head_sha: installedSHA,
      },
    ]) {
      let compareRequested = false
      const result = await isNewerDesktopMaterialBuildInProgress({
        updatesURL,
        installedSHA,
        fetcher: async input => {
          const url = input.toString()
          if (url.includes('/compare/')) {
            compareRequested = true
          }
          if (url.includes('/workflows/ci.yml/runs?')) {
            return jsonResponse({ workflow_runs: [baseRun] })
          }
          if (url.includes('/jobs?')) {
            return jsonResponse({ jobs: [job] })
          }
          return jsonResponse({ workflow_runs: [] })
        },
      })
      assert.equal(result, false)
      assert.equal(compareRequested, false)
    }
  })

  it('keeps the transient build state out of persisted preferences', async () => {
    localStorage.removeItem('last-successful-update-check')
    const before = storageSnapshot()
    const store = new UpdateStore({
      generateReleaseSummary: async () => [],
      probeForNewerBuild: async () => comingSoonSignal(),
      subscribeToUpdaterEvents: false,
    })

    await updateStoreAccess(store).onUpdateNotAvailable()

    assert.equal(store.state.status, UpdateStatus.UpdateComingSoon)
    // The observed signal reaches the UI, but only through the live state.
    assert.equal(store.state.comingSoonSignal?.headSHA, buildSHA)
    assert.notEqual(localStorage.getItem('last-successful-update-check'), null)
    const after = storageSnapshot()
    after.delete('last-successful-update-check')
    assert.deepEqual(after, before)
    localStorage.removeItem('last-successful-update-check')
  })

  it('does not let a slow build probe overwrite a real available release', async () => {
    let resolveProbe!: (value: IUpdateComingSoonSignal | null) => void
    const probe = new Promise<IUpdateComingSoonSignal | null>(resolve => {
      resolveProbe = resolve
    })
    const store = new UpdateStore({
      generateReleaseSummary: async () => [],
      probeForNewerBuild: async () => await probe,
      subscribeToUpdaterEvents: false,
    })
    const access = updateStoreAccess(store)

    const noUpdateTransition = access.onUpdateNotAvailable()
    access.onUpdateAvailable()
    resolveProbe(comingSoonSignal())
    await noUpdateTransition

    assert.equal(store.state.status, UpdateStatus.UpdateAvailable)
    // A superseded "coming soon" must not leave its details behind either.
    assert.equal(store.state.comingSoonSignal, null)
  })

  it('publishes a downloaded update before release-note enrichment finishes', () => {
    const neverFinishes = new Promise<ReadonlyArray<never>>(() => undefined)
    const store = new UpdateStore({
      generateReleaseSummary: async () => await neverFinishes,
      probeForNewerBuild: async () => null,
      subscribeToUpdaterEvents: false,
    })

    updateStoreAccess(store).onUpdateDownloaded()

    assert.equal(store.state.status, UpdateStatus.UpdateReady)
    assert.equal(store.state.comingSoonSignal, null)
  })

  it('reveals only genuine updater event states in development About', () => {
    for (const status of [
      UpdateStatus.CheckingForUpdates,
      UpdateStatus.UpdateAvailable,
      UpdateStatus.UpdateNotAvailable,
      UpdateStatus.UpdateReady,
    ]) {
      assert.equal(isRealUpdaterState(status), true, UpdateStatus[status])
    }

    for (const status of [
      UpdateStatus.UpdateNotChecked,
      UpdateStatus.UpdateComingSoon,
    ]) {
      assert.equal(isRealUpdaterState(status), false, UpdateStatus[status])
    }
  })

  it('classifies only bounded-read failures as a handled degradation', () => {
    assert.equal(
      updateBuildProbeDegradation(
        new ActionsMetadataJSONError('too big', 'too-large')
      ),
      'metadata-too-large'
    )
    assert.equal(
      updateBuildProbeDegradation(
        new ActionsMetadataJSONError('bad json', 'invalid-json')
      ),
      'invalid-json'
    )
    // Everything else stays exceptional and must keep propagating.
    assert.equal(updateBuildProbeDegradation(new Error('offline')), null)
  })

  it('skips an oversized Actions response instead of rejecting', async () => {
    // Reported on every launch: a `compare` payload larger than the probe's
    // read bound became an unhandled rejection and a generic
    // "background action stopped unexpectedly" toast.
    const degradations = new Array<string>()
    const requests = new Array<string>()
    const result = await isNewerDesktopMaterialBuildInProgress({
      updatesURL,
      installedSHA,
      onDegraded: degradation => degradations.push(degradation),
      fetcher: async input => {
        const url = input.toString()
        requests.push(url)
        if (url.includes('/compare/')) {
          return oversizedResponse()
        }
        if (url.includes('/jobs?')) {
          return jsonResponse({
            jobs: [
              {
                name: 'Windows x64',
                status: 'in_progress',
                run_id: ciRunID,
                head_sha: buildSHA,
              },
            ],
          })
        }
        return url.includes('/workflows/ci.yml/runs?')
          ? jsonResponse({
              workflow_runs: [
                {
                  id: ciRunID,
                  status: 'in_progress',
                  event: 'push',
                  head_branch: 'main',
                  head_sha: buildSHA,
                  path: '.github/workflows/ci.yml',
                },
              ],
            })
          : jsonResponse({ workflow_runs: [] })
      },
    })

    // Unproven is never reported as "ahead", and the probe still finishes.
    assert.equal(result, false)
    assert.deepEqual(degradations, ['metadata-too-large'])
    assert.ok(requests.some(url => url.includes('build-installers.yml')))
  })

  it('continues to the next workflow when one runs page is oversized', async () => {
    const degradations = new Array<string>()
    let jobsRequested = false
    const result = await isNewerDesktopMaterialBuildInProgress({
      updatesURL,
      installedSHA,
      onDegraded: degradation => degradations.push(degradation),
      fetcher: async input => {
        const url = input.toString()
        if (url.includes('/workflows/ci.yml/runs?')) {
          return oversizedResponse()
        }
        if (url.includes('/jobs?')) {
          jobsRequested = true
        }
        return jsonResponse({ workflow_runs: [] })
      },
    })

    assert.equal(result, false)
    assert.equal(jobsRequested, false)
    assert.deepEqual(degradations, ['metadata-too-large'])
  })

  it('still fails for a genuine transport error', async () => {
    await assert.rejects(
      isNewerDesktopMaterialBuildInProgress({
        updatesURL,
        installedSHA,
        fetcher: async () => {
          throw new Error('offline')
        },
      }),
      /offline/
    )
  })

  it('logs every skipped response but announces it at most once', async () => {
    let probes = 0
    const store = new UpdateStore({
      generateReleaseSummary: async () => [],
      probeForNewerBuild: async ({ onDegraded }) => {
        probes++
        onDegraded?.('metadata-too-large')
        onDegraded?.('metadata-too-large')
        return null
      },
      subscribeToUpdaterEvents: false,
    })
    const announcements = new Array<string>()
    store.onActionsMetadataSkipped(degradation =>
      announcements.push(degradation)
    )

    await updateStoreAccess(store).onUpdateNotAvailable()
    await updateStoreAccess(store).onUpdateNotAvailable()

    assert.equal(probes, 2)
    // Four degradations across two update checks, one user-facing notice.
    assert.deepEqual(announcements, ['metadata-too-large'])
    assert.equal(store.state.status, UpdateStatus.UpdateNotAvailable)
    localStorage.removeItem('last-successful-update-check')
  })

  it('contains a rejected update check instead of leaking it to the toast', async () => {
    const store = new UpdateStore({
      generateReleaseSummary: async () => {
        throw new Error('release feed unavailable')
      },
      probeForNewerBuild: async () => null,
      subscribeToUpdaterEvents: false,
    })

    // The IPC listener never awaits this promise, so it must never reject.
    await assert.doesNotReject(updateStoreAccess(store).onUpdateNotAvailable())
  })

  it('publishes the skipped-metadata notice in both languages', () => {
    for (const key of [
      'actionsMetadata.tooLarge.title',
      'actionsMetadata.tooLarge.body',
    ] as const) {
      assert.ok((englishTranslations[key] ?? '').length > 0, key)
      assert.ok((cantoneseTranslations[key] ?? '').length > 0, key)
      // Error and degradation copy stays plain and factual at every level.
      assert.doesNotMatch(englishTranslations[key], /\{/)
    }
  })

  it('renders persisted English, playful Cantonese, and bilingual status copy', () => {
    const expected = {
      english: 'New update coming soon',
      cantonese: '新版本就快焗好出爐',
      bilingual: 'New update coming soon · 新版本就快焗好出爐',
    } as const

    for (const [languageMode, message] of Object.entries(expected)) {
      localStorage.setItem(
        'appearance-customization-v1',
        JSON.stringify({ version: 1, languageMode })
      )
      localStorage.setItem('language-mode-v1', languageMode)
      const about = new About({
        onDismissed: () => undefined,
        applicationName: 'Desktop Material',
        applicationVersion: '1.0.0',
        applicationArchitecture: 'x64',
        onCheckForNonStaggeredUpdates: () => undefined,
        onShowAcknowledgements: () => undefined,
        onShowTermsAndConditions: () => undefined,
        onShowChangelog: () => undefined,
        onQuitAndInstall: () => undefined,
        updateState: updateState(UpdateStatus.UpdateComingSoon),
        allowDevelopment: true,
      })
      const details = (
        about as unknown as { readonly renderUpdateDetails: () => JSX.Element }
      ).renderUpdateDetails()
      const view = render(<div>{details}</div>)
      assert.ok(screen.getAllByText(message).length >= 1)
      assert.equal(
        translate('update.comingSoon', languageMode),
        message,
        languageMode
      )
      view.unmount()
    }

    localStorage.removeItem('appearance-customization-v1')
    localStorage.removeItem('language-mode-v1')
  })

  it('times a running build against the median of recent successful runs', () => {
    const estimate = deriveUpdateArrivalEstimate(
      comingSoonSignal({
        kind: 'build-running',
        runStartedAt: now - 6 * minute,
        // Deliberately unsorted: the median, not the newest run, decides.
        recentRunDurations: [22 * minute, 18 * minute, 20 * minute],
      }),
      now
    )

    assert.equal(estimate?.basis, 'running-workflow')
    assert.equal(estimate?.medianMilliseconds, 20 * minute)
    assert.equal(estimate?.sampleSize, 3)
    assert.equal(estimate?.etaMilliseconds, 14 * minute)
    assert.equal(estimate?.isOverdue, false)
  })

  it('reports a long-running build as due rather than inventing a new time', () => {
    const overdue = deriveUpdateArrivalEstimate(
      comingSoonSignal({
        kind: 'build-running',
        runStartedAt: now - 45 * minute,
        recentRunDurations: [20 * minute, 20 * minute],
      }),
      now
    )
    assert.equal(overdue?.isOverdue, true)
    assert.equal(overdue?.etaMilliseconds, null)

    // Nothing comparable to measure against is stated as such, not guessed.
    const unmeasured = deriveUpdateArrivalEstimate(
      comingSoonSignal({
        kind: 'build-running',
        runStartedAt: now - 6 * minute,
        recentRunDurations: [],
      }),
      now
    )
    assert.equal(unmeasured?.basis, 'running-workflow')
    assert.equal(unmeasured?.etaMilliseconds, null)
    assert.equal(unmeasured?.isOverdue, false)
    assert.equal(unmeasured?.sampleSize, 0)
  })

  it('says only "shortly" for a green build that has no release yet', () => {
    const estimate = deriveUpdateArrivalEstimate(
      comingSoonSignal({
        kind: 'awaiting-release',
        // Cadence data exists, but publishing is not a cadence question.
        recentReleaseTimes: [now - day, now - 4 * day, now - 7 * day],
      }),
      now
    )

    assert.equal(estimate?.basis, 'green-ci-no-release')
    assert.equal(estimate?.etaMilliseconds, null)
    assert.equal(estimate?.isOverdue, false)
    assert.equal(estimate?.sampleSize, 0)
  })

  it('falls back to the median gap between the last releases', () => {
    const estimate = deriveUpdateArrivalEstimate(
      comingSoonSignal({
        kind: 'newer-commit',
        recentReleaseTimes: [
          now - day,
          now - 4 * day,
          now - 8 * day,
          now - 11 * day,
        ],
      }),
      now
    )

    // Gaps of 3, 4 and 3 days: a median of 3, counted from the newest release.
    assert.equal(estimate?.basis, 'release-cadence')
    assert.equal(estimate?.medianMilliseconds, 3 * day)
    assert.equal(estimate?.sampleSize, 3)
    assert.equal(estimate?.etaMilliseconds, 2 * day)

    const overdue = deriveUpdateArrivalEstimate(
      comingSoonSignal({
        kind: 'newer-commit',
        recentReleaseTimes: [now - 10 * day, now - 13 * day, now - 16 * day],
      }),
      now
    )
    assert.equal(overdue?.isOverdue, true)
    assert.equal(overdue?.etaMilliseconds, null)

    // One release is no cadence, and is never rounded up into one.
    const single = deriveUpdateArrivalEstimate(
      comingSoonSignal({
        kind: 'newer-commit',
        recentReleaseTimes: [now - day],
      }),
      now
    )
    assert.equal(single?.basis, 'release-cadence')
    assert.equal(single?.etaMilliseconds, null)
    assert.equal(single?.isOverdue, false)
    assert.equal(single?.sampleSize, 0)
  })

  it('produces no estimate at all when nothing was observed', () => {
    assert.equal(deriveUpdateArrivalEstimate(null, now), null)
  })

  it('remembers a dismissal per coming build, not per banner appearance', () => {
    const entries = new Map<string, string>()
    const storage: IDismissalStorage = {
      getItem: key => entries.get(key) ?? null,
      setItem: (key, value) => {
        entries.set(key, value)
      },
    }

    const running = comingSoonSignal({ kind: 'build-running' })
    assert.equal(isUpdateComingSoonDismissed(running, storage), false)

    dismissUpdateComingSoon(running, storage)
    assert.equal(entries.get(UpdateComingSoonDismissalKey), buildSHA)
    assert.equal(isUpdateComingSoonDismissed(running, storage), true)

    // The same build later waiting on its release is not a new announcement.
    assert.equal(
      isUpdateComingSoonDismissed(
        comingSoonSignal({ kind: 'awaiting-release' }),
        storage
      ),
      true
    )

    // A genuinely different commit is.
    assert.equal(
      isUpdateComingSoonDismissed(
        comingSoonSignal({ headSHA: laterSHA }),
        storage
      ),
      false
    )
  })

  it('keeps working when the dismissal store refuses to answer', () => {
    const denied: IDismissalStorage = {
      getItem: () => {
        throw new Error('storage denied')
      },
      setItem: () => {
        throw new Error('storage denied')
      },
    }

    // Losing a dismissal is acceptable; losing the banner or crashing is not.
    assert.equal(isUpdateComingSoonDismissed(comingSoonSignal(), denied), false)
    assert.doesNotThrow(() =>
      dismissUpdateComingSoon(comingSoonSignal(), denied)
    )
  })

  it('announces the coming update and discloses its basis on demand', () => {
    localStorage.removeItem(UpdateComingSoonDismissalKey)
    const signal = comingSoonSignal({
      kind: 'build-running',
      runStartedAt: now - 5 * minute,
      runURL: `https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/${ciRunID}`,
      recentRunDurations: [20 * minute, 20 * minute, 26 * minute],
      recentReleaseTimes: [now - day, now - 4 * day, now - 7 * day],
      latestReleaseTag: 'release-3.5.0',
    })
    const view = render(<UpdateComingSoon signal={signal} now={now} />)

    const summary = screen.getByRole('status')
    assert.match(summary.textContent ?? '', /New update coming soon/)
    // 20 minutes typical, 5 already spent, and always worded as an estimate.
    assert.match(summary.textContent ?? '', /Estimated in about 15 min/)

    const toggle = screen.getByRole('button', { name: 'Show more details' })
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    assert.equal(
      screen.queryByText(/Median duration of the last 3 successful runs/),
      null
    )

    fireEvent.click(toggle)

    const expanded = screen.getByRole('button', { name: 'Hide details' })
    assert.equal(expanded.getAttribute('aria-expanded'), 'true')
    const region = document.querySelector('.update-coming-soon-details')
    assert.equal(expanded.getAttribute('aria-controls'), region?.id)
    assert.ok(
      screen.getByText(/Median duration of the last 3 successful runs/),
      'estimate basis'
    )
    assert.ok(
      screen.getByText(/A Windows build for a newer commit is running now/),
      'driving signal'
    )
    assert.ok(
      screen.getByText('About one release every 3 days, over 2 gaps'),
      'recent cadence'
    )
    assert.ok(screen.getByText('release-3.5.0'), 'latest published release')
    assert.ok(screen.getByText('Not tagged yet'), 'unknown target version')
    assert.ok(screen.getByText(/not a promise/), 'estimate disclaimer')
    assert.equal(
      screen
        .getByRole('link', { name: 'View the build run' })
        .getAttribute('href'),
      signal.runURL
    )

    view.unmount()
  })

  it('stays dismissed until a different build is announced', () => {
    localStorage.removeItem(UpdateComingSoonDismissalKey)
    const signal = comingSoonSignal({ recentRunDurations: [20 * minute] })

    const view = render(<UpdateComingSoon signal={signal} now={now} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss this message' })
    )
    assert.equal(screen.queryByRole('status'), null)
    assert.equal(localStorage.getItem(UpdateComingSoonDismissalKey), buildSHA)
    view.unmount()

    const again = render(<UpdateComingSoon signal={signal} now={now} />)
    assert.equal(screen.queryByRole('status'), null)
    again.unmount()

    const next = render(
      <UpdateComingSoon
        signal={comingSoonSignal({ headSHA: laterSHA })}
        now={now}
      />
    )
    assert.ok(screen.getByRole('status'))
    next.unmount()

    localStorage.removeItem(UpdateComingSoonDismissalKey)
  })

  it('collects run and release samples once a build is proven', async () => {
    const requests = new Array<string>()
    const signal = await probeUpdateComingSoon({
      updatesURL,
      installedSHA,
      fetcher: async input => {
        const url = input.toString()
        requests.push(url)
        if (url.includes('/compare/')) {
          return jsonResponse({ status: 'ahead' })
        }
        if (url.includes('/jobs?')) {
          return jsonResponse({
            jobs: [
              {
                name: 'Windows x64',
                status: 'in_progress',
                run_id: ciRunID,
                head_sha: buildSHA,
              },
            ],
          })
        }
        if (url.includes('/releases?')) {
          return jsonResponse([
            { tag_name: 'release-3.5.0', published_at: isoDate(now - day) },
            { tag_name: 'release-3.4.0', published_at: isoDate(now - 4 * day) },
          ])
        }
        if (url.includes('status=success')) {
          return jsonResponse({
            workflow_runs: [
              {
                head_branch: 'main',
                conclusion: 'success',
                head_sha: '4'.repeat(40),
                run_started_at: isoDate(now - day),
                updated_at: isoDate(now - day + 21 * minute),
              },
            ],
          })
        }
        return jsonResponse({
          workflow_runs: [
            {
              id: ciRunID,
              status: 'in_progress',
              event: 'push',
              head_branch: 'main',
              head_sha: buildSHA,
              path: '.github/workflows/ci.yml',
              html_url: `https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/${ciRunID}`,
              run_started_at: isoDate(now - 5 * minute),
            },
          ],
        })
      },
    })

    assert.equal(signal?.kind, 'build-running')
    assert.equal(signal?.headSHA, buildSHA)
    assert.equal(signal?.runStartedAt, now - 5 * minute)
    assert.match(signal?.runURL ?? '', /\/actions\/runs\/123456788$/)
    assert.deepEqual(signal?.recentRunDurations, [21 * minute])
    assert.deepEqual(signal?.recentReleaseTimes, [now - day, now - 4 * day])
    assert.equal(signal?.latestReleaseTag, 'release-3.5.0')
    // Samples are only paid for after a newer build is already proven.
    assert.equal(requests.length, 5)
    assert.match(requests[3], /status=success/)
    assert.match(requests[4], /\/releases\?/)
  })

  it('recognizes a built-but-unreleased commit without a running build', async () => {
    const requests = new Array<string>()
    const signal = await probeUpdateComingSoon({
      updatesURL,
      installedSHA,
      fetcher: async input => {
        const url = input.toString()
        requests.push(url)
        if (url.includes('/compare/')) {
          return jsonResponse({
            status: 'ahead',
            html_url: `https://github.com/Ding-Ding-Projects/desktop-material/compare/${installedSHA}...${buildSHA}`,
            commits: [{ sha: buildSHA }],
          })
        }
        if (url.includes('/releases?')) {
          return jsonResponse([
            { tag_name: 'release-3.5.0', published_at: isoDate(now - day) },
          ])
        }
        if (url.includes('status=success')) {
          return jsonResponse({
            workflow_runs: [
              {
                head_branch: 'main',
                conclusion: 'success',
                head_sha: buildSHA,
                run_started_at: isoDate(now - day),
                updated_at: isoDate(now - day + 19 * minute),
              },
            ],
          })
        }
        return jsonResponse({ workflow_runs: [] })
      },
    })

    assert.equal(signal?.kind, 'awaiting-release')
    assert.equal(signal?.headSHA, buildSHA)
    assert.equal(signal?.runURL, null)
    assert.match(signal?.commitURL ?? '', /\/compare\//)
    assert.equal(requests.length, 5)
    assert.match(requests[2], /\/compare\/.+\.\.\.main$/)
  })

  it('reports no coming update when main is not ahead of the running build', async () => {
    const requests = new Array<string>()
    const signal = await probeUpdateComingSoon({
      updatesURL,
      installedSHA,
      fetcher: async input => {
        requests.push(input.toString())
        return input.toString().includes('/compare/')
          ? jsonResponse({ status: 'identical', commits: [] })
          : jsonResponse({ workflow_runs: [] })
      },
    })

    assert.equal(signal, null)
    // Two in-progress checks plus one compare: no samples are fetched.
    assert.equal(requests.length, 3)
  })

  it('never lets a supplementary detail fail the whole probe', async () => {
    const signal = await probeUpdateComingSoon({
      updatesURL,
      installedSHA,
      fetcher: async input => {
        const url = input.toString()
        if (url.includes('status=success') || url.includes('/releases?')) {
          return new Response('nope', { status: 500 })
        }
        if (url.includes('/compare/')) {
          return jsonResponse({ status: 'ahead', commits: [{ sha: buildSHA }] })
        }
        return jsonResponse({ workflow_runs: [] })
      },
    })

    // The verdict survives; only the details it could not read are missing.
    assert.equal(signal?.kind, 'newer-commit')
    assert.deepEqual(signal?.recentRunDurations, [])
    assert.deepEqual(signal?.recentReleaseTimes, [])
    assert.equal(signal?.latestReleaseTag, null)
  })

  it('publishes every coming-update string in both languages', () => {
    const keys = Object.keys(englishTranslations).filter(key =>
      key.startsWith('update.comingSoon.')
    ) as ReadonlyArray<TranslationKey>

    assert.equal(keys.length, 33)
    for (const key of keys) {
      assert.equal(typeof englishTranslations[key], 'string', key)
      assert.equal(typeof cantoneseTranslations[key], 'string', key)
      assert.notEqual(englishTranslations[key], '', key)
      assert.notEqual(cantoneseTranslations[key], '', key)
    }

    // The details are evidence, so they read the same in every language mode.
    assert.equal(
      translate('update.comingSoon.basisGreenCI', 'bilingual'),
      'The build already passed, so only the publishing step is outstanding · 建置已經過咗，淨返發布呢一步'
    )
    // A translated duration must not leak one language into the other half.
    assert.equal(
      translate('update.comingSoon.cadenceValue', 'bilingual', {
        gap: translatedVariable('update.comingSoon.durationDays', {
          count: '3',
        }),
        count: '2',
      }),
      'About one release every 3 days, over 2 gaps · 大約每 3 日出一個 release，睇咗 2 段間隔'
    )
  })
})
