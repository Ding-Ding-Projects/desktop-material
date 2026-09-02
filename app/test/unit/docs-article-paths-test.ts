import assert from 'node:assert'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, it } from 'node:test'

/**
 * Every repository path a feature article names must exist.
 *
 * `app/test/unit/docs-browser-bundle-test.ts` proves the offline browser
 * carries every article on disk. It cannot prove an article is *true*: an
 * article whose entire subject was deleted bundles exactly as cleanly as one
 * describing a live feature, so the browser happily shipped a page documenting
 * `app/src/ui/md3/md3-shell.tsx`, a conformance test and a Settings row for
 * months after all three were removed.
 *
 * A dangling source path is the cheapest mechanical signal that an article has
 * outlived its subject. It is not a completeness proof — prose can go stale
 * without naming a file — but it catches the specific failure that actually
 * happened here, and it catches it in the task that removes the file rather
 * than whenever somebody next reads the docs.
 *
 * When a removal is deliberate, the fix is to correct the article, not to add
 * the path to an exception list. There is no exception list on purpose.
 */

const root = process.cwd()
const featuresDirectory = join(root, 'docs', 'features')

/**
 * A repository-relative path to a source file.
 *
 * Anchored on a known top-level directory so ordinary prose containing a dot
 * cannot masquerade as a path, and matched with an explicit extension set so a
 * bare directory reference (`app/src/ui/md3/`) is deliberately not a match —
 * the retirement records name removed modules that way on purpose.
 */
const PathExpression =
  /\b(?:app|script|design|tooling)\/[A-Za-z0-9_.\-/]*\.(?:ts|tsx|scss|mjs|cjs|js|jsx|json|html)\b/g

/** Paths that are not part of the tree and are never expected on disk. */
function isOutsideTheTree(path: string): boolean {
  return path.includes('node_modules/')
}

function articleFiles(directory: string): ReadonlyArray<string> {
  const found = new Array<string>()
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      found.push(...articleFiles(full))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      found.push(full)
    }
  }
  return found
}

const files = articleFiles(featuresDirectory)

describe('feature articles do not name files that were removed', () => {
  it('finds articles to check at all', () => {
    // An empty walk would make every assertion below vacuously true, which is
    // exactly how a guard stops guarding without anybody noticing.
    assert.ok(
      files.length > 20,
      `only ${files.length} articles found under docs/features`
    )
  })

  for (const file of files) {
    const id = relative(root, file).split(sep).join('/')

    it(`${id} names only paths that exist`, () => {
      const body = readFileSync(file, 'utf8')
      const missing = new Set<string>()

      for (const match of body.match(PathExpression) ?? []) {
        if (isOutsideTheTree(match)) {
          continue
        }
        if (!existsSync(join(root, match))) {
          missing.add(match)
        }
      }

      assert.deepStrictEqual(
        [...missing].sort(),
        [],
        `${id} documents ${[...missing]
          .sort()
          .join(
            ', '
          )}, which is not in the tree. Correct the article to describe what exists — do not add an exception.`
      )
    })
  }
})
