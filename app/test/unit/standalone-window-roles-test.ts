import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const materialPath = join(repoRoot, 'app', 'styles', '_material.scss')
const partialPath = join(
  repoRoot,
  'app',
  'styles',
  'material',
  '_standalone-roles.scss'
)

/**
 * The standalone renderers, each with its own bundle.
 *
 * Hand-written rather than discovered. A rule shaped "every window we found
 * uses the shared roles" passes cleanly on a window nobody found, and a fourth
 * standalone renderer added later is exactly the thing that would go unnoticed.
 */
const StandaloneWindows: ReadonlyArray<string> = [
  'app/src/crash/styles/crash.scss',
  'app/src/quick-action/styles/quick-action.scss',
  'app/src/internal-browser/styles/internal-browser.scss',
]

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Custom properties declared inside one `selector {` or `@mixin name {` block. */
function declarationsIn(
  source: string,
  opener: string
): Map<string, string> | null {
  const start = source.indexOf(opener)
  if (start === -1) {
    return null
  }

  const end = source.indexOf('\n}', start)
  const block = source.slice(start, end)
  const found = new Map<string, string>()

  for (const match of block.matchAll(/(--md-sys-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    found.set(match[1], match[2].trim())
  }

  return found
}

function requireBlock(
  source: string,
  opener: string,
  where: string
): Map<string, string> {
  const found = declarationsIn(source, opener)
  assert.notEqual(
    found,
    null,
    `${where} no longer contains "${opener}", so this guard is comparing ` +
      'nothing. Update it rather than deleting it.'
  )
  return found as Map<string, string>
}

describe('standalone window roles', () => {
  it('emits the same role values as the application token layer', () => {
    const material = stripComments(readFileSync(materialPath, 'utf8'))
    const partial = stripComments(readFileSync(partialPath, 'utf8'))

    const cases: ReadonlyArray<[string, string]> = [
      [':root {', '@mixin md-standalone-color-roles-light {'],
      ['body.theme-dark {', '@mixin md-standalone-color-roles-dark {'],
      [
        "body[data-dm-accent='violet'] {",
        '@mixin md-standalone-accent-violet-light {',
      ],
      [
        "body[data-dm-accent='teal'] {",
        '@mixin md-standalone-accent-teal-light {',
      ],
      [
        "body[data-dm-accent='green'] {",
        '@mixin md-standalone-accent-green-light {',
      ],
      [
        "body[data-dm-accent='amber'] {",
        '@mixin md-standalone-accent-amber-light {',
      ],
      [
        "body[data-dm-accent='rose'] {",
        '@mixin md-standalone-accent-rose-light {',
      ],
    ]

    for (const [selector, mixin] of cases) {
      const source = requireBlock(material, selector, '_material.scss')
      const copy = requireBlock(partial, mixin, '_standalone-roles.scss')

      // Only the colour roles are compared: the application's blocks also carry
      // legacy aliases the standalone windows have no use for.
      for (const [role, value] of source) {
        if (!role.startsWith('--md-sys-color-')) {
          continue
        }

        assert.equal(
          copy.get(role),
          value,
          `${role} is "${value}" in ${selector} but "${copy.get(role)}" in ` +
            `${mixin}. The standalone windows would render a different colour ` +
            'under the same role name.'
        )
      }
    }
  })

  it('carries enough roles to be worth comparing', () => {
    const partial = stripComments(readFileSync(partialPath, 'utf8'))
    const light = requireBlock(
      partial,
      '@mixin md-standalone-color-roles-light {',
      '_standalone-roles.scss'
    )

    // Without this the comparison above passes vacuously on an empty mixin.
    assert.ok(
      light.size > 20,
      `the light mixin declares only ${light.size} roles; it has been emptied`
    )
  })

  it('leaves no raw colour in a standalone window stylesheet', () => {
    const offenders: string[] = []

    for (const relative of StandaloneWindows) {
      const source = stripComments(
        readFileSync(join(repoRoot, relative), 'utf8')
      )
      const literals = source.match(/#[0-9a-fA-F]{3,8}\b/g)

      if (literals !== null) {
        offenders.push(`${relative}: ${literals.join(' ')}`)
      }
    }

    assert.deepEqual(
      offenders,
      [],
      'a standalone window declares a colour of its own instead of resolving ' +
        'a Material Design 3 role'
    )
  })
})
