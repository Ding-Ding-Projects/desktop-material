import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  AIMergeEditor,
  AIMergeEditorMaximumPathLength,
  AIMergeEditorMaximumReasonLength,
  AIMergeEditorMaximumResultLength,
  AIMergeEditorMaximumSourceLength,
  createAIMergeEditorDisplayModel,
  IAIMergeEditorFile,
  IAIMergeEditorLabels,
  IAIMergeEditorProps,
  IAIMergeEditorResultChange,
  IAIMergeEditorSelection,
} from '../../../src/ui/merge-conflicts/ai-merge-editor'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const styles = readFileSync(
  join(process.cwd(), 'app', 'styles', 'ui', '_ai-merge-editor.scss'),
  'utf8'
)
const source = readFileSync(
  join(
    process.cwd(),
    'app',
    'src',
    'ui',
    'merge-conflicts',
    'ai-merge-editor.tsx'
  ),
  'utf8'
)

const labels: IAIMergeEditorLabels = {
  editor: 'AI merge editor',
  filePath: 'Selected file:',
  ours: 'Ours',
  result: 'Editable result',
  theirs: 'Theirs',
  readOnly: 'Read only',
  summary: 'AI Merge Summary',
  confidence: 'Confidence',
  reason: 'Reason',
  summaryUnavailable: 'AI summary unavailable',
  formatConfidence: value => `${value}% confidence`,
  autoResolve: 'Auto-resolve with AI',
  policyPending: 'AI policy verification is pending.',
  policyDenied: 'AI policy denied this action.',
  openExternalTool: 'Open in external merge tool',
  contentTruncated: 'Content was truncated for display.',
  resultCharacterLimit: maximum => `Maximum ${maximum} characters.`,
  resultTooLarge: maximum =>
    `The result exceeds ${maximum} characters and is read only here.`,
}

function mergeFile(
  overrides: Partial<IAIMergeEditorFile> = {}
): IAIMergeEditorFile {
  return {
    id: 'file-17',
    path: 'src/feature/conflicted.ts',
    ours: 'const source = "ours"\n',
    result: 'const source = "result"\n',
    theirs: 'const source = "theirs"\n',
    summary: {
      kind: 'available',
      confidence: 73,
      reason: 'Both sides update independent fields.',
    },
    ...overrides,
  }
}

function editor(
  overrides: Partial<IAIMergeEditorProps> = {}
): React.ReactElement {
  return (
    <AIMergeEditor
      file={mergeFile()}
      policyState="allowed"
      labels={labels}
      onResultChange={() => undefined}
      onAutoResolve={() => undefined}
      onOpenExternalTool={() => undefined}
      {...overrides}
    />
  )
}

function textbox(name: string): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name }) as HTMLTextAreaElement
}

