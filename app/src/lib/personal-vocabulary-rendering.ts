import * as React from 'react'

import { personalizeText } from './i18n'

const PersonalVocabularyAppliedAttribute = 'data-personal-vocabulary-applied'

/**
 * Hand-written inventory of the rendered text boundaries owned by this
 * implementation lane. Keep identifiers exact: a missing row must make the
 * negative inventory test fail rather than disappearing from discovery.
 */
export const PersonalVocabularyBoundaryInventory = [
  'visible-text-children',
  'accessible-name',
  'title-and-tooltip',
  'input-label-and-placeholder',
  'context-menu-label',
  'dialog-header',
  'dropdown-and-overflow',
  'palette-search-result',
  'notification-copy',
  'aria-live-copy',
  'repository-selector',
  'worktree-selector',
  'branch-selector',
  'technical-content-preservation',
  'host-text-properties',
] as const

/** Source/runtime anchor for every inventory row; keep this list hand-written. */
export const PersonalVocabularyBoundaryAnchors = {
  'visible-text-children':
    'app/src/ui/lib/button.tsx:personalizeReactNode(this.props.children)',
  'accessible-name':
    'app/src/ui/lib/button.tsx:const hostTextProps = personalizeHostTextProps',
  'title-and-tooltip':
    'app/src/ui/lib/tooltip.tsx:personalizeReactNode(this.props.children)',
  'input-label-and-placeholder':
    'app/src/ui/lib/text-box.tsx:personalizeOptionalText(this.props.placeholder)',
  'context-menu-label': 'app/src/lib/menu-item.ts:personalizeMenuItems',
  'dialog-header':
    'app/src/ui/dialog/content.tsx:personalizeReactNode(this.props.children)',
  'dropdown-and-overflow':
    'app/src/ui/toolbar/toolbar.tsx:renderOverflowItemContent',
  'palette-search-result':
    'app/src/ui/command-palette/command-palette.tsx:resolvePaletteTitle',
  'notification-copy':
    'app/src/ui/notifications/notification-list-item.tsx:PersonalVocabularyChangedEvent',
  'aria-live-copy':
    'app/src/ui/accessibility/aria-live-container.tsx:personalizeText(this.props.message',
  'repository-selector':
    'app/src/ui/app.tsx:preserveTitleFromPersonalVocabulary',
  'worktree-selector':
    'app/src/ui/toolbar/worktree-dropdown.tsx:preserveTitleFromPersonalVocabulary',
  'branch-selector':
    'app/src/ui/toolbar/branch-dropdown.tsx:preserveTitleFromPersonalVocabulary',
  'technical-content-preservation':
    'app/src/lib/personal-vocabulary-rendering.ts:data-personal-vocabulary-preserve',
  'host-text-properties':
    'app/src/lib/personal-vocabulary-rendering.ts:personalizeHostTextProps',
} as const

export type PersonalVocabularyBoundary =
  typeof PersonalVocabularyBoundaryInventory[number]

/** Fail closed when the hand-written inventory is duplicated or incomplete. */
export function assertPersonalVocabularyBoundaryInventory(
  inventory: ReadonlyArray<string> = PersonalVocabularyBoundaryInventory,
  anchors: Readonly<Record<string, string>> = PersonalVocabularyBoundaryAnchors
): void {
  const expected = new Set<string>(PersonalVocabularyBoundaryInventory)
  const actual = new Set(inventory)
  const anchorKeys = Object.keys(anchors)
  if (
    inventory.length !== expected.size ||
    actual.size !== inventory.length ||
    actual.size !== expected.size ||
    [...expected].some(id => !actual.has(id)) ||
    anchorKeys.length !== expected.size ||
    anchorKeys.some(id => !expected.has(id) || anchors[id].trim().length === 0)
  ) {
    throw new Error('Personal vocabulary boundary inventory is incomplete.')
  }
}

/**
 * Personalize React text at the point where a component is about to render
 * it.
 *
 * This is deliberately a typed React boundary, not a document-wide text
 * replacement. It leaves icon ligatures, code, paths and other explicitly
 * technical content alone, while allowing shared controls to cover their
 * visible labels and child copy consistently.
 */
export function personalizeReactNode(node: React.ReactNode): React.ReactNode {
  if (typeof node === 'string') {
    return personalizeText(node)
  }

  if (node === null || node === undefined || typeof node === 'boolean') {
    return node
  }

  if (typeof node === 'number') {
    return node
  }

  if (Array.isArray(node)) {
    return React.Children.map(node, child => personalizeReactNode(child))
  }

  if (!React.isValidElement(node)) {
    return node
  }

  // Custom components own their children and are responsible for their own
  // typed boundary. Leaving them intact prevents us from touching technical
  // values such as a Ref or an icon ligature before that component can mark
  // its output appropriately.
  if (typeof node.type !== 'string' && node.type !== React.Fragment) {
    return node
  }

  const props = node.props as {
    readonly 'aria-hidden'?: boolean | string
    readonly 'data-personal-vocabulary-preserve'?: boolean
    readonly 'data-personal-vocabulary-applied'?: boolean | string
    readonly children?: React.ReactNode
  }

  // Material Symbols use their name as a ligature, and Ref marks a path,
  // branch, SHA or other technical value. Neither is user-facing copy.
  if (
    props['aria-hidden'] === true ||
    props['aria-hidden'] === 'true' ||
    props['data-personal-vocabulary-preserve'] === true ||
    props[PersonalVocabularyAppliedAttribute] === true ||
    props[PersonalVocabularyAppliedAttribute] === 'true'
  ) {
    return node
  }

  const elementType = typeof node.type === 'string' ? node.type : undefined
  if (
    elementType === 'code' ||
    elementType === 'pre' ||
    elementType === 'kbd'
  ) {
    return node
  }

  if (props.children === undefined) {
    return node
  }

  return React.cloneElement(
    node,
    { [PersonalVocabularyAppliedAttribute]: 'true' },
    personalizeReactNode(props.children)
  )
}

/** Personalize an optional user-facing string prop without touching undefined. */
export function personalizeOptionalText(
  value: string | undefined
): string | undefined {
  return value === undefined ? undefined : personalizeText(value)
}

/**
 * Transform only user-facing host attributes. Structural attributes, values,
 * ids, paths and provider data are intentionally not in this list.
 */
export function personalizeHostTextProps<T extends object>(props: T): T {
  const result = { ...props } as Record<string, unknown>
  for (const key of ['aria-label', 'title', 'placeholder', 'aria-valuetext']) {
    const value = result[key]
    if (typeof value === 'string') {
      result[key] = personalizeText(value)
    }
  }
  return result as T
}
