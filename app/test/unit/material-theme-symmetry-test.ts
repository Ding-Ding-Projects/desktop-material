import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'

const materialPath = join(process.cwd(), 'app', 'styles', '_material.scss')

/**
 * Roles that are deliberately declared once and shared by both themes.
 *
 * This list may only shrink, and every entry needs a reason that is about the
 * colour rather than about the effort of adding it. A role sitting here without
 * one is the light value quietly rendering in dark mode, which is exactly the
 * defect this guard exists to catch.
 */
const IntentionallyShared = new Map<string, string>([
  [
    '--md-sys-color-scrim',
    'A scrim is pure black behind a modal surface in both themes; Material ' +
      'Design 3 specifies one value for it rather than a pair.',
  ],
  [
    '--md-sys-color-shadow',
    'Shadow is black in both themes in Material Design 3; the elevation ' +
      'difference between themes comes from the surface tint, not the shadow.',
  ],
])

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** The colour roles declared by one top-level selector block. */
function rolesIn(source: string, selector: string): Map<string, string> {
  const start = source.indexOf(`${selector} {`)
  assert.notEqual(
    start,
    -1,
    `_material.scss no longer has a top-level "${selector}" block, so this ` +
      'guard is asserting nothing. Update it rather than deleting it.'
  )

  const end = source.indexOf('\n}', start)
  const block = source.slice(start, end)
  const roles = new Map<string, string>()

  for (const match of block.matchAll(
    /(--md-sys-color-[a-z0-9-]+)\s*:\s*([^;]+);/g
  )) {
    roles.set(match[1], match[2].trim())
  }

  return roles
}

describe('material theme symmetry', () => {
  it('declares every colour role in both light and dark', () => {
    const source = stripComments(readFileSync(materialPath, 'utf8'))
    const light = rolesIn(source, ':root')
    const dark = rolesIn(source, 'body.theme-dark')

    // A guard that iterates an empty list passes cleanly while proving nothing.
    assert.ok(
      light.size > 20,
      `only ${light.size} light roles were parsed; the parser has drifted`
    )

    const inheritingLight = [...light.keys()]
      .filter(role => !dark.has(role) && !IntentionallyShared.has(role))
      .sort()

    assert.deepEqual(
      inheritingLight,
      [],
      'these roles are declared for light only, so dark mode renders the ' +
        'light value for them'
    )
  })

  it('does not carry a shared-role exemption for a role that has a dark value', () => {
    const source = stripComments(readFileSync(materialPath, 'utf8'))
    const light = rolesIn(source, ':root')
    const dark = rolesIn(source, 'body.theme-dark')

    // A stale exemption is worse than none: it silently excuses a role from the
    // check above for as long as nobody re-reads the list.
    const stale = [...IntentionallyShared.keys()]
      .filter(role => dark.has(role) || !light.has(role))
      .sort()

    assert.deepEqual(
      stale,
      [],
      'these roles are exempted from the light/dark pairing but no longer ' +
        'need to be'
    )
  })
})
