import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { Repository } from '../../../src/models/repository'
import {
  IBuildRunPreferences,
  defaultBuildRunPreferences,
} from '../../../src/models/build-run-preferences'
import { BuildRunSettings } from '../../../src/ui/repository-settings/build-run-settings'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const repository = () =>
  new Repository('C:/auto-pull-repo', 1, null, false, null, {}, false)

describe('Build & Run auto-build-on-pull preference', () => {
  it('is disabled by default', () => {
    assert.equal(defaultBuildRunPreferences.autoBuildOnPull, false)
  })

  it('toggles autoBuildOnPull through the settings checkbox', () => {
    const changes: IBuildRunPreferences[] = []
    render(
      <BuildRunSettings
        repository={repository()}
        preferences={defaultBuildRunPreferences}
        onPreferencesChanged={p => changes.push(p)}
      />
    )

    const checkbox = screen.getByLabelText(/build after pulling new commits/i)
    fireEvent.click(checkbox)

    assert.equal(changes.length, 1)
    assert.equal(changes[0].autoBuildOnPull, true)
    // The other behaviour toggles must ride along unchanged.
    assert.equal(changes[0].autoRunAfterBuild, true)
    assert.equal(changes[0].autoIgnoreBuildOutputs, true)
  })

  it('renders the checkbox checked when the preference is on', () => {
    render(
      <BuildRunSettings
        repository={repository()}
        preferences={{ ...defaultBuildRunPreferences, autoBuildOnPull: true }}
        onPreferencesChanged={() => {}}
      />
    )

    const checkbox = screen.getByLabelText<HTMLInputElement>(
      /build after pulling new commits/i
    )
    assert.equal(checkbox.checked, true)
  })
})
