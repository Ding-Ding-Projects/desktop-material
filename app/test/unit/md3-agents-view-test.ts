import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  IMd3AgentSession,
  formatMd3AgentDetail,
  formatMd3AgentElapsed,
  formatMd3AgentMeta,
  Md3AgentExportColumns,
  md3AgentSessionDeletable,
  md3AgentSessionExportRecord,
  md3AgentSessionMatcher,
} from '../../src/ui/md3/md3-agents-view'
import { md3PartitionBulk } from '../../src/ui/md3/md3-list-selection'
import { md3DestructiveAction } from '../../src/ui/md3/md3-destructive-actions'
import {
  Md3AgentsFixtureNow,
  md3AgentsFixtureSessions,
} from '../../src/ui/md3/md3-agents-view-fixtures'

/**
 * The Agents destination of the MD3 shell contract.
 *
 * The derived labels are asserted against the shapes the contract's
 * `agentRows` mapping renders, and the stylesheet is read as text so a rule
 * the view depends on cannot be deleted without a failure. Rendering assertions
 * belong with the shell's own harness; these cover the parts that are pure.
 */

const ViewSource = join(
  __dirname,
  '..',
  '..',
  'src',
  'ui',
  'md3',
  'md3-agents-view.tsx'
)
const StyleSheet = join(
  __dirname,
  '..',
  '..',
  'styles',
  'ui',
  '_md3-agents.scss'
)

function session(overrides: Partial<IMd3AgentSession>): IMd3AgentSession {
  return { ...md3AgentsFixtureSessions[0], ...overrides }
}

/**
 * Match a rule for exactly this selector — never one merely containing it.
 * `.md3-agents__turn img` must not satisfy a demand for `.md3-agents__turn`.
 */
