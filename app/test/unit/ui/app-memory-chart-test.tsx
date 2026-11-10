import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { AppMemoryChart } from '../../../src/ui/repository-tools/app-memory-chart'
import { act, fireEvent, render, screen } from '../../helpers/ui/render'

const megabyte = 1024 * 1024

describe('live memory chart', () => {
  it('samples, pauses on request, and lets a sample be inspected', () => {
    {
      let sample = () => {}
      const schedule = (callback: () => void) => {
        sample = callback
        return () => {}
      }
      let clock = 1_000_000
      const readings = [400, 410, 430, 420]
      let reads = 0
      render(
        <AppMemoryChart
          now={() => clock}
          schedule={schedule}
          readMemory={() => readings[reads++ % readings.length] * megabyte}
        />
      )

      assert.ok(screen.getByText('Live'))
      for (let tick = 0; tick < 2; tick++) {
        act(() => {
          clock += 1000
          sample()
        })
      }
      assert.equal(reads, 3)
      assert.match(
        screen.getByRole('img').getAttribute('aria-label') ?? '',
        /latest 430 MB, lowest 400 MB, highest 430 MB over 2 seconds, rising/
      )

      const slider = screen.getByLabelText('Inspect a sample')
      fireEvent.change(slider, { target: { value: '0' } })
      assert.match(slider.getAttribute('aria-valuetext') ?? '', /^400 MB at /)
      fireEvent.click(screen.getByRole('button', { name: 'Latest' }))
      assert.match(
        screen
          .getByLabelText('Inspect a sample')
          .getAttribute('aria-valuetext') ?? '',
        /^430 MB at /
      )

      fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
      act(() => {
        clock += 1000
        sample()
      })
      assert.equal(reads, 3)
      assert.ok(screen.getByText('Paused'))
      assert.ok(screen.getByText(/The line holds its last real value\.$/))
      assert.ok(screen.getByRole('button', { name: 'Resume' }))
    }
  })

  it('turns stale instead of inventing values when readings fail', () => {
    {
      let sample = () => {}
      const schedule = (callback: () => void) => {
        sample = callback
        return () => {}
      }
      let clock = 5_000_000
      let fail = false
      render(
        <AppMemoryChart
          now={() => clock}
          schedule={schedule}
          readMemory={() => {
            if (fail) {
              throw new Error('unavailable')
            }
            return 300 * megabyte
          }}
        />
      )
      fail = true
      for (let tick = 0; tick < 7; tick++) {
        act(() => {
          clock += 1000
          sample()
        })
      }
      assert.ok(screen.getByText('Stale'))
      assert.ok(screen.getByText(/Nothing is estimated\.$/))
    }
  })
})
