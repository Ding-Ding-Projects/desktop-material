import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  Md3SearchField,
  md3SearchPatternError,
} from '../../src/ui/md3/md3-primitives'
import { render, screen } from '../helpers/ui/render'

/**
 * The accessibility contract of the MD3 shell rewrite.
 *
 * Two kinds of assertion live here, deliberately.
 *
 * The rendered half drives the real component, because the defect this file was
 * written for is invisible in source and invisible in a screenshot: a search
 * field whose query cannot be compiled goes on looking exactly like one whose
 * query can, the list quietly stops narrowing, and nothing at all reaches the
 * accessibility tree to say why. Every assertion below queries by accessible
 * name and reads the accessible state, because that is what the person the
 * contract exists for actually perceives.
 *
 * The source half is an inventory rather than a rule. A rule shaped "every
 * search field that renders an error renders it politely" passes cleanly on a
 * field that renders no error at all — it never looked, so it never failed. The
 * inventories here start from a hand-written list and demand the tree match it,
 * so a new surface has to be added on purpose rather than skipped by accident.
 */

const Md3Directory = join(__dirname, '../../src/ui/md3')
const DocsBrowserDirectory = join(__dirname, '../../src/ui/docs-browser')
const StyleDirectory = join(__dirname, '../../styles/ui')

const noop = () => undefined

interface IFieldOverrides {
  readonly value?: string
  readonly regexEnabled?: boolean
  readonly error?: string | null
  readonly invalid?: boolean
  readonly id?: string
  readonly fieldLabel?: string
  readonly placeholder?: string
}

function renderField(overrides: IFieldOverrides = {}) {
  return (
    <Md3SearchField
      id={overrides.id ?? 'md3-test-search'}
      searchSurfaceId="md3-test"
      value={overrides.value ?? ''}
      placeholder={overrides.placeholder ?? 'Filter commits'}
      fieldLabel={overrides.fieldLabel ?? 'commits'}
      regexEnabled={overrides.regexEnabled ?? false}
      error={overrides.error}
      invalid={overrides.invalid}
      onChange={noop}
      onClear={noop}
      onToggleRegex={noop}
      onOpenBuilder={noop}
    />
  )
}

/** The message the input's `aria-describedby` actually points at. */
function describedText(input: HTMLElement): string | null {
  const id = input.getAttribute('aria-describedby')
  if (id === null) {
    return null
  }

  const described = input.ownerDocument.getElementById(id)
  assert.notStrictEqual(
    described,
    null,
    `aria-describedby names "${id}", which is not in the document`
  )
  return described === null ? null : described.textContent ?? ''
}

