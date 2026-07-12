import {
  applyTemplate,
  getTemplateById,
  IGitIgnoreTemplate,
} from '../gitignore'
import { IBuildProfile } from './types'

/**
 * Auto-gitignore integration for Build & Run.
 *
 * A profile can seed a `.gitignore` with (a) the matching curated catalog
 * template and (b) its own build-artifact patterns, both wrapped in the same
 * `dm-template:` managed-section markers the gitignore manager uses. That makes
 * every change idempotent, LF-only, and reversible from the manager's chips.
 *
 * {@link buildIgnoreText} is pure: it returns the new text plus a short
 * human-readable label, or `null` when nothing would change (no save, no log).
 */

/** Synthetic template id for the build-artifacts managed section. */
export const BUILD_ARTIFACTS_TEMPLATE_ID = 'build-artifacts'

function normalize(content: string | null): string {
  return content == null ? '' : content.replace(/\r\n?/g, '\n')
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * Compute the `.gitignore` text for a profile, or `null` when unchanged.
 *
 * The caller owns EOL normalization on save (`formatGitIgnoreContents`), so a
 * file that differs only by line endings is reported as unchanged.
 */
export function buildIgnoreText(
  currentText: string | null,
  profile: IBuildProfile
): { text: string; appliedLabel: string } | null {
  let text = currentText
  const appliedParts: string[] = []

  const template = profile.gitignoreTemplateId
    ? getTemplateById(profile.gitignoreTemplateId)
    : undefined
  if (template) {
    text = applyTemplate(text, template)
    appliedParts.push(`${template.label} template`)
  }

  if (profile.extraIgnores.length > 0) {
    const artifactTemplate: IGitIgnoreTemplate = {
      id: BUILD_ARTIFACTS_TEMPLATE_ID,
      label: 'Build artifacts',
      category: 'build',
      octicon: 'fileDirectory',
      body: profile.extraIgnores.join('\n'),
    }
    text = applyTemplate(text, artifactTemplate)
    appliedParts.push(pluralize(profile.extraIgnores.length, 'artifact rule'))
  }

  if (appliedParts.length === 0) {
    return null
  }

  // `applyTemplate` returns LF-only, reserialized text. If that matches the
  // normalized input, only EOLs (or nothing) changed → treat as a no-op.
  const resolved = text ?? ''
  if (resolved === normalize(currentText)) {
    return null
  }

  return { text: resolved, appliedLabel: appliedParts.join(' + ') }
}
