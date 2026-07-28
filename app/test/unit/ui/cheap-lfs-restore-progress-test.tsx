import assert from 'node:assert'
import { beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import {
  CheapLfsRestoreLookAheadThresholdPercent,
  ICheapLfsRestoreProgress,
} from '../../../src/lib/cheap-lfs/restore-progress'
import {
  AudioSettingsStorageKey,
  DefaultAudioSystemSettings,
  serializeAudioSettings,
} from '../../../src/lib/audio/audio-settings'
import { CheapLfsRestoreProgress } from '../../../src/ui/lib/cheap-lfs-restore-progress'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function progressFixture(
  overrides: Partial<ICheapLfsRestoreProgress> = {}
): ICheapLfsRestoreProgress {
  return {
    repositoryId: 22,
    repositoryName: 'media-library',
    provider: 'mixed',
    phase: 'downloading',
    filesSucceeded: 1,
    filesFailed: 1,
    filesRemaining: 2,
    filesTotal: 4,
    logicalProcessedBytes: 1_800,
    logicalTotalBytes: 2_000,
    actualDownloadedBytes: 950,
    actualDownloadTotalBytes: 1_500,
    downloadRateBytesPerSecond: 256,
    etaSeconds: 12,
    elapsedSeconds: 8,
    queuedFiles: 2,
    queuedParts: 3,
    currentLane: {
      provider: 'github-release',
      phase: 'downloading',
      relativePath: 'assets/current-video.mp4',
      fileOrdinal: 2,
      filesTotal: 4,
      partOrdinal: 2,
      partsTotal: 3,
      processedBytes: 900,
      totalBytes: 1_000,
      percent: 90,
    },
    prefetchLane: {
      provider: 'ghcr',
      phase: 'downloading',
      relativePath: 'models/next-model.bin',
      fileOrdinal: 3,
      filesTotal: 4,
      partOrdinal: null,
      partsTotal: null,
      processedBytes: 50,
      totalBytes: 500,
      percent: 10,
    },
    lookAheadThresholdPercent: CheapLfsRestoreLookAheadThresholdPercent,
    failures: [
      {
        relativePath: 'audio/broken.wav',
        reason: 'Asset digest did not match.',
        statusCode: 422,
      },
    ],
    cancelRequested: false,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.removeItem('appearance-customization-v1')
  localStorage.removeItem('language-mode-v1')
  localStorage.removeItem(AudioSettingsStorageKey)
})

describe('CheapLfsRestoreProgress', () => {
  it('shows detailed batch, timing, queue, failure and two-lane progress', () => {
    let cancelCalls = 0
    render(
      <CheapLfsRestoreProgress
        progress={progressFixture()}
        onCancel={() => {
          cancelCalls += 1
        }}
      />
    )

    assert.ok(
      screen.getByRole('region', {
        name: 'Large-file restore progress for media-library',
      })
    )
    assert.ok(screen.getByText('Large-file restore'))
    assert.ok(screen.getByText('Provider: Mixed providers'))
    assert.ok(screen.getByText('Phase: Downloading'))
    assert.ok(screen.getAllByText('Downloading').length >= 2)
    assert.ok(
      screen.getByText('Next download is already running — it started at 90%.')
    )
    assert.ok(
      screen.getByText('1 succeeded · 1 failed · 2 remaining · 4 total')
    )
    assert.ok(screen.getByText('2 files · 3 parts'))
    assert.ok(screen.getByText('File 2/4'))
    assert.ok(screen.getByText('Part 2/3'))
    assert.ok(screen.getByText('assets/current-video.mp4'))
    assert.ok(screen.getByText('models/next-model.bin'))
    assert.ok(
      screen.getByText('HTTP 422 · reason: Asset digest did not match.')
    )

    const overall = screen.getByRole('progressbar', {
      name: 'Overall large-file restore progress',
    })
    assert.equal(overall.getAttribute('aria-valuenow'), '90')
    assert.equal(overall.getAttribute('aria-valuemax'), '100')
    assert.match(overall.getAttribute('aria-valuetext') ?? '', /90%/)
    assert.match(overall.getAttribute('aria-valuetext') ?? '', /1 failed/)

    const current = screen.getByRole('progressbar', {
      name: 'Download progress for assets/current-video.mp4',
    })
    assert.equal(current.getAttribute('aria-valuenow'), '90')
    assert.equal(current.getAttribute('aria-valuemax'), '100')
    assert.match(current.getAttribute('aria-valuetext') ?? '', /90%/)

    const prefetched = screen.getByRole('progressbar', {
      name: 'Download progress for models/next-model.bin',
    })
    assert.equal(prefetched.getAttribute('aria-valuenow'), '10')

    // Exact counters remain navigable, but only one coarse summary announces.
    const statuses = screen.getAllByRole('status')
    assert.equal(statuses.length, 1)
    assert.equal(
      statuses[0].textContent,
      'Restore 90% · 1 succeeded · 1 failed · 2 remaining'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Stop restoring' }))
    assert.equal(cancelCalls, 1)
  })

  it('keeps the polite summary stable inside a 10% bucket', () => {
    const view = render(
      <CheapLfsRestoreProgress
        progress={progressFixture({
          logicalProcessedBytes: 620,
          logicalTotalBytes: 2_000,
        })}
      />
    )
    const firstSummary = screen.getByRole('status')
    assert.match(firstSummary.textContent ?? '', /Restore 30%/)

    view.rerender(
      <CheapLfsRestoreProgress
        progress={progressFixture({
          logicalProcessedBytes: 798,
          logicalTotalBytes: 2_000,
        })}
      />
    )

    assert.equal(
      screen.getByRole('status').textContent,
      firstSummary.textContent
    )
    const overall = screen.getByRole('progressbar', {
      name: 'Overall large-file restore progress',
    })
    assert.equal(overall.getAttribute('aria-valuenow'), '39')
    assert.match(overall.getAttribute('aria-valuetext') ?? '', /39%/)
  })

  it('does not round 89.9% up to the 90% look-ahead boundary', () => {
    const base = progressFixture()
    render(
      <CheapLfsRestoreProgress
        progress={progressFixture({
          currentLane: {
            ...base.currentLane!,
            processedBytes: 899,
            // The renderer normalizer rejects a stale rounded producer value.
            percent: 90,
          },
          prefetchLane: null,
        })}
      />
    )

    const current = screen.getByRole('progressbar', {
      name: 'Download progress for assets/current-video.mp4',
    })
    assert.equal(current.getAttribute('aria-valuenow'), '89')
    assert.equal(current.querySelector('span')?.style.width, '89%')
    assert.ok(
      screen.getByText(
        'Next download starts when this lane reaches exactly 90%.'
      )
    )
  })

  it('makes a requested cancellation visible and non-repeatable', () => {
    render(
      <CheapLfsRestoreProgress
        progress={progressFixture({
          cancelRequested: true,
          phase: 'canceling',
        })}
        onCancel={() => {
          throw new Error('disabled cancel must not run')
        }}
      />
    )

    const button = screen.getByRole('button', { name: 'Stopping…' })
    assert.equal(button.getAttribute('aria-disabled'), 'true')
    assert.equal(button.getAttribute('aria-busy'), 'true')
    assert.ok(screen.getByText('Phase: Stopping'))
  })

  it('localizes the truthful decrypting fact while each language keeps its own tone', () => {
    localStorage.setItem('language-mode-v1', 'bilingual')
    localStorage.setItem(
      AudioSettingsStorageKey,
      serializeAudioSettings({
        ...DefaultAudioSystemSettings,
        funnyLevelEnglish: 1,
        funnyLevelCantonese: 5,
      })
    )
    const base = progressFixture()
    const view = render(
      <CheapLfsRestoreProgress
        progress={progressFixture({
          phase: 'decrypting',
          currentLane: {
            ...base.currentLane!,
            phase: 'decrypting',
          },
        })}
      />
    )

    const badges = view.container.querySelectorAll(
      '.cheap-lfs-restore-badges span'
    )
    const phaseBadge = badges[badges.length - 1]
    assert.equal(
      phaseBadge.textContent,
      'Phase: Decrypting · 階段：幫啲加密資料解密緊'
    )
    assert.ok(screen.getByText('Decrypting · 幫啲加密資料解密緊'))

    localStorage.setItem('language-mode-v1', 'english')
    localStorage.setItem(
      AudioSettingsStorageKey,
      serializeAudioSettings({
        ...DefaultAudioSystemSettings,
        funnyLevelEnglish: 5,
        funnyLevelCantonese: 1,
      })
    )
    view.rerender(
      <CheapLfsRestoreProgress
        progress={progressFixture({
          phase: 'decrypting',
          currentLane: {
            ...base.currentLane!,
            phase: 'decrypting',
          },
        })}
      />
    )

    assert.ok(screen.getByText('Phase: Decrypting the locked bytes'))
    assert.ok(screen.getByText('Decrypting the locked bytes'))
  })

  it('renders the sequential compatibility snapshot without bogus lane data', () => {
    const view = render(
      <CheapLfsRestoreProgress
        progress={{
          repositoryId: 1,
          repositoryName: 'legacy',
          filesCompleted: 1,
          filesTotal: 2,
          transferredBytes: 512,
          totalBytes: 1_024,
        }}
      />
    )

    assert.ok(screen.getByText('Waiting for the first provider lane…'))
    assert.ok(screen.getByText('Not reported by this provider'))
    assert.equal(
      view.baseElement.querySelectorAll('.cheap-lfs-restore-lane').length,
      0
    )
  })
})