describe('md3 search field: an unusable query is announced, not swallowed', () => {
  it('says nothing while the query is plain text', () => {
    render(renderField({ value: '(unclosed', regexEnabled: false }))

    const input = screen.getByRole('searchbox', { name: 'Filter commits' })
    assert.strictEqual(input.getAttribute('aria-invalid'), null)
    assert.strictEqual(describedText(input), null)
    assert.strictEqual(screen.queryByRole('status'), null)
  })

  it('says nothing while a regex-mode query compiles', () => {
    render(renderField({ value: '^fix', regexEnabled: true }))

    const input = screen.getByRole('searchbox', { name: 'Filter commits' })
    assert.strictEqual(input.getAttribute('aria-invalid'), null)
    assert.strictEqual(describedText(input), null)
  })

  it('marks the field invalid and describes it when the pattern will not compile', () => {
    render(renderField({ value: '([a', regexEnabled: true }))

    const input = screen.getByRole('searchbox', { name: 'Filter commits' })
    assert.strictEqual(input.getAttribute('aria-invalid'), 'true')

    const message = describedText(input)
    assert.notStrictEqual(
      message,
      null,
      'an invalid pattern must describe the field, not merely flag it'
    )
    assert.match(
      String(message),
      /Nothing is being filtered/,
      'the message must say the list has stopped narrowing, not merely that a string is malformed'
    )
  })

  it('announces the reason politely rather than interrupting the typist', () => {
    render(renderField({ value: '([a', regexEnabled: true }))

    // `role="alert"` is assertive, and this message changes on every keystroke
    // of a pattern being typed — `(`, `([`, `([a` are each their own failure.
    // An assertive region would interrupt a screen reader on all three.
    assert.strictEqual(
      screen.queryByRole('alert'),
      null,
      'a validation message that changes as the user types must not be assertive'
    )

    const polite = screen.getByRole('status')
    assert.match(String(polite.textContent), /Nothing is being filtered/)
  })

  it("prefers the caller's own wording and keeps it polite and described", () => {
    render(
      renderField({
        value: '([a',
        regexEnabled: true,
        error: 'That pattern has an unclosed group.',
      })
    )

    const input = screen.getByRole('searchbox', { name: 'Filter commits' })
    assert.strictEqual(input.getAttribute('aria-invalid'), 'true')
    assert.strictEqual(
      describedText(input),
      'That pattern has an unclosed group.'
    )
    assert.strictEqual(screen.queryByRole('alert'), null)
  })

  it('still reports the state when a caller suppresses the message', () => {
    // `error={null}` means "invalid, and I have said so elsewhere" — the flag
    // must survive even though this field renders no sentence of its own.
    render(renderField({ value: '([a', regexEnabled: true, error: null }))

    const input = screen.getByRole('searchbox', { name: 'Filter commits' })
    assert.strictEqual(input.getAttribute('aria-invalid'), 'true')
    assert.strictEqual(describedText(input), null)
  })

  it('lets a caller whose matcher is not a regular expression opt out', () => {
    render(renderField({ value: '([a', regexEnabled: true, invalid: false }))

    const input = screen.getByRole('searchbox', { name: 'Filter commits' })
    assert.strictEqual(input.getAttribute('aria-invalid'), null)
  })

  it('names each field so six builders on one screen are told apart', () => {
    render(
      <>
        {renderField({
          id: 'a',
          fieldLabel: 'commits',
          placeholder: 'Filter commits',
        })}
        {renderField({
          id: 'b',
          fieldLabel: 'the diff',
          placeholder: 'Filter the diff',
        })}
      </>
    )

    // Every icon-only control in the row is named for its own field, so the
    // accessible names are unique across the screen rather than six identical
    // "Regex builder" buttons a screen-reader user cannot choose between.
    for (const name of [
      'Regex builder for commits',
      'Regex builder for the diff',
      'Regex mode for commits',
      'Regex mode for the diff',
    ]) {
      assert.strictEqual(
        screen.getAllByRole('button', { name }).length,
        1,
        `expected exactly one control named "${name}"`
      )
    }
  })

  it('gives the two fields on one screen distinct description targets', () => {
    render(
      <>
        {renderField({
          id: 'a',
          value: '([a',
          regexEnabled: true,
          fieldLabel: 'commits',
          placeholder: 'Filter commits',
        })}
        {renderField({
          id: 'b',
          value: '([a',
          regexEnabled: true,
          fieldLabel: 'the diff',
          placeholder: 'Filter the diff',
        })}
      </>
    )

    const first = screen.getByRole('searchbox', { name: 'Filter commits' })
    const second = screen.getByRole('searchbox', { name: 'Filter the diff' })
    const firstId = first.getAttribute('aria-describedby')
    const secondId = second.getAttribute('aria-describedby')

    assert.notStrictEqual(firstId, null)
    assert.notStrictEqual(
      firstId,
      secondId,
      'two fields sharing one description id would announce the wrong message'
    )
  })
})

