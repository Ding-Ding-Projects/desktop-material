import * as React from 'react'

import {
  DialogDecorationKind,
  getShowDialogEmoji,
  resolveDialogDecoration,
  ShowDialogEmojiChangedEvent,
  ShowDialogEmojiKey,
} from '../../lib/dialog-emoji'

/**
 * Subscribe to the persisted "Show emojis in dialogs and message boxes"
 * preference.
 *
 * A dialog which is already open when the setting changes must lose or gain
 * its decoration there and then, rather than at the next launch, so this
 * listens to the in-process change event and to the cross-window `storage`
 * event a second renderer would raise.
 */
export function useShowDialogEmoji(): boolean {
  const [enabled, setEnabled] = React.useState(getShowDialogEmoji)

  React.useEffect(() => {
    const refresh = () => setEnabled(getShowDialogEmoji())

    const onStorage = (event: StorageEvent) => {
      // A null key means the whole store was cleared, which can change this
      // value as surely as writing it does.
      if (event.key === null || event.key === ShowDialogEmojiKey) {
        refresh()
      }
    }

    window.addEventListener(ShowDialogEmojiChangedEvent, refresh)
    window.addEventListener('storage', onStorage)

    // The preference can move between this effect's first render and its
    // subscription landing, so read once more on the way in.
    refresh()

    return () => {
      window.removeEventListener(ShowDialogEmojiChangedEvent, refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return enabled
}

interface IDialogEmojiProps {
  /**
   * The situation this dialog represents. The glyph is resolved from the
   * shared catalog, so a call site never names an emoji.
   */
  readonly kind: DialogDecorationKind | undefined

  /** Extra class for a surface that positions its decoration differently. */
  readonly className?: string
}

/**
 * A dialog's decorative emoji.
 *
 * Renders nothing at all when the preference is off or the caller named no
 * kind, so the surrounding layout collapses rather than reserving an empty
 * slot. The span is always `aria-hidden`, and it must always be placed
 * *outside* the element that `aria-labelledby` points at: an emoji inside the
 * title element becomes part of the dialog's accessible name, which is exactly
 * the regression this component exists to prevent.
 */
export function DialogEmoji(props: IDialogEmojiProps) {
  const enabled = useShowDialogEmoji()
  const decoration = resolveDialogDecoration(props.kind, enabled)

  if (decoration === null) {
    return null
  }

  return (
    <span
      aria-hidden={true}
      role="presentation"
      className={
        props.className === undefined
          ? 'dialog-emoji'
          : `dialog-emoji ${props.className}`
      }
    >
      {decoration}
    </span>
  )
}
