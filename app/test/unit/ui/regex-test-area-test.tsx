import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { translate } from '../../../src/lib/i18n'
import { setLanguageModePreference } from '../../../src/lib/language-preference'
import {
  MaxRegexCaptureWork,
  MaxRegexMatchCount,
} from '../../../src/lib/safe-regex'
import { RegexTestArea } from '../../../src/ui/lib/regex-builder/regex-test-area'
import { render, screen } from '../../helpers/ui/render'

describe('RegexTestArea', () => {
  it('allocates complete rows for the first summary, body, and hash', () => {
    const sha = '5f4cc173b208d67b282cd870130c54892359d27f'
    const sample = `Add deterministic initialized and dormant submodules\n\n${sha} ${sha.slice(
      0,
      7
    )}`
    const view = render(
      <RegexTestArea
        pattern=""
        flags="i"
        sample={sample}
        onSampleChanged={() => undefined}
      />
    )

    const input = screen.getByRole('textbox', {
      name: 'Sample text for testing the regular expression',
    }) as HTMLTextAreaElement
    assert.equal(input.rows, 3)
    assert.deepStrictEqual(input.value.split(/\r?\n/).slice(0, 3), [
      'Add deterministic initialized and dormant submodules',
      '',
      `${sha} ${sha.slice(0, 7)}`,
    ])
    assert.equal(
      view.container.querySelector('.regex-test-preview')?.textContent,
      sample
    )
  })

  it('matches and highlights each sample line as an independent candidate', () => {
    const sample = 'bar\nfoo\nfood'
    const view = render(
      <RegexTestArea
        pattern="^foo$"
        flags=""
        sample={sample}
        onSampleChanged={() => undefined}
      />
    )

    assert.equal(
      view.container.querySelector('.regex-test-count')?.textContent,
      '1 match'
    )
    const preview = view.container.querySelector('.regex-test-preview')
    assert.equal(preview?.textContent, sample)
    assert.deepEqual(
      Array.from(
        preview?.querySelectorAll('mark') ?? [],
        mark => mark.textContent
      ),
      ['foo']
    )
    assert.equal(preview?.firstElementChild?.textContent, 'bar\n')
  })

  it('does not allow a match to cross candidate-line boundaries', () => {
    const view = render(
      <RegexTestArea
        pattern="foo\\s+bar"
        flags=""
        sample={'foo\nbar'}
        onSampleChanged={() => undefined}
      />
    )

    assert.equal(
      view.container.querySelector('.regex-test-count')?.textContent,
      '0 matches'
    )
    assert.equal(
      view.container.querySelectorAll('.regex-test-preview mark').length,
      0
    )
  })

  it('shares the capture-work match budget across every sample line', () => {
    const captureGroups = 500
    const safeMatchLimit = MaxRegexCaptureWork / captureGroups
    const view = render(
      <RegexTestArea
        pattern={'()'.repeat(captureGroups)}
        flags=""
        sample={'\n'.repeat(safeMatchLimit)}
        onSampleChanged={() => undefined}
      />
    )

    assert.equal(safeMatchLimit < MaxRegexMatchCount, true)
    assert.equal(
      view.container.querySelector('.regex-test-count')?.textContent,
      `${safeMatchLimit}+ matches`
    )
  })

  it('uses one concise status linked to one detailed invalid-pattern error', () => {
    const view = render(
      <RegexTestArea
        pattern="("
        flags=""
        sample="sample"
        onSampleChanged={() => undefined}
      />
    )

    const status = view.container.querySelector('.regex-test-count')
    const detail = screen.getByRole('alert')
    assert.equal(status?.textContent, 'Invalid pattern')
    assert.equal(status?.getAttribute('aria-live'), null)
    assert.equal(status?.getAttribute('aria-describedby'), detail.id)
    assert.match(detail.textContent ?? '', /Invalid or unsupported safe RE2/)
    assert.equal(view.container.querySelectorAll('.regex-test-error').length, 1)
  })

  it('reuses the builder-owned pattern error without rendering a duplicate', () => {
    const view = render(
      <RegexTestArea
        pattern="("
        flags=""
        sample="sample"
        onSampleChanged={() => undefined}
        externalPatternErrorId="builder-pattern-error"
      />
    )

    const status = view.container.querySelector('.regex-test-count')
    assert.equal(status?.textContent, 'Invalid pattern')
    assert.equal(
      status?.getAttribute('aria-describedby'),
      'builder-pattern-error'
    )
    assert.equal(view.container.querySelector('.regex-test-error'), null)
  })

  it('shows numbered and named captures and labels unmatched groups', () => {
    render(
      <RegexTestArea
        pattern="(?<word>foo)-(bar)?"
        flags=""
        sample="foo-"
        onSampleChanged={() => undefined}
      />
    )

    const summary = screen.getByRole('group', {
      name: 'Capture groups from the first match',
    })
    assert.deepEqual(
      Array.from(summary.querySelectorAll('dt'), term => term.textContent),
      ['$1', '$2', '<word>']
    )
    assert.deepEqual(
      Array.from(summary.querySelectorAll('dd'), value => value.textContent),
      ['foo', 'unmatched', 'foo']
    )
  })

  it('bounds the capture summary and reports omitted groups', () => {
    render(
      <RegexTestArea
        pattern={'()'.repeat(30)}
        flags=""
        sample=""
        onSampleChanged={() => undefined}
      />
    )

    const summary = screen.getByRole('group', {
      name: 'Capture groups from the first match',
    })
    assert.equal(summary.querySelectorAll('dt').length, 24)
    assert.match(summary.textContent ?? '', /\+6 more/)
  })

  it('localizes capture summaries without bilingual accessible names', () => {
    const previousLanguageMode = localStorage.getItem('language-mode-v1')
    try {
      setLanguageModePreference('bilingual')
      render(
        <RegexTestArea
          pattern="(foo)?()"
          flags=""
          sample=""
          onSampleChanged={() => undefined}
        />
      )

      const summary = screen.getByRole('group', {
        name: translate('regex.test.capture.groupLabel', 'english'),
      })
      assert.match(
        summary.textContent ?? '',
        /CAPTURES.*擷取群組.*unmatched.*未配對.*empty.*空白/s
      )
    } finally {
      if (previousLanguageMode === null) {
        localStorage.removeItem('language-mode-v1')
      } else {
        localStorage.setItem('language-mode-v1', previousLanguageMode)
      }
    }
  })
})
