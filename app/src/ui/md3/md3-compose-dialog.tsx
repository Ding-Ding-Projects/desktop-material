import * as React from 'react'
import classNames from 'classnames'
import { t } from '../../lib/i18n'
import { MaterialSymbol } from '../lib/material-symbol'
import { DialogEmoji } from '../lib/dialog-emoji'
import { createUniqueId, releaseUniqueId } from '../lib/id-pool'
import { Md3GhostButton, Md3IconButton, Md3TonalButton } from './md3-primitives'
import { formatAddDelete } from './md3-style-contract'
import { notify } from './md3-toast'

/**
 * The commit composer, from the `composeOpen` block of
 * `design/History MD3.dc.html`.
 *
 * Every measurement is reproduced in `app/styles/ui/_md3-compose-dialog.scss`.
 * What lives here is the behaviour the contract describes in its logic block:
 *
 *  - the summary field's border is transparent once there is a summary and
 *    `--md-sys-color-error` while there is not;
 *  - the hint beneath the description reads `<n>/50 characters` with a summary
 *    and `A summary is required before committing.` without one;
 *  - both footer buttons take their armed colours from the same condition, and
 *    committing without a summary raises the contract's
 *    `notify('A summary is still required')` rather than doing nothing.
 *
 * That last one matters more than it looks. The contract paints the footer
 * buttons in a disabled-looking surface fill when there is no summary, but
 * they are not disabled — pressing one has to say why nothing happened. A
 * genuinely disabled button gives a keyboard user nothing to press and no
 * explanation, so the buttons stay live, the message is raised, and focus
 * returns to the field that needs filling in. The requirement itself is
 * carried by `aria-invalid` on the field and by the described-by hint, never
 * by the red border alone.
 *
 * Mount this component only while the composer is open; it assumes it is, and
 * takes focus on mount and returns it on unmount.
 */

export interface IMd3ComposeDialogProps {
  /** The commit summary — the contract's `commitSummary`. */
  readonly summary: string

  /** The commit description — the contract's `commitBody`. */
  readonly description: string

  /** How many changed files are included in the commit. */
  readonly includedFileCount: number

  /** How many changed files there are in total. */
  readonly totalFileCount: number

  /**
   * Added lines across the included files, or `null` when nobody has counted
   * them.
   *
   * `git status` reports which files changed and never by how much, so a total
   * across the included files exists only once every one of their diffs has
   * been loaded — which, with one diff loaded at a time, is normally not the
   * case. `null` drops the `+a −d` segment from the context line; passing `0`
   * would tell the user the commit they are about to make changes nothing.
   */
  readonly addedLineCount: number | null

  /** Deleted lines across the included files, or `null` when uncounted. */
  readonly deletedLineCount: number | null

  /** The branch the commit will land on — the contract's `activeBranch`. */
  readonly branchName: string

  readonly onSummaryChanged: (summary: string) => void

  readonly onDescriptionChanged: (description: string) => void

  /** Close without committing: the close button, the scrim, and Escape. */
  readonly onDismissed: () => void

  /** Commit. Only called once there is a non-blank summary. */
  readonly onCommit: () => void

  /** Commit and push. Only called once there is a non-blank summary. */
  readonly onCommitAndPush: () => void

  /**
   * Draft a summary and description. The contract's Copilot button; the
   * drafted text arrives back through `onSummaryChanged` and
   * `onDescriptionChanged` like any other edit.
   */
  readonly onDraftWithCopilot: () => void

  /** Open the co-author editor. */
  readonly onAddCoAuthors: () => void
}

/**
 * Elements that can hold focus inside the panel. Used to wrap Tab and
 * Shift+Tab around the dialog rather than letting either escape into the
 * application behind the scrim.
 */
const FocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Identifies the "a summary is still required" toast so that pressing Commit
 * four times produces one message rather than a stack of four.
 */
const SummaryRequiredToastKey = 'md3.compose.summaryRequired'

/** The contract's soft limit on summary length, reported by the hint. */
const SummaryLengthGuide = 50

function focusableWithin(panel: HTMLElement): ReadonlyArray<HTMLElement> {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(FocusableSelector)
  ).filter(element => element.getClientRects().length > 0)
}

