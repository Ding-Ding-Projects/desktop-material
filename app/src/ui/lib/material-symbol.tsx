import * as React from 'react'
import classNames from 'classnames'

/**
 * The exact ligatures bundled in the Material Symbols Rounded WOFF2 subset.
 * Keep this list in sync with app/styles/fonts/font-assets-manifest.json; the
 * unit contract compares the two so an unbundled glyph cannot slip into UI.
 */
export const MaterialSymbolNames = [
  'account_circle',
  'account_tree',
  'add',
  'add_circle',
  'alt_route',
  'alternate_email',
  'anchor',
  'arrow_downward',
  'arrow_upward',
  'auto_awesome',
  'autoplay',
  'autorenew',
  'backspace',
  'badge',
  'block',
  'bolt',
  'book_2',
  'build',
  'build_circle',
  'calendar_month',
  'call_merge',
  'call_split',
  'cancel',
  'category',
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
  'difference',
  'dns',
  'do_not_disturb_on',
  'done_all',
  'edit',
  'edit_note',
  'edit_square',
  'error',
  'expand_more',
  'extension',
  'filter_list',
  'first_page',
  'flag',
  'folder',
  'folder_open',
  'fork_right',
  'format_align_center',
  'format_align_left',
  'format_align_right',
  'format_bold',
  'format_italic',
  'format_underlined',
  'group_add',
  'handyman',
  'help',
  'history',
  'history_toggle_off',
  'inbox',
  'indeterminate_check_box',
  'inventory_2',
  'join_inner',
  'key',
  'keyboard_arrow_down',
  'keyboard_return',
  'label',
  'last_page',
  'library_add_check',
  'light_mode',
  'list',
  'live_help',
  'lock',
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
  'more_vert',
  'notifications',
  'notifications_off',
  'open_in_new',
  'package_2',
  'palette',
  'pause',
  'pause_circle',
  'person',
  'person_add',
  'person_search',
  'play_arrow',
  'play_circle',
  'progress_activity',
  'public',
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
  'search',
  'search_off',
  'security',
  'sell',
  'send',
  'settings',
  'shield',
  'smart_toy',
  'sort',
  'space_bar',
  'stacks',
  'star',
  'subject',
  'swap_horiz',
  'sync',
  'sync_problem',
  'task_alt',
  'terminal',
  'text_fields',
  'text_format',
  'tune',
  'undo',
  'unfold_more',
  'vertical_split',
  'view_stream',
  'visibility',
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

  return (
    <span
      className={classNames('material-symbol', props.className)}
      aria-hidden={true}
      style={{
        fontSize: `${size}px`,
        fontVariationSettings: `'FILL' ${fill}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' ${opticalSize}`,
      }}
    >
      {props.name}
    </span>
  )
}
