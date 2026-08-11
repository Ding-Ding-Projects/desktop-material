import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  IMd3AgentSession,
  formatMd3AgentDetail,
  formatMd3AgentElapsed,
  formatMd3AgentMeta,
  md3AgentSessionMatcher,
} from '../../src/ui/md3/md3-agents-view'
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
      assert.ok(!/\stitle=/.test(source))
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