export function Md3ComposeDialog(props: IMd3ComposeDialogProps) {
  const {
    summary,
    description,
    onSummaryChanged,
    onDescriptionChanged,
    onDismissed,
    onCommit,
    onCommitAndPush,
  } = props

  const armed = summary.trim().length > 0

  const titleId = React.useMemo(() => createUniqueId('md3-compose-title'), [])
  const hintId = React.useMemo(() => createUniqueId('md3-compose-hint'), [])

  React.useEffect(() => {
    return () => {
      releaseUniqueId(titleId)
      releaseUniqueId(hintId)
    }
  }, [titleId, hintId])

  const panelRef = React.useRef<HTMLDivElement>(null)
  const summaryRef = React.useRef<HTMLInputElement>(null)

  // Take focus on open and give it back on close. Without the second half a
  // keyboard user is returned to the top of the document every time they close
  // the composer.
  React.useEffect(() => {
    const opener = document.activeElement
    summaryRef.current?.focus()

    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus()
      }
    }
  }, [])

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onDismissed()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const panel = panelRef.current

      if (panel === null) {
        return
      }

      const focusable = focusableWithin(panel)

      if (focusable.length === 0) {
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const inside = panel.contains(active)

      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (!inside || active === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onDismissed]
  )

  const onScrimClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Only the scrim itself dismisses; a click that started on the panel and
      // bubbled up here must not close the dialog out from under the user.
      if (event.target === event.currentTarget) {
        onDismissed()
      }
    },
    [onDismissed]
  )

  const onSummaryChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onSummaryChanged(event.currentTarget.value)
    },
    [onSummaryChanged]
  )

  const onDescriptionChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onDescriptionChanged(event.currentTarget.value)
    },
    [onDescriptionChanged]
  )

  const refuseWithoutSummary = React.useCallback(() => {
    // A short-lived nudge rather than the persistent treatment a warning
    // usually gets: the requirement is already on screen in the hint and on
    // the field, so this only has to catch the eye once.
    notify(t('md3.compose.summaryStillRequired'), {
      kind: 'warning',
      duration: 4000,
      key: SummaryRequiredToastKey,
    })
    summaryRef.current?.focus()
  }, [])

  const onCommitClick = React.useCallback(() => {
    if (!armed) {
      refuseWithoutSummary()
      return
    }

    onCommit()
  }, [armed, refuseWithoutSummary, onCommit])

  const onCommitAndPushClick = React.useCallback(() => {
    if (!armed) {
      refuseWithoutSummary()
      return
    }

    onCommitAndPush()
  }, [armed, refuseWithoutSummary, onCommitAndPush])

  const summaryPlaceholder = t('md3.compose.summaryPlaceholder')
  const descriptionPlaceholder = t('md3.compose.descriptionPlaceholder')

  const context =
    props.addedLineCount === null || props.deletedLineCount === null
      ? t('md3.compose.contextWithoutStats', {
          included: String(props.includedFileCount),
          total: String(props.totalFileCount),
          branch: props.branchName,
        })
      : t('md3.compose.context', {
          included: String(props.includedFileCount),
          total: String(props.totalFileCount),
          stat: formatAddDelete(props.addedLineCount, props.deletedLineCount),
          branch: props.branchName,
        })

  const hint = armed
    ? t('md3.compose.hintCharacters', {
        count: String(summary.length),
        limit: String(SummaryLengthGuide),
      })
    : t('md3.compose.hintRequired')

  const actionHint = armed ? undefined : hintId

  return (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- the
       scrim's click is a pointer shortcut for the close button and Escape,
       both of which are present; it is deliberately not exposed to keyboard or
       assistive technology as a control of its own. */
    <div
      className="md3-compose-dialog-scrim md3-anim-fade--overlay"
      onClick={onScrimClick}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        className="md3-compose-dialog md3-anim-menu"
        role="dialog"
        aria-modal={true}
        aria-labelledby={titleId}
      >
        <div className="md3-compose-dialog__header">
          <MaterialSymbol
            className="md3-compose-dialog__header-icon"
            name="edit"
            size={18}
          />
          <DialogEmoji kind="commit" />
          <span id={titleId} className="md3-compose-dialog__title">
            {t('md3.compose.title')}
          </span>
          <Md3IconButton
            small={true}
            icon="close"
            iconSize={16}
            label={t('md3.compose.close')}
            onClick={onDismissed}
          />
        </div>

        <div className="md3-compose-dialog__context">{context}</div>

        <div className="md3-compose-dialog__summary-row">
          <input
            ref={summaryRef}
            type="text"
            className={classNames('md3-compose-dialog__summary', {
              'md3-compose-dialog__summary--required': !armed,
            })}
            placeholder={summaryPlaceholder}
            aria-label={summaryPlaceholder}
            aria-invalid={!armed}
            aria-describedby={hintId}
            value={summary}
            autoComplete="off"
            onChange={onSummaryChange}
          />
          <Md3TonalButton
            icon="smart_toy"
            label={t('md3.compose.copilot')}
            accessibleName={t('md3.compose.copilotAccessibleName')}
            onClick={props.onDraftWithCopilot}
          />
        </div>

        <div className="md3-compose-dialog__body">
          <textarea
            className="md3-compose-dialog__description"
            placeholder={descriptionPlaceholder}
            aria-label={descriptionPlaceholder}
            value={description}
            onChange={onDescriptionChange}
          />
          <div className="md3-compose-dialog__meta">
            <Md3GhostButton
              icon="group_add"
              label={t('md3.compose.addCoAuthors')}
              onClick={props.onAddCoAuthors}
            />
            <span className="md3-compose-dialog__meta-spacer" />
            <span
              id={hintId}
              className={classNames('md3-compose-dialog__hint', {
                'md3-compose-dialog__hint--required': !armed,
              })}
            >
              {hint}
            </span>
          </div>
        </div>

        <div className="md3-compose-dialog__footer">
          <button
            type="button"
            className={classNames(
              'md3-compose-dialog__action',
              'md3-compose-dialog__action--commit',
              { 'md3-compose-dialog__action--unarmed': !armed }
            )}
            aria-describedby={actionHint}
            onClick={onCommitClick}
          >
            <MaterialSymbol name="commit" size={16} />
            <span>{t('md3.compose.commitOnly')}</span>
          </button>
          <button
            type="button"
            className={classNames(
              'md3-compose-dialog__action',
              'md3-compose-dialog__action--push',
              { 'md3-compose-dialog__action--unarmed': !armed }
            )}
            aria-describedby={actionHint}
            onClick={onCommitAndPushClick}
          >
            <MaterialSymbol name="bolt" size={16} />
            <span>{t('md3.compose.commitAndPush')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