describe('AI merge editor', () => {
  it('renders two read-only sources and emits an exact controlled result payload', () => {
    const changes = new Array<IAIMergeEditorResultChange>()
    const file = mergeFile()
    const view = render(
      editor({ file, onResultChange: change => changes.push(change) })
    )

    const ours = textbox(`${labels.ours} ${labels.readOnly}`)
    const result = textbox(labels.result)
    const theirs = textbox(`${labels.theirs} ${labels.readOnly}`)

    assert.equal(ours.tagName, 'TEXTAREA')
    assert.equal(result.tagName, 'TEXTAREA')
    assert.equal(theirs.tagName, 'TEXTAREA')
    assert.equal(ours.value, file.ours)
    assert.equal(result.value, file.result)
    assert.equal(theirs.value, file.theirs)
    assert.equal(ours.readOnly, true)
    assert.equal(theirs.readOnly, true)
    assert.equal(result.readOnly, false)
    assert.equal(ours.getAttribute('aria-readonly'), 'true')
    assert.equal(theirs.getAttribute('aria-readonly'), 'true')
    assert.equal(result.hasAttribute('aria-readonly'), false)
    assert.ok(result.name.length > 0)
    assert.equal(result.name, result.id)
    assert.equal(result.maxLength, AIMergeEditorMaximumResultLength)

    const nextText = 'const source = "merged"\nconst safe = true\n'
    fireEvent.change(result, { target: { value: nextText } })
    assert.deepEqual(changes, [
      { id: file.id, path: file.path, text: nextText },
    ])
    assert.deepEqual(Object.keys(changes[0]).sort(), ['id', 'path', 'text'])

    view.rerender(editor({ file: { ...file, result: nextText } }))
    assert.equal(textbox(labels.result).value, nextText)
  })

  it('refuses an over-limit result instead of emitting silently truncated code', () => {
    const changes = new Array<IAIMergeEditorResultChange>()
    render(editor({ onResultChange: change => changes.push(change) }))

    fireEvent.change(textbox(labels.result), {
      target: { value: 'x'.repeat(AIMergeEditorMaximumResultLength + 1) },
    })
    assert.deepEqual(changes, [])
    assert.ok(
      screen.getByText(
        labels.resultCharacterLimit(AIMergeEditorMaximumResultLength)
      )
    )
  })

  it('bounds incoming panes and locks an oversized controlled result', () => {
    const oversizedOurs = 'o'.repeat(AIMergeEditorMaximumSourceLength + 1)
    const oversizedResult = 'r'.repeat(AIMergeEditorMaximumResultLength + 1)
    const oversizedTheirs = 't'.repeat(AIMergeEditorMaximumSourceLength + 1)
    const changes = new Array<IAIMergeEditorResultChange>()
    render(
      editor({
        file: mergeFile({
          ours: oversizedOurs,
          result: oversizedResult,
          theirs: oversizedTheirs,
        }),
        onResultChange: change => changes.push(change),
      })
    )

    const ours = textbox(`${labels.ours} ${labels.readOnly}`)
    const result = textbox(`${labels.result} ${labels.readOnly}`)
    const theirs = textbox(`${labels.theirs} ${labels.readOnly}`)
    assert.equal(ours.value.length, AIMergeEditorMaximumSourceLength)
    assert.equal(result.value.length, AIMergeEditorMaximumResultLength)
    assert.equal(theirs.value.length, AIMergeEditorMaximumSourceLength)
    assert.equal(ours.value, oversizedOurs.slice(0, -1))
    assert.equal(result.value, oversizedResult.slice(0, -1))
    assert.equal(theirs.value, oversizedTheirs.slice(0, -1))
    assert.equal(result.readOnly, true)
    assert.equal(result.getAttribute('aria-readonly'), 'true')
    assert.equal(result.getAttribute('aria-invalid'), 'true')
    const descriptions = (result.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .map(id => document.getElementById(id)?.textContent)
      .join(' ')
    assert.match(
      descriptions,
      new RegExp(String(AIMergeEditorMaximumResultLength))
    )
    assert.match(descriptions, /read only here/)
    assert.equal(screen.getAllByText(labels.contentTruncated).length, 2)

    fireEvent.change(result, { target: { value: 'unsafe partial edit' } })
    assert.deepEqual(changes, [])
  })

  it('invokes AI only when allowed and keeps the external tool independent', () => {
    const aiCalls = new Array<IAIMergeEditorSelection>()
    const externalCalls = new Array<IAIMergeEditorSelection>()
    const file = mergeFile()
    const view = render(
      editor({
        file,
        onAutoResolve: selection => aiCalls.push(selection),
        onOpenExternalTool: selection => externalCalls.push(selection),
      })
    )

    fireEvent.click(screen.getByRole('button', { name: labels.autoResolve }))
    assert.deepEqual(aiCalls, [{ id: file.id, path: file.path }])
    assert.deepEqual(Object.keys(aiCalls[0]).sort(), ['id', 'path'])

    view.rerender(
      editor({
        file,
        policyState: 'denied',
        onAutoResolve: selection => aiCalls.push(selection),
        onOpenExternalTool: selection => externalCalls.push(selection),
      })
    )
    const deniedAction = screen.getByRole('button', {
      name: labels.autoResolve,
    })
    assert.equal(deniedAction.hasAttribute('disabled'), false)
    assert.equal(deniedAction.getAttribute('aria-disabled'), 'true')
    assert.notEqual(deniedAction.getAttribute('tabindex'), '-1')
    deniedAction.focus()
    assert.equal(document.activeElement, deniedAction)
    const deniedDescriptionId = deniedAction.getAttribute('aria-describedby')
    assert.ok(deniedDescriptionId)
    assert.equal(
      document.getElementById(deniedDescriptionId)?.textContent,
      labels.policyDenied
    )
    fireEvent.click(deniedAction)
    assert.equal(aiCalls.length, 1)

    fireEvent.click(
      screen.getByRole('button', { name: labels.openExternalTool })
    )
    assert.deepEqual(externalCalls, [{ id: file.id, path: file.path }])

    view.rerender(
      editor({
        file,
        policyState: 'pending',
        onAutoResolve: selection => aiCalls.push(selection),
        onOpenExternalTool: selection => externalCalls.push(selection),
      })
    )
    const pendingAction = screen.getByRole('button', {
      name: labels.autoResolve,
    })
    assert.equal(pendingAction.getAttribute('aria-disabled'), 'true')
    assert.equal(pendingAction.getAttribute('aria-busy'), 'true')
    const pendingDescriptionId = pendingAction.getAttribute('aria-describedby')
    assert.ok(pendingDescriptionId)
    assert.equal(
      document.getElementById(pendingDescriptionId)?.textContent,
      labels.policyPending
    )
    fireEvent.click(pendingAction)
    assert.equal(aiCalls.length, 1)
  })

  it('distinguishes valid zero confidence from an unavailable summary', () => {
    const view = render(
      editor({
        file: mergeFile({
          summary: {
            kind: 'available',
            confidence: 0,
            reason: 'No reliable overlap signal was found.',
          },
        }),
      })
    )

    let meter = document.querySelector<HTMLMeterElement>(
      '.ai-merge-editor__summary meter'
    )
    assert.ok(meter)
    assert.equal(meter.value, 0)
    assert.equal(meter.min, 0)
    assert.equal(meter.max, 100)
    assert.equal(meter.getAttribute('aria-labelledby')?.length === 0, false)
    assert.ok(screen.getByText(labels.formatConfidence(0)))
    assert.ok(screen.getByText('No reliable overlap signal was found.'))
    assert.equal(screen.queryByText(labels.summaryUnavailable), null)

    view.rerender(
      editor({ file: mergeFile({ summary: { kind: 'unavailable' } }) })
    )
    meter = document.querySelector<HTMLMeterElement>(
      '.ai-merge-editor__summary meter'
    )
    assert.equal(meter, null)
    assert.ok(screen.getByText(labels.summaryUnavailable))

    view.rerender(
      editor({
        file: mergeFile({
          summary: {
            kind: 'available',
            confidence: 101,
            reason: 'An invalid confidence must not be clamped.',
          },
        }),
      })
    )
    assert.equal(
      document.querySelector('.ai-merge-editor__summary meter'),
      null
    )
    assert.ok(screen.getByText(labels.summaryUnavailable))
  })

  it('bounds and sanitizes display metadata without changing selected identity', () => {
    const rawPath = ` C:\\repo\\\u202e${'x'.repeat(
      AIMergeEditorMaximumPathLength + 20
    )}\n `
    const rawReason = `\u0000 Plain reason \u202e ${'y'.repeat(
      AIMergeEditorMaximumReasonLength + 20
    )}`
    const file = mergeFile({
      path: rawPath,
      summary: { kind: 'available', confidence: 50, reason: rawReason },
    })
    const model = createAIMergeEditorDisplayModel(file)

    assert.equal(model.path.length, AIMergeEditorMaximumPathLength)
    assert.equal(model.pathTruncated, true)
    assert.doesNotMatch(model.path, /[\u0000\u202e\r\n]/)
    assert.deepEqual(model.ours, { text: file.ours, truncated: false })
    assert.deepEqual(model.result, { text: file.result, truncated: false })
    assert.deepEqual(model.theirs, { text: file.theirs, truncated: false })
    assert.equal(model.summary.kind, 'available')
    if (model.summary.kind === 'available') {
      assert.equal(
        model.summary.reason.length,
        AIMergeEditorMaximumReasonLength
      )
      assert.equal(model.summary.reasonTruncated, true)
      assert.doesNotMatch(model.summary.reason, /[\u0000\u202e\r\n]/)
    }

    const calls = new Array<IAIMergeEditorSelection>()
    render(editor({ file, onAutoResolve: selection => calls.push(selection) }))
    fireEvent.click(screen.getByRole('button', { name: labels.autoResolve }))
    assert.deepEqual(calls, [{ id: file.id, path: rawPath }])
    assert.ok(screen.getAllByText(labels.contentTruncated).length >= 2)
    assert.ok(
      document
        .querySelector('.ai-merge-editor__path')
        ?.textContent?.includes(`${model.path} ${labels.contentTruncated}`)
    )
    if (model.summary.kind === 'available') {
      assert.ok(
        document
          .querySelector('.ai-merge-editor__summary-reason')
          ?.textContent?.includes(
            `${model.summary.reason} ${labels.contentTruncated}`
          )
      )
    }
  })

  it('renders hostile HTML-looking content only as plain text and editor values', () => {
    const hostile =
      '<img src=x onerror="globalThis.pwned=true"><script>bad()</script>'
    render(
      editor({
        file: mergeFile({
          path: hostile,
          ours: hostile,
          result: hostile,
          theirs: hostile,
          summary: { kind: 'available', confidence: 88, reason: hostile },
        }),
      })
    )

    assert.equal(document.querySelector('.ai-merge-editor img'), null)
    assert.equal(document.querySelector('.ai-merge-editor script'), null)
    assert.equal(
      document.querySelector('.ai-merge-editor__path-value')?.textContent,
      hostile
    )
    assert.equal(
      document.querySelector('.ai-merge-editor__summary-reason')?.textContent,
      hostile
    )
    assert.equal(textbox(`${labels.ours} ${labels.readOnly}`).value, hostile)
    assert.equal(textbox(labels.result).value, hostile)
    assert.equal(textbox(`${labels.theirs} ${labels.readOnly}`).value, hostile)
    assert.doesNotMatch(source, /dangerouslySetInnerHTML|\.innerHTML\s*=/)
    assert.doesNotMatch(
      source,
      /^import\s+.*(?:markdown|copilot|electron|node:fs)/gim
    )
  })

  it('keeps native controls named, focusable, and collision-safe across instances', () => {
    render(
      <>
        {editor({ file: mergeFile({ id: 'first', path: 'first.ts' }) })}
        {editor({ file: mergeFile({ id: 'second', path: 'second.ts' }) })}
      </>
    )

    const roots = document.querySelectorAll('.ai-merge-editor')
    assert.equal(roots.length, 2)
    const ids = Array.from(
      document.querySelectorAll<HTMLElement>('.ai-merge-editor [id]')
    ).map(element => element.id)
    assert.equal(new Set(ids).size, ids.length)

    for (const label of document.querySelectorAll<HTMLLabelElement>(
      '.ai-merge-editor label[for]'
    )) {
      assert.notEqual(document.getElementById(label.htmlFor), null)
    }
    for (const control of document.querySelectorAll<HTMLElement>(
      '.ai-merge-editor [aria-labelledby], .ai-merge-editor [aria-describedby]'
    )) {
      for (const reference of `${
        control.getAttribute('aria-labelledby') ?? ''
      } ${control.getAttribute('aria-describedby') ?? ''}`
        .trim()
        .split(/\s+/)) {
        if (reference.length > 0) {
          assert.notEqual(
            document.getElementById(reference),
            null,
            `Expected ${reference} to resolve from ${control.tagName}.`
          )
        }
      }
    }

    const controls = document.querySelectorAll<HTMLElement>(
      '.ai-merge-editor textarea, .ai-merge-editor button'
    )
    assert.equal(controls.length, 10)
    for (const control of controls) {
      assert.notEqual(control.getAttribute('tabindex'), '-1')
      control.focus()
      assert.equal(document.activeElement, control)
    }
    assert.equal(
      screen.getAllByRole('region', { name: labels.editor }).length,
      2
    )
  })
})

describe('AI merge editor styles', () => {
  it('keeps the wide panes shrink-safe and long content readable', () => {
    assert.match(styles, /^\.ai-merge-editor\s*\{/m)
    assert.match(styles, /^\.ai-merge-editor\s*\{[\s\S]*?overflow:\s*auto;/m)
    assert.match(
      styles,
      /&__panes\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/
    )
    assert.match(styles, /&__pane\s*\{[\s\S]*?min-width:\s*0;/)
    const panesRule = styles.match(/&__panes\s*\{([\s\S]*?)\n  \}/)?.[1]
    assert.ok(panesRule)
    assert.match(panesRule, /flex:\s*0\s+0\s+auto;/)
    const paneRule = styles.match(/&__pane\s*\{([\s\S]*?)\n  \}/)?.[1]
    assert.ok(paneRule)
    assert.doesNotMatch(paneRule, /overflow:\s*hidden;/)
    assert.match(paneRule, /overflow:\s*visible;/)
    assert.match(
      styles,
      /&__textarea\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*auto;[\s\S]*?white-space:\s*pre;/
    )
    assert.match(
      styles,
      /&__path-value,[\s\S]*?&__summary-reason,[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?word-break:\s*break-word;/
    )
    assert.match(styles, /&__path-value\s*\{[\s\S]*?unicode-bidi:\s*plaintext;/)
    assert.match(styles, /&__action\s*\{[\s\S]*?min-height:\s*44px;/)
    assert.match(styles, /&:focus-visible\s*\{/)
  })

  it('stacks honestly at narrow widths and removes nonessential motion', () => {
    assert.match(styles, /container-type:\s*inline-size;/)
    assert.match(
      styles,
      /@container\s+ai-merge-editor\s*\(max-width:\s*760px\)[\s\S]*?&__panes\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/
    )
    assert.match(
      styles,
      /@media\s*\(max-width:\s*760px\)[\s\S]*?&__textarea\s*\{[\s\S]*?max-height:[^;]+;[\s\S]*?&__action\s*\{[\s\S]*?flex:\s*1\s+1\s+12rem;/
    )
    assert.match(
      styles,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?scroll-behavior:\s*auto;[\s\S]*?animation:\s*none\s*!important;[\s\S]*?transition:\s*none\s*!important;/
    )
  })
})