describe('md3 search field: the derivation itself', () => {
  it('is silent for an empty or plain-text query', () => {
    assert.strictEqual(md3SearchPatternError('', true), null)
    assert.strictEqual(md3SearchPatternError('   ', true), null)
    assert.strictEqual(md3SearchPatternError('([a', false), null)
  })

  it('is silent for a pattern the engine accepts', () => {
    assert.strictEqual(md3SearchPatternError('^fix(ed)?$', true), null)
  })

  it('reports the engine’s own complaint for one it does not', () => {
    const message = md3SearchPatternError('([a', true)
    assert.notStrictEqual(message, null)
    assert.match(String(message), /Nothing is being filtered/)
  })

  it('refuses an unbounded pattern rather than handing it to the engine', () => {
    const message = md3SearchPatternError('a'.repeat(2001), true)
    assert.notStrictEqual(message, null)
    assert.match(String(message), /2000/)
  })
})

// ---------------------------------------------------------------------------
// Source inventories
// ---------------------------------------------------------------------------

function componentSources(directory: string): ReadonlyArray<string> {
  return readdirSync(directory)
    .filter(name => name.endsWith('.tsx'))
    .sort()
}

/**
 * Every component file of the rewrite, written out by hand.
 *
 * The list exists so a component added tomorrow fails this file rather than
 * quietly inheriting an audit nobody ran on it. Adding a name here is a
 * deliberate statement that the surface was checked.
 */
const Md3ComponentFiles: ReadonlyArray<string> = [
  'md3-actions-view.tsx',
  'md3-agents-view.tsx',
  'md3-app-header.tsx',
  'md3-authenticator-qr.tsx',
  'md3-authenticator-registration.tsx',
  'md3-authenticator-view.tsx',
  'md3-branches-view.tsx',
  'md3-bulk-bar.tsx',
  'md3-changes-view.tsx',
  'md3-compose-dialog.tsx',
  'md3-destructive-gate.tsx',
  'md3-diff-pane.tsx',
  'md3-history-view.tsx',
  'md3-inbox-view.tsx',
  'md3-lock-removal-gate.tsx',
  'md3-lock-setup-dialog.tsx',
  'md3-lock-unlock-prompt.tsx',
  'md3-locks-view.tsx',
  'md3-menu-overlay.tsx',
  'md3-navigation-drawer.tsx',
  'md3-pane-header.tsx',
  'md3-primitives.tsx',
  'md3-regex-builder-dialog.tsx',
  'md3-repositories-view.tsx',
  'md3-shell.tsx',
  'md3-support-ticket-delete-gate.tsx',
  'md3-support-ticket-entry.tsx',
  'md3-support-tickets-view.tsx',
  'md3-terminal-view.tsx',
  'md3-toast.tsx',
]

const DocsBrowserComponentFiles: ReadonlyArray<string> = [
  'docs-browser-dialog.tsx',
]

/**
 * The files that render a search row, written out by hand for the same reason.
 *
 * A file joining this list has to answer the polite-validation rule below, so
 * the list is what makes a new search surface visible to this test at all.
 */
const SearchFieldCallSites: ReadonlyArray<string> = [
  'docs-browser-dialog.tsx',
  'md3-actions-view.tsx',
  'md3-agents-view.tsx',
  'md3-app-header.tsx',
  'md3-authenticator-view.tsx',
  'md3-branches-view.tsx',
  'md3-changes-view.tsx',
  'md3-diff-pane.tsx',
  'md3-history-view.tsx',
  'md3-inbox-view.tsx',
  'md3-locks-view.tsx',
  'md3-menu-overlay.tsx',
  'md3-repositories-view.tsx',
  'md3-support-tickets-view.tsx',
  'md3-terminal-view.tsx',
]

/**
 * The two search-bearing files that may still carry an assertive region, and
 * exactly why.
 *
 * Both alerts belong to an operation the user started and that then failed —
 * a log the server would not return, a job list that errored — and both carry
 * one stable sentence rather than a message that rewrites itself as somebody
 * types. Neither is search validation. Anything else appearing in a
 * search-bearing file is the defect this rule was written for.
 */