function hasRule(source: string, selector: string): boolean {
  const withoutComments = source.replace(/\/\/[^\n]*/g, '')
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}\\s*(?:[,{:]|::)`).test(withoutComments)
}

/**
 * The declarations of exactly this rule, brace-matched rather than regexed.
 *
 * A pattern like `selector\{([^{}]*)\}` stops at the first nested block, so a
 * rule carrying a `&:hover` would report only the declarations above it — and
 * a rule inside `@media` would not be found at all. Scanning with a depth
 * counter reads what is actually there.
 */
function ruleBody(source: string, selector: string): string {
  const withoutComments = source.replace(/\/\/[^\n]*/g, '')
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const opening = new RegExp(`(?:^|[\\s,])${escaped}\\s*\\{`, 'm').exec(
    withoutComments
  )
  assert.ok(opening !== null, `${selector} has no rule to read`)

  let depth = 0
  const start = opening.index + opening[0].length
  for (let index = start; index < withoutComments.length; index++) {
    const character = withoutComments[index]
    if (character === '{') {
      depth++
    } else if (character === '}') {
      if (depth === 0) {
        return withoutComments.slice(start, index)
      }
      depth--
    }
  }
  assert.fail(`${selector} has no closing brace`)
}

describe('Md3AgentsView', () => {
  describe('formatMd3AgentElapsed', () => {
    it('renders the contract seconds-only shape', () => {
      assert.strictEqual(formatMd3AgentElapsed(48_000), '48s')
    })

    it('renders the contract minutes shape with padded seconds', () => {
      assert.strictEqual(formatMd3AgentElapsed(161_000), '2m 41s')
      assert.strictEqual(formatMd3AgentElapsed(125_000), '2m 05s')
    })

    it('rolls over into hours', () => {
      assert.strictEqual(formatMd3AgentElapsed(3_900_000), '1h 05m')
    })

    it('never renders a negative elapsed time', () => {
      assert.strictEqual(formatMd3AgentElapsed(-5_000), '0s')
    })
  })

  describe('formatMd3AgentDetail', () => {
    it('renders the contract detail line', () => {
      assert.strictEqual(
        formatMd3AgentDetail(md3AgentsFixtureSessions[0]),
        'model gpt-5 · 12 turns · 2m 41s · read + stage permissions'
      )
    })

    it('says the model was not reported rather than printing nothing', () => {
      const detail = formatMd3AgentDetail(session({ model: null }))
      assert.ok(detail.startsWith('model not reported · '))
      assert.ok(!detail.includes('undefined'))
      assert.ok(!detail.includes('null'))
    })

    it('drops the turn count entirely when the transcript is unknown', () => {
      const detail = formatMd3AgentDetail(session({ turnCount: null }))
      assert.ok(
        !detail.includes('turns'),
        `an unknown turn count must be left out, not printed: ${detail}`
      )
      assert.ok(!detail.includes('0 turns'))
      assert.ok(!detail.includes('null'))
      assert.strictEqual(
        detail,
        'model gpt-5 · 2m 41s · read + stage permissions'
      )
    })

    it('drops the elapsed part for a run that never started', () => {
      const detail = formatMd3AgentDetail(
        session({ elapsedMs: null, turnCount: 1 })
      )
      assert.strictEqual(
        detail,
        'model gpt-5 · 1 turn · read + stage permissions'
      )
    })
  })

  describe('formatMd3AgentMeta', () => {
    it('names the agent, the branch and when the run started', () => {
      const meta = formatMd3AgentMeta(
        md3AgentsFixtureSessions[0],
        Md3AgentsFixtureNow
      )
      assert.ok(meta.startsWith('Codex CLI · agents/tonal-surfaces · started '))
    })

    it('says so when a session has not started', () => {
      const meta = formatMd3AgentMeta(
        session({ startedAt: null, branch: null }),
        Md3AgentsFixtureNow
      )
      assert.strictEqual(meta, 'Codex CLI · not started')
    })
  })

  describe('md3AgentSessionMatcher', () => {
    it('matches everything on an empty query', () => {
      const matches = md3AgentSessionMatcher('   ', false)
      assert.strictEqual(md3AgentsFixtureSessions.filter(matches).length, 4)
    })

    it('matches the name, the agent, the branch and the path', () => {
      assert.strictEqual(
        md3AgentsFixtureSessions.filter(
          md3AgentSessionMatcher('OPENCODE', false)
        ).length,
        1
      )
      assert.strictEqual(
        md3AgentsFixtureSessions.filter(md3AgentSessionMatcher('flaky', false))
          .length,
        1
      )
    })

    it('reads the query as a regular expression when regex mode is on', () => {
      const matches = md3AgentSessionMatcher('^release-', true)
      const names = md3AgentsFixtureSessions.filter(matches).map(s => s.name)
      assert.deepStrictEqual(names, ['release-notes'])
    })

    it('keeps the list whole while a pattern is still being typed', () => {
      const matches = md3AgentSessionMatcher('(unclosed', true)
      assert.strictEqual(md3AgentsFixtureSessions.filter(matches).length, 4)
    })
  })

  describe('markup contract', () => {
    const source = readFileSync(ViewSource, 'utf8')

    it('reaches every action the contract’s agent menus name', () => {
      for (const command of [
        'resumeAgentSession',
        'pauseAgentSession',
        'openAgentSessionLog',
        'duplicateAgentSession',
        'deleteAgentSession',
        'configureAgentReadAccess',
        'configureAgentCommitAccess',
        'configureAgentPushAccess',
      ]) {
        assert.ok(
          source.includes(`'${command}'`),
          `${command} is unreachable from the Agents view`
        )
      }
    })

    it('gives the session list listbox semantics and a roving tab stop', () => {
      assert.ok(source.includes('role="listbox"'))
      assert.ok(source.includes('role="option"'))
      assert.ok(source.includes('aria-selected={props.isSelected}'))
      assert.ok(source.includes('tabIndex={props.isTabbable ? 0 : -1}'))
    })

    it('announces the transcript politely instead of taking focus', () => {
      assert.ok(source.includes('role="log"'))
      assert.ok(source.includes('aria-live="polite"'))
      assert.ok(!source.includes('.focus()\n          logRef'))
    })

    it('uses no title attribute, which the repository forbids', () => {
      // The destructive gate takes a `title` **prop** — the question it asks,
      // rendered as a heading. That is not the HTML tooltip attribute this
      // rule is about, so it is excluded by name rather than by loosening the
      // pattern into one that would let a real `title=` through.
      const withoutGateProp = source.replace(
        /\stitle=\{t\('md3\.agents\.gate\.title'/g,
        ' '
      )
      assert.ok(!/\stitle=/.test(withoutGateProp))
    })

    it('animates through the shared class, never the raw keyframe', () => {
      assert.ok(source.includes('md3-anim-up'))
      assert.ok(!source.includes('dmUp'))
      assert.ok(!source.includes('md3Up'))
    })
  })

  describe('stylesheet contract', () => {
    const styles = readFileSync(StyleSheet, 'utf8')

    it('declares a rule for every class the view composes', () => {
      for (const selector of [
        '.md3-agents',
        '.md3-agents__list-pane',
        '.md3-agents__list',
        '.md3-agents__row-text',
        '.md3-agents__meta',
        '.md3-agents__state',
        '.md3-agents__badge',
        '.md3-agents__detail-pane',
        '.md3-agents__detail-header',
        '.md3-agents__log',
        '.md3-agents__turn',
        '.md3-agents__turn--user',
        '.md3-agents__turn--agent',
        '.md3-agents__turn--error',
        '.md3-agents__turn--meta',
        '.md3-agents__role',
        '.md3-agents__composer',
        '.md3-agents__input',
      ]) {
        assert.ok(hasRule(styles, selector), `${selector} has no rule`)
      }
    })

    it('keeps the contract’s measurements', () => {
      assert.ok(styles.includes('width: 320px'))
      assert.ok(styles.includes('height: 42px'))
      assert.ok(styles.includes('max-width: 720px'))
      assert.ok(styles.includes('padding: 10px 12px'))
      assert.ok(styles.includes('height: 34px'))
      assert.ok(styles.includes('letter-spacing: 0.06em'))
      assert.ok(styles.includes('font-size: 10.5px'))
    })

    it('shrinks the badges before the session name, never the other way', () => {
      const badges = ruleBody(styles, '.md3-agents__badges')
      assert.ok(
        /flex:\s*0\s+1\s+auto/.test(badges),
        'held at flex: none the badges take their width out of the name'
      )
      assert.ok(/min-width:\s*0/.test(badges))
      assert.ok(/overflow:\s*hidden/.test(badges))

      // The row's own text column must still be allowed to ellipse.
      assert.ok(
        /min-width:\s*0/.test(ruleBody(styles, '.md3-agents__row-text'))
      )

      // …and the status pill must never be the thing that gets cut down.
      assert.ok(/flex:\s*none/.test(ruleBody(styles, '.md3-agents__state')))
    })

    it('reads shared tokens rather than hard-coding a colour', () => {
      assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(styles))
    })

    it('is imported by the stylesheet entry point', () => {
      const entry = readFileSync(
        join(__dirname, '..', '..', 'styles', '_ui.scss'),
        'utf8'
      )
      assert.ok(entry.includes("@import 'ui/md3-agents';"))
    })
  })
})

/**
 * The Agents destination's bulk wiring.
 *
 * The selection algebra, the export serializer and the bar itself are proven
 * in their own suites; nothing here retests them. What is tested here is the
 * wiring only this view can get wrong — the visible-id list reaching past the
 * search field, the `filtered` flag lying about it, a partition that claims to
 * exclude something it does not, a destructive verb that skips the gate, and
 * an export record that quietly drops a declared column.
 */
describe('agents bulk actions', () => {
  const source = readFileSync(ViewSource, 'utf8')

  it('takes the bulk scope from the searched list, not the whole fleet', () => {
    const matcher = md3AgentSessionMatcher('tonal', false)
    const visible = md3AgentsFixtureSessions.filter(matcher)

    assert.ok(visible.length > 0, 'the fixture must have something to match')
    assert.ok(
      visible.length < md3AgentsFixtureSessions.length,
      'a query that matches everything proves nothing about the filter'
    )
    for (const candidate of visible) {
      assert.ok(matcher(candidate))
    }

    // The bar is handed the searched ids, so a select-all can never reach a
    // session the query is hiding.
    assert.match(
      source,
      /visibleIds\s*=\s*React\.useMemo\(\s*\(\)\s*=>\s*visible\.map/
    )
    assert.ok(source.includes('visibleIds={visibleIds}'))
  })

  it('reports itself filtered exactly when the query narrows the list', () => {
    assert.ok(
      source.includes('const filtersActive = query.trim().length > 0'),
      'filtered must be derived from the live query, never hard-coded'
    )
    assert.ok(source.includes('filtered={filtersActive}'))
  })

  it('excludes the sessions it says it excludes from a bulk delete', () => {
    const partition = md3PartitionBulk(
      md3AgentsFixtureSessions,
      md3AgentSessionDeletable,
      'protected'
    )

    assert.ok(
      partition.excluded.length > 0,
      'the fixture must have a protected row'
    )
    assert.strictEqual(partition.reason, 'protected')
    for (const excluded of partition.excluded) {
      assert.ok(
        excluded.isMainWorktree || excluded.isLocked || excluded.isMissing,
        `${excluded.name} was excluded without a stated reason`
      )
    }
    for (const applied of partition.applied) {
      assert.ok(
        !applied.isMainWorktree && !applied.isLocked && !applied.isMissing
      )
    }
    assert.strictEqual(
      partition.applied.length + partition.excluded.length,
      md3AgentsFixtureSessions.length,
      'the preview and the work must describe the same set'
    )
  })

  it('routes the bulk delete through the shared destructive gate', () => {
    const action = md3DestructiveAction('agents-bulk-delete')
    assert.strictEqual(action.module, 'app/src/ui/md3/md3-agents-view.tsx')
    assert.strictEqual(action.host, 'overlay')

    assert.ok(source.includes('actionId="agents-bulk-delete"'))
    assert.ok(source.includes('<Md3DestructiveGate'))
    // The verb opens the gate rather than deleting; the confirm handler is the
    // only caller of onDeleteSession in the bulk path.
    assert.ok(source.includes('onClick: onRequestBulkDelete'))
    assert.ok(source.includes('destructive: true'))
    assert.ok(source.includes("hasPopup: 'dialog'"))
    assert.match(
      source,
      /onConfirmBulkDelete[\s\S]{0,400}onDeleteSession\(session\.id\)/,
      'the delete must only run from the gate’s confirm handler'
    )
  })

  it('exports every declared column, and no undeclared one', () => {
    for (const candidate of md3AgentsFixtureSessions) {
      const record = md3AgentSessionExportRecord(candidate)
      for (const column of Md3AgentExportColumns) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(record, column.name),
          `the export record is missing the declared column ${column.name}`
        )
      }
      assert.deepStrictEqual(
        Object.keys(record).sort(),
        Md3AgentExportColumns.map(column => column.name).sort(),
        'an undeclared field lands in the file with no schema entry naming it'
      )
    }
  })

  it('writes an absent count as empty rather than as a zero', () => {
    const never = md3AgentSessionExportRecord(
      session({
        turnCount: null,
        elapsedMs: null,
        startedAt: null,
        branch: null,
      })
    )
    assert.strictEqual(never.turnCount, '')
    assert.strictEqual(never.elapsedMs, '')
    assert.strictEqual(never.startedAt, '')
    assert.strictEqual(never.branch, '')

    const ran = md3AgentSessionExportRecord(
      session({ turnCount: 0, elapsedMs: 0, startedAt: 0 })
    )
    assert.strictEqual(ran.turnCount, 0)
    assert.strictEqual(ran.elapsedMs, 0)
    assert.strictEqual(ran.startedAt, '1970-01-01T00:00:00.000Z')
  })

  it('declares the one field that can carry line breaks as multiline', () => {
    const multiline = Md3AgentExportColumns.filter(
      column => column.multiline === true
    ).map(column => column.name)
    assert.deepStrictEqual(multiline, ['errorMessage'])
  })
})
