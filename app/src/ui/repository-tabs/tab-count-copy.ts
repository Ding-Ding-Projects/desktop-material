import { TranslationKey } from '../../lib/i18n'

/** Select the localized member-button form without teaching i18n English rules. */
export function tabGroupMembersButtonKey(count: number): TranslationKey {
  return count === 1
    ? 'tabs.groupMembersButtonOne'
    : 'tabs.groupMembersButtonMany'
}

/** Select the localized member-count form; zero deliberately uses the many form. */
export function tabGroupMembersCountKey(count: number): TranslationKey {
  return count === 1
    ? 'tabs.groupMembersCountOne'
    : 'tabs.groupMembersCountMany'
}

/** Select the expanded/collapsed chip form for its exact member count. */
export function tabGroupChipKey(
  count: number,
  collapsed: boolean
): TranslationKey {
  if (collapsed) {
    return count === 1
      ? 'tabs.groupChipCollapsedOne'
      : 'tabs.groupChipCollapsedMany'
  }
  return count === 1
    ? 'tabs.groupChipExpandedOne'
    : 'tabs.groupChipExpandedMany'
}

/** Select the visible edit-dialog introduction for its exact member count. */
export function tabGroupEditIntroKey(count: number): TranslationKey {
  return count === 1 ? 'tabs.groupEditIntroOne' : 'tabs.groupEditIntroMany'
}

/** Select the overflow button's accessible name for its exact hidden count. */
export function tabOverflowButtonLabelKey(count: number): TranslationKey {
  return count === 1
    ? 'tabs.overflowButtonLabelOne'
    : 'tabs.overflowButtonLabelMany'
}

/** Select the filtered overflow summary from the menu's complete tab count. */
export function tabOverflowFilterCountKey(total: number): TranslationKey {
  return total === 1
    ? 'tabs.overflowFilterCountOne'
    : 'tabs.overflowFilterCountMany'
}

/** Describe how many of a tab collection remain visible after filtering. */
export function formatVisibleTabCount(visible: number, total: number): string {
  return `${visible} of ${total} ${total === 1 ? 'tab' : 'tabs'}`
}

/** Describe the no-close preview with natural singular and plural copy. */
export function formatAllTabsStayOpen(count: number): string {
  return count === 1 ? 'The 1 tab stays open.' : `All ${count} tabs stay open.`
}

/** Describe rows omitted from a bounded tab preview. */
export function formatRemainingTabCount(count: number): string {
  return `And ${count} more ${count === 1 ? 'tab' : 'tabs'}`
}