const AssertiveRegionExceptions: ReadonlyMap<string, string> = new Map([
  ['md3-actions-view.tsx', 'the log fetch and the job-list fetch failing'],
  ['md3-support-tickets-view.tsx', 'the ticket form refusing an empty body'],
])

describe('md3 accessibility inventories', () => {
  it('has every component file on the audited list', () => {
    const advice =
      'A component reached the tree without joining this inventory. Read it ' +
      'against the accessibility contract — real controls, accessible names, ' +
      'roles and states, roving focus, polite live regions, reduced motion — ' +
      'and then add its filename here.'

    assert.deepStrictEqual(
      componentSources(Md3Directory),
      Md3ComponentFiles,
      advice
    )
    assert.deepStrictEqual(
      componentSources(DocsBrowserDirectory),
      DocsBrowserComponentFiles,
      advice
    )
  })

  it('has every search surface on the audited list', () => {
    const found: string[] = []
    for (const [directory, names] of [
      [Md3Directory, componentSources(Md3Directory)],
      [DocsBrowserDirectory, componentSources(DocsBrowserDirectory)],
    ] as ReadonlyArray<[string, ReadonlyArray<string>]>) {
      for (const name of names) {
        if (name === 'md3-primitives.tsx') {
          // The primitive defines the row; it does not call it.
          continue
        }
        const source = readFileSync(join(directory, name), 'utf8')
        // The delimiter matters: `Record<Md3SearchFieldKey, …>` contains the
        // component's name as a prefix, and matching on the substring alone
        // reports the shell's search-state map as a rendered search row.
        if (/<Md3SearchField[\s/>]/.test(source)) {
          found.push(name)
        }
      }
    }

    assert.deepStrictEqual(found.sort(), [...SearchFieldCallSites].sort())
  })

  it('keeps search validation polite in every search-bearing file', () => {
    for (const name of SearchFieldCallSites) {
      const directory =
        name === 'docs-browser-dialog.tsx' ? DocsBrowserDirectory : Md3Directory
      const source = readFileSync(join(directory, name), 'utf8')
      const assertive =
        source.includes('role="alert"') || source.includes("role='alert'")

      const reason = AssertiveRegionExceptions.get(name)
      if (reason === undefined) {
        assert.strictEqual(
          assertive,
          false,
          `${name} renders an assertive live region. A search surface's ` +
            'validation message changes on every keystroke, so it must be ' +
            'polite; if this alert is genuinely a failed operation instead, ' +
            'add it to AssertiveRegionExceptions with its reason.'
        )
      } else {
        assert.strictEqual(
          assertive,
          true,
          `${name} is listed as carrying an assertive region for ${reason}, ` +
            'but no longer has one — drop it from the exception list.'
        )
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Reduced motion
// ---------------------------------------------------------------------------

interface IRule {
  readonly selector: string
  readonly property: 'transition' | 'animation'
  readonly value: string
}

interface IStylesheetMotion {
  readonly animated: ReadonlyArray<IRule>
  readonly neutralised: ReadonlySet<string>
}

function stripScssComments(source: string): string {
  let out = ''
  let index = 0

  while (index < source.length) {
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2)
      index = end === -1 ? source.length : end + 2
      continue
    }
    if (source.startsWith('//', index)) {
      const end = source.indexOf('\n', index)
      index = end === -1 ? source.length : end
      continue
    }
    out += source[index]
    index += 1
  }

  return out
}

/**
 * Walk a stylesheet's braces, resolving `&` nesting, and separate the rules
 * that move from the rules that stop them moving.
 *
 * A regular expression cannot do this: a pattern shaped `([^{}]+)\{([^{}]*)\}`
 * skips every rule nested inside an at-block, so it is blind to exactly the
 * `@media (prefers-reduced-motion)` content this test is about.
 */
function readMotion(source: string): IStylesheetMotion {
  const text = stripScssComments(source)
  const animated: IRule[] = []
  const neutralised = new Set<string>()
  const stack: Array<{
    readonly selectors: ReadonlyArray<string>
    readonly reduced: boolean
  }> = []
  let buffer = ''
  let index = 0

  const current = () =>
    stack.length === 0 ? [] : stack[stack.length - 1].selectors
  const inReducedBlock = () => stack.some(frame => frame.reduced)

  const resolve = (parents: ReadonlyArray<string>, selector: string) => {
    if (parents.length === 0) {
      return [selector]
    }
    return parents.map(parent =>
      selector.includes('&')
        ? selector.replace(/&/g, parent)
        : `${parent} ${selector}`
    )
  }

  while (index < text.length) {
    const character = text[index]

    if (character === '{') {
      const head = buffer.trim()
      buffer = ''
      index += 1

      const reduced =
        head.includes('prefers-reduced-motion') || inReducedBlock()
      let selectors: ReadonlyArray<string>

      if (head.startsWith('@')) {
        selectors = current()
      } else {
        const parents = current()
        const parts = head
          .split(',')
          .map(part => part.trim())
          .filter(part => part.length > 0)
        selectors = parts.flatMap(part => resolve(parents, part))
      }

      stack.push({ selectors, reduced })
      continue
    }

    if (character === '}') {
      stack.pop()
      buffer = ''
      index += 1
      continue
    }

    if (character === ';') {
      const declaration = buffer.trim()
      buffer = ''
      index += 1

      const match = /^(transition|animation)\s*:\s*([\s\S]*)$/.exec(declaration)
      if (match === null) {
        continue
      }

      const property = match[1] as 'transition' | 'animation'
      const value = match[2].trim()
      const stopped = /^none\b/.test(value)

      for (const selector of current()) {
        if (inReducedBlock()) {
          if (stopped) {
            neutralised.add(selector)
          }
        } else if (!stopped) {
          animated.push({ selector, property, value })
        }
      }
      continue
    }

    buffer += character
    index += 1
  }

  return { animated, neutralised }
}

function md3Stylesheets(): ReadonlyArray<string> {
  return readdirSync(StyleDirectory)
    .filter(
      name => /^_md3-.*\.scss$/.test(name) || name === '_docs-browser.scss'
    )
    .sort()
}

describe('md3 reduced motion', () => {
  it('stops every animated selector under prefers-reduced-motion', () => {
    const gaps: string[] = []

    for (const name of md3Stylesheets()) {
      const source = readFileSync(join(StyleDirectory, name), 'utf8')
      const { animated, neutralised } = readMotion(source)

      for (const rule of animated) {
        if (!neutralised.has(rule.selector)) {
          gaps.push(`${name}: ${rule.selector} { ${rule.property} }`)
        }
      }
    }

    assert.deepStrictEqual(
      gaps,
      [],
      'these selectors move with no `prefers-reduced-motion` rule turning ' +
        'them off:\n  ' +
        gaps.join('\n  ')
    )
  })

  it('reads nested at-blocks, so the guard is not vacuous', () => {
    // The parser above is the whole assertion, so prove it sees both halves of
    // a stylesheet rather than trusting an empty gap list.
    const { animated, neutralised } = readMotion(`
      .a {
        transition: opacity 120ms ease;

        &:hover {
          animation: pulse 1s;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .a,
        .a:hover {
          animation: none;
          transition: none;
        }
      }
    `)

    assert.deepStrictEqual(
      animated.map(rule => `${rule.selector}|${rule.property}`),
      ['.a|transition', '.a:hover|animation']
    )
    assert.deepStrictEqual(Array.from(neutralised).sort(), ['.a', '.a:hover'])
  })

  it('reports a selector that only some stylesheets remembered to stop', () => {
    const { animated, neutralised } = readMotion(`
      .moves { transition: transform 200ms ease; }
      @media (prefers-reduced-motion: reduce) {
        .other { transition: none; }
      }
    `)

    assert.strictEqual(animated.length, 1)
    assert.strictEqual(neutralised.has('.moves'), false)
  })
})
