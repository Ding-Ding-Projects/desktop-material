import * as React from 'react'
import classNames from 'classnames'
import { createObservableRef } from './observable-ref'
import { Tooltip } from './tooltip'
import { TooltipDirection } from './tooltip'

/**
 * The exact ligatures bundled in the Material Symbols Rounded WOFF2 subset.
 * Keep this list in sync with app/styles/fonts/font-assets-manifest.json; the
 * unit contract compares the two so an unbundled glyph cannot slip into UI.
 */
export const MaterialSymbolNames = [
  'accessibility',
  'account_circle',
  'account_tree',
  'add',
  'add_box',
  'add_circle',
  'alt_route',
  'alternate_email',
  'anchor',
  'apps',
  'archive',
  'arrow_back',
  'arrow_downward',
  'arrow_drop_down',
  'arrow_forward',
  'arrow_right',
  'arrow_upward',
  'auto_awesome',
  'autoplay',
  'autorenew',
  'backspace',
  'badge',
  'block',
  'bolt',
  'book_2',
  'book_5',
  'brush',
  'build',
  'build_circle',
  'calendar_month',
  'calendar_today',
  'call_merge',
  'call_split',
  'cancel',
  'category',
  'chat_bubble',
  'check',
  'check_box',
  'check_box_outline_blank',
  'check_circle',
  'checklist',
  'chevron_right',
  'circle',
  'close',
  'cloud',
  'cloud_done',
  'cloud_download',
  'code',
  'code_blocks',
  'commit',
  'construction',
  'content_copy',
  'content_paste',
  'content_paste_go',
  'contrast',
  'crop_square',
  'dark_mode',
  'data_object',
  'database',
  'delete',
  'delete_sweep',
  'deployed_code',
  'description',
  'desktop_windows',
  'devices',
  'difference',
  'disabled_by_default',
  'dns',
  'do_not_disturb_on',
  'done_all',
  'download',
  'drive_file_rename_outline',
  'edit',
  'edit_note',
  'edit_square',
  'error',
  'expand_more',
  'extension',
  'fiber_manual_record',
  'file_copy',
  'filter_alt',
  'filter_alt_off',
  'filter_list',
  'first_page',
  'flag',
  'folder',
  'folder_open',
  'folder_special',
  'folder_zip',
  'fork_right',
  'format_align_center',
  'format_align_left',
  'format_align_right',
  'format_bold',
  'format_italic',
  'format_list_bulleted',
  'format_strikethrough',
  'format_underlined',
  'forum',
  'group',
  'group_add',
  'handyman',
  'help',
  'history',
  'history_toggle_off',
  'home',
  'hourglass_empty',
  'image',
  'inbox',
  'indeterminate_check_box',
  'info',
  'install_desktop',
  'inventory_2',
  'join_inner',
  'key',
  'keyboard_arrow_down',
  'keyboard_arrow_left',
  'keyboard_arrow_right',
  'keyboard_arrow_up',
  'keyboard_double_arrow_down',
  'keyboard_double_arrow_up',
  'keyboard_return',
  'label',
  'last_page',
  'layers',
  'library_add_check',
  'light_mode',
  'lightbulb',
  'link',
  'list',
  'live_help',
  'lock',
  'login',
  'low_priority',
  'manage_history',
  'mark_email_read',
  'mark_email_unread',
  'menu',
  'menu_book',
  'menu_open',
  'merge',
  'merge_type',
  'monitoring',
  'mood',
  'more_horiz',
  'more_vert',
  'notifications',
  'notifications_active',
  'notifications_off',
  'open_in_new',
  'package_2',
  'palette',
  'pause',
  'pause_circle',
  'pending',
  'person',
  'person_add',
  'person_search',
  'play_arrow',
  'play_circle',
  'policy',
  'progress_activity',
  'public',
  'publish',
  'push_pin',
  'rate_review',
  'redo',
  'refresh',
  'remove',
  'repeat',
  'replay',
  'restart_alt',
  'rocket_launch',
  'schedule',
  'school',
  'science',
  'search',
  'search_off',
  'security',
  'sell',
  'send',
  'settings',
  'shield',
  'skip_next',
  'smart_toy',
  'smartphone',
  'sort',
  'space_bar',
  'speed',
  'square',
  'stacks',
  'star',
  'sticky_note_2',
  'stop',
  'subject',
  'swap_horiz',
  'sync',
  'sync_problem',
  'task_alt',
  'terminal',
  'text_fields',
  'text_format',
  'timeline',
  'travel_explore',
  'tune',
  'undo',
  'unfold_less',
  'unfold_more',
  'upload',
  'verified_user',
  'vertical_align_bottom',
  'vertical_split',
  'view_kanban',
  'view_stream',
  'visibility',
  'visibility_off',
  'volume_up',
  'warning',
  'waving_hand',
  'wrap_text',
  'zoom_in',
  'zoom_out',
] as const

export type MaterialSymbolName = typeof MaterialSymbolNames[number]

export interface IMaterialSymbolProps {
  readonly name: MaterialSymbolName
  readonly className?: string
  /** Rendered font size in CSS pixels. Clamped to 8–96. */
  readonly size?: number
  /** Variable font FILL axis. Clamped to 0–1. */
  readonly fill?: number
  /** Variable font weight. Clamped to the bundled 100–700 range. */
  readonly weight?: number
  /** Material Symbols grade axis. The bundled prototype font fixes it at 0. */
  readonly grade?: number
  /** Optical size. Clamped to the bundled 20–48 range. */
  readonly opticalSize?: number

  /**
   * An accessible name for the icon, also shown as a tooltip.
   *
   * An icon with no title is decoration and stays hidden from assistive
   * technology; an icon carrying meaning needs a name, or the only thing a
   * screen reader can announce is the ligature text, which is the glyph's
   * English name rather than what it means here.
   *
   * Mirrors `Octicon`'s prop of the same name so a call site can move between
   * the two without silently losing its accessible name on the way.
   */
  readonly title?: string

  /** Where the tooltip sits. Icons are small, so an explicit side helps. */
  readonly tooltipDirection?: TooltipDirection
}

function clampFinite(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * A decorative Material Symbols Rounded ligature. Accessible names belong to
 * the owning control or adjacent text, so the glyph is always hidden from the
 * accessibility tree.
 */
export function MaterialSymbol(props: IMaterialSymbolProps) {
  const size = clampFinite(props.size, 8, 96, 24)
  const fill = clampFinite(props.fill, 0, 1, 0)
  const weight = clampFinite(props.weight, 100, 700, 400)
  const grade = clampFinite(props.grade, 0, 0, 0)
  const opticalSize = clampFinite(props.opticalSize, 20, 48, 24)

  const { title, tooltipDirection } = props
  const ref = React.useMemo(() => createObservableRef<HTMLSpanElement>(), [])

  return (
    <span
      ref={ref}
      className={classNames('material-symbol', props.className)}
      aria-hidden={title === undefined ? true : undefined}
      aria-label={title}
      style={{
        fontSize: `${size}px`,
        fontVariationSettings: `'FILL' ${fill}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' ${opticalSize}`,
      }}
    >
      {title !== undefined && (
        <Tooltip
          target={ref}
          direction={tooltipDirection ?? TooltipDirection.NORTH}
        >
          {title}
        </Tooltip>
      )}
      {props.name}
    </span>
  )
}
