import * as React from 'react'

import { personalizeText } from './i18n'

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
] as const

export type PersonalVocabularyBoundary =
  typeof PersonalVocabularyBoundaryInventory[number]

/** Fail closed when the hand-written inventory is duplicated or incomplete. */
export function assertPersonalVocabularyBoundaryInventory(
  inventory: ReadonlyArray<string> = PersonalVocabularyBoundaryInventory
): void {
  const expected = new Set<string>(PersonalVocabularyBoundaryInventory)
  const actual = new Set(inventory)
  if (
    inventory.length !== expected.size ||
    actual.size !== inventory.length ||
    actual.size !== expected.size ||
    [...expected].some(id => !actual.has(id))
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
    readonly children?: React.ReactNode
  }

  // Material Symbols use their name as a ligature, and Ref marks a path,
  // branch, SHA or other technical value. Neither is user-facing copy.
  if (
    props['aria-hidden'] === true ||
    props['aria-hidden'] === 'true' ||
    props['data-personal-vocabulary-preserve'] === true
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
    undefined,
    personalizeReactNode(props.children)
  )
}

/** Personalize an optional user-facing string prop without touching undefined. */
export function personalizeOptionalText(
  value: string | undefined
): string | undefined {
  return value === undefined ? undefined : personalizeText(value)
}
