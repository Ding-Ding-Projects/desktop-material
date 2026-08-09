import assert from 'node:assert'
import { describe, it, mock } from 'node:test'
import * as React from 'react'

import { Repository } from '../../../src/models/repository'
import { render } from '../../helpers/ui/render'

interface ISuggestion {
  readonly templateId: string
  readonly score: number
  readonly reasons: ReadonlyArray<string>
}

let completeSuggestions:
  | ((suggestions: ReadonlyArray<ISuggestion>) => void)
  | null = null

mock.module('../../../src/lib/gitignore', {
  namedExports: {
    applyTemplate: (text: string | null) => text ?? '',
    getAppliedTemplates: () => [],
    getTemplateById: () => null,
    getTemplateCatalog: () => [],
    removeTemplateSection: (text: string) => text,
    suggestGitIgnoreTemplates: () =>
      new Promise<ReadonlyArray<ISuggestion>>(resolve => {
        completeSuggestions = resolve
      }),
  },
})

describe('GitIgnore lifecycle', () => {
  it('drops a suggestion completion after the settings tab unmounts', async () => {
    const { GitIgnore } = await import(
      '../../../src/ui/repository-settings/git-ignore'
    )
    const originalError = console.error
    const errors = new Array<string>()
    console.error = (...args: ReadonlyArray<unknown>) => {
      errors.push(args.map(value => String(value)).join(' '))
    }

    try {
      const view = render(
        <GitIgnore
          repository={new Repository('C:/git-ignore-lifecycle', 1, null, false)}
          text={null}
          onIgnoreTextChanged={() => {}}
          onShowExamples={() => {}}
        />
      )
      const resolve = completeSuggestions
      assert.ok(resolve !== null)

      view.unmount()
      resolve([])
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
