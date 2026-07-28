import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const readSource = (path: string) =>
  readFile(join(process.cwd(), 'app', 'src', ...path.split('/')), 'utf8')

/**
 * Slice a method body out of a source file so a contract can be asserted
 * against that method alone rather than the whole 20k-line store.
 */
function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  assert.notStrictEqual(start, -1, `could not find '${signature}' in source`)

  let depth = 0
  let seenBrace = false
  for (let i = start; i < source.length; i++) {
    const character = source[i]
    if (character === '{') {
      depth += 1
      seenBrace = true
    } else if (character === '}') {
      depth -= 1
      if (seenBrace && depth === 0) {
        return source.slice(start, i + 1)
      }
    }
  }

  assert.fail(`could not find the end of '${signature}'`)
}

describe('startup does not block the shell on optional work', () => {
  it('adopts the cached editor choice instead of awaiting an availability scan', async () => {
    const source = await readSource('lib/stores/app-store.ts')
    const body = methodBody(source, 'public async loadInitialState()')

    assert.match(
      body,
      /this\.selectedExternalEditor = localStorage\.getItem\(externalEditorKey\)/,
      'the shell must paint from the persisted choice rather than a filesystem scan'
    )
    assert.doesNotMatch(
      body,
      /await this\.lookupSelectedExternalEditor\(\)/,
      'enumerating installed editors must not gate the first paint'
    )
    assert.doesNotMatch(
      body,
      /await this\.batchCloneStore\.initialize\(\)/,
      'clone-queue recovery must not gate the first paint'
    )
  })

  it('hands the remaining startup work to a deferred phase it does not await', async () => {
    const source = await readSource('lib/stores/app-store.ts')
    const body = methodBody(source, 'public async loadInitialState()')

    assert.match(body, /void this\.loadDeferredInitialState\(\)/)
    assert.doesNotMatch(
      body,
      /await this\.loadDeferredInitialState\(\)/,
      'awaiting the deferred phase would put the blocking gate straight back'
    )
  })

  it('isolates each deferred step so one failure cannot cancel the rest', async () => {
    const source = await readSource('lib/stores/app-store.ts')
    const body = methodBody(source, 'private async loadDeferredInitialState()')

    assert.match(
      body,
      /runDeferredStartupStep\([\s\S]*?externalEditorAvailability/
    )
    assert.match(body, /runDeferredStartupStep\([\s\S]*?cloneQueueRecovery/)
  })

  it('reports a deferred failure instead of swallowing it', async () => {
    const source = await readSource('lib/stores/app-store.ts')
    const body = methodBody(source, 'private async runDeferredStartupStep(')

    assert.match(body, /log\.error\(/)
    assert.match(body, /sendNonFatalException\('deferredStartup', error\)/)
  })

  it('never delays deferred startup work to make it look progressive', async () => {
    const source = await readSource('lib/stores/app-store.ts')
    const bodies = [
      methodBody(source, 'private async loadDeferredInitialState()'),
      methodBody(source, 'private async runDeferredStartupStep('),
      methodBody(
        source,
        'private async confirmSelectedExternalEditorIsInstalled()'
      ),
      methodBody(source, 'private async recoverInterruptedCloneQueue()'),
    ]

    for (const body of bodies) {
      assert.doesNotMatch(body, /setTimeout|setInterval|sleep\(/)
    }
  })

  it('drops a stale editor scan rather than overwriting the user’s choice', async () => {
    const source = await readSource('lib/stores/app-store.ts')
    const body = methodBody(
      source,
      'private async confirmSelectedExternalEditorIsInstalled()'
    )

    assert.match(
      body,
      /const generation = this\.externalEditorSelectionGeneration[\s\S]*?await this\.lookupSelectedExternalEditor\(\)[\s\S]*?if \(generation !== this\.externalEditorSelectionGeneration\) \{[\s\S]*?return/,
      'the scan must compare the generation it captured before awaiting'
    )
  })

  it('bumps the generation whenever the selected editor changes', async () => {
    const source = await readSource('lib/stores/app-store.ts')
    const body = methodBody(source, 'private updateSelectedExternalEditor(')

    assert.match(body, /this\.externalEditorSelectionGeneration \+= 1/)
  })
})

describe('heavy repository sections load lazily', () => {
  const sections = [
    './actions',
    './github-packages',
    './github-issues',
    './github-api-explorer',
    './repository-tools',
    './repository-tools/provider-triage',
  ]

  it('imports every heavy section for its types only', async () => {
    const source = await readSource('ui/repository.tsx')

    for (const section of sections) {
      const pattern = new RegExp(
        `import type \\{[^}]*\\} from '${section.replace(/\//g, '\\/')}'`
      )
      assert.match(
        source,
        pattern,
        `${section} must be imported for types only so it is not evaluated at startup`
      )
    }
  })

  it('evaluates every heavy section through a deferred module', async () => {
    const source = await readSource('ui/repository.tsx')

    for (const section of sections) {
      const pattern = new RegExp(
        `import\\(\\s*\\/\\* webpackMode: "eager" \\*\\/\\s*'${section.replace(
          /\//g,
          '\\/'
        )}'`
      )
      assert.match(source, pattern, `${section} must be loaded via import()`)
    }
  })

  it('keeps Changes and History statically imported', async () => {
    const source = await readSource('ui/repository.tsx')

    // These are what the app opens on. Deferring them would trade one blocking
    // screen for another, so they stay eager on purpose.
    assert.match(
      source,
      /^import \{ Changes, ChangesSidebar \} from '\.\/changes'$/m
    )
    assert.match(
      source,
      /^import \{ SelectedCommits, CompareSidebar \} from '\.\/history'$/m
    )
  })

  it('routes every deferred section failure to a non-blocking notification', async () => {
    const source = await readSource('ui/repository.tsx')

    const handlers = source.match(
      /onLoadFailed=\{this\.onLazyViewLoadFailed\}/g
    )
    assert.strictEqual(
      handlers?.length,
      7,
      'every deferred section must report a load failure'
    )

    const handler = methodBody(source, 'private onLazyViewLoadFailed = (')
    assert.match(
      handler,
      /dispatcher\.postNotification\(\{[\s\S]*?lazyView\.notificationTitle/,
      'a failed section informs rather than asking for a decision, so it is a notification'
    )
    assert.doesNotMatch(
      handler,
      /showPopup|Dialog/,
      'a failed section must never be escalated to a modal'
    )
  })
})

describe('repository counts cannot be clobbered by an out-of-order response', () => {
  it('gates both counts on a monotonic token', async () => {
    const source = await readSource('ui/repository.tsx')

    assert.match(
      source,
      /private readonly submoduleCountGate = new LatestLoadGate\(\)/
    )
    assert.match(
      source,
      /private readonly subtreeCountGate = new LatestLoadGate\(\)/
    )
    assert.match(source, /gate\.accept\(token\)/)
  })

  it('records why a count is unknown instead of discarding the reason', async () => {
    const source = await readSource('ui/repository.tsx')

    assert.match(
      source,
      /catch \(e\) \{[\s\S]*?log\.warn\([\s\S]*?Could not count submodules/
    )
    assert.match(
      source,
      /catch \(e\) \{[\s\S]*?log\.warn\([\s\S]*?Could not count subtrees/
    )
    assert.doesNotMatch(
      source,
      /\} catch \{\s*\n\s*if \(\s*\n?\s*!this\.repositoryViewUnmounted/,
      'the bare catch that threw the failure away must not come back'
    )
  })
})
