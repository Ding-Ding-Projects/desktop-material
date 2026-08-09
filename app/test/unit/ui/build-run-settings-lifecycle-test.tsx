import assert from 'node:assert'
import { describe, it, mock } from 'node:test'
import * as React from 'react'

import { Repository } from '../../../src/models/repository'
import { defaultBuildRunPreferences } from '../../../src/models/build-run-preferences'
import { render } from '../../helpers/ui/render'

interface IProbe {
  readonly exists: (relativePath: string) => boolean
  readonly readText: (relativePath: string) => string | null
  readonly sampleFiles: ReadonlyArray<string>
  readonly platform: NodeJS.Platform
}

let completeProbe: ((probe: IProbe) => void) | null = null

mock.module('../../../src/lib/build-run', {
  namedExports: {
    detectProfiles: () => [],
    getBuildProfileDisplayName: () => 'Test profile',
    probeRepository: () =>
      new Promise<IProbe>(resolve => {
        completeProbe = resolve
      }),
  },
})

describe('BuildRunSettings lifecycle', () => {
  it('drops a probe completion after the settings tab unmounts', async () => {
    const { BuildRunSettings } = await import(
      '../../../src/ui/repository-settings/build-run-settings'
    )
    const originalError = console.error
    const errors = new Array<string>()
    console.error = (...args: ReadonlyArray<unknown>) => {
      errors.push(args.map(value => String(value)).join(' '))
    }

    try {
      const view = render(
        <BuildRunSettings
          repository={new Repository('C:/build-run-lifecycle', 1, null, false)}
          preferences={defaultBuildRunPreferences}
          onPreferencesChanged={() => {}}
        />
      )
      const resolve = completeProbe
      assert.ok(resolve !== null)

      view.unmount()
      resolve({
        exists: () => false,
        readText: () => null,
        sampleFiles: [],
        platform: 'win32',
      })
      await new Promise<void>(resolveTimer => setTimeout(resolveTimer, 0))

      assert.equal(
        errors.some(message =>
          message.includes(
            "Can't perform a React state update on an unmounted component"
          )
        ),
        false
      )
    } finally {
      console.error = originalError
    }
  })
})
