import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

/**
 * Destination handler WIRING contract.
 *
 * Every handler an MD3 destination takes is optional, and a view draws no
 * control for an action it has no handler for. That is the right behaviour —
 * a menu row that does nothing is worse than an absent one — and it is exactly
 * why a missing handler is invisible. There is no type error, because omitting
 * an optional prop is what optional means. There is no failing view test,
 * because a view test supplies its own handlers. The control simply is not
 * there, and nothing anywhere is looking for it.
 *
 * Two real defects of this shape shipped: Rebase, which the branch row menu
 * never drew because nothing supplied `onRebaseBranch`; and the History bulk
 * bar's Copy SHAs, which returned early on a missing `onCopyText` and so
 * silently copied nothing at all.
 *
 * The assertion therefore runs FROM a hand-written list AT the wiring. A rule
 * alone cannot do this job: a check shaped "every supplied handler is
 * well-formed" passes cleanly on an app that supplies none of them, and a check
 * that derives its own list from the views would have to guess which absences
 * are deliberate. The list is written down so each entry is a decision.
 */

const root = process.cwd()
const md3 = join(root, 'app/src/ui/md3')

/**
 * Handlers that must be supplied by `app.tsx`, a props builder or a controller.
 *
 * Deliberately NOT listed: the row actions the shell's carry-over menu
 * extensions already contribute to `branchRowMenu` — `compareBranch`,
 * `checkoutInNewWorktree`, `mergeAndDelete` and `bulkDeleteBranches`. Each is
 * reachable by that route, and handling it on the view as well would draw the
 * same command twice in one menu. `md3-carryover-reachability-test.ts` is what
 * holds those to account.
 */
interface IWiredHandler {
  /** The destination view that declares the prop. */
  readonly view: string

  readonly handler: string

  /**
   * The file that must actually supply it.
   *
   * Naming the file is what makes this assertion mean anything. A props
   * builder both declares a handler and forwards it, so "is this name
   * anywhere in the wiring?" is satisfied by the builder's own forwarding line
   * even after the app has stopped passing the thing it forwards — the first
   * version of this guard was green through exactly that break.
   */
  readonly suppliedBy: string
}

const MustBeWired: ReadonlyArray<IWiredHandler> = [
  // `buildMd3BranchesProps` forwards this to `appActions`, so the builder
  // carrying the name proves nothing: `App` has to hand the action in.
  {
    view: 'md3-branches-view.tsx',
    handler: 'onRebaseBranch',
    suppliedBy: 'app/src/ui/app.tsx',
  },
  {
    view: 'md3-branches-view.tsx',
    handler: 'onCopyText',
    suppliedBy: 'app/src/ui/md3/md3-view-props.ts',
  },
  {
    view: 'md3-history-view.tsx',
    handler: 'onCopyText',
    suppliedBy: 'app/src/ui/md3/md3-view-props.ts',
  },
  {
    view: 'md3-changes-view.tsx',
    handler: 'onDiscardFiles',
    suppliedBy: 'app/src/ui/md3/md3-view-props.ts',
  },
  {
    view: 'md3-inbox-view.tsx',
    handler: 'onSetMuted',
    suppliedBy: 'app/src/ui/md3/md3-view-props.ts',
  },
]

describe('MD3 destination handler wiring', () => {
  it('declares each listed handler on the view it names', () => {
    // Guards against the list rotting into a set of names nothing checks: a
    // renamed or deleted prop must fail here rather than pass by absence.
    for (const { view, handler } of MustBeWired) {
      const source = readFileSync(join(md3, view), 'utf8')
      assert.ok(
        new RegExp(`readonly ${handler}\\??:`).test(source),
        `${view} no longer declares ${handler} — remove it from the list or ` +
          'restore the prop'
      )
    }
  })

  it('supplies every listed handler from the file that must supply it', () => {
    // Two supply forms and no third: `handler: fn` in an object literal and
    // `handler={fn}` in JSX. A bare `handler =` would also match the handler's
    // own definition, which proves nothing about whether it is handed in.
    const missing = MustBeWired.filter(({ handler, suppliedBy }) => {
      const source = readFileSync(join(root, suppliedBy), 'utf8')
      return !new RegExp(`\\b${handler}\\s*(?::|=\\{)`).test(source)
    }).map(
      ({ view, handler, suppliedBy }) =>
        `${handler} (declared by ${view}, must be supplied by ${suppliedBy})`
    )

    assert.deepEqual(
      missing,
      [],
      'these destination handlers are declared and never supplied, so the ' +
        `control each one drives is absent from the running app:\n  ${missing.join(
          '\n  '
        )}`
    )
  })
})
