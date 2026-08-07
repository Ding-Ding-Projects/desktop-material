import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const readSource = (path: string) =>
  readFile(join(process.cwd(), 'app', 'src', ...path.split('/')), 'utf8')

describe('element appearance runtime wiring', () => {
  it('initializes and flushes element repositories in profile order', async () => {
    const source = await readSource('ui/index.tsx')

    assert.match(
      source,
      /new ElementAppearanceCoordinator\([\s\S]*?profileStore[\s\S]*?\)/
    )
    assert.match(
      source,
      /profileStoreInitialization\.then\(\(\) =>[\s\S]*?elementAppearanceCoordinator\.initialize\(\)[\s\S]*?elementAppearanceCoordinatorInitialization[\s\S]*?repositoryTabsStore\.initialize\(\)/
    )
    assert.match(
      source,
      /name: 'element appearance settings',[\s\S]*?await elementAppearanceCoordinatorInitialization[\s\S]*?await elementAppearanceCoordinator\.flush\(\)/
    )
    assert.match(
      source,
      /let repositoryTabsInitialized = false[\s\S]*?if \(!repositoryTabsInitialized \|\| !elementAppearanceState\.initialized\)[\s\S]*?repositoryTabsStore\.initialize\(\)[\s\S]*?repositoryTabsInitialized = true[\s\S]*?ensureSelectedRepositoryTab\(currentState\)/
    )
    assert.match(
      source,
      /lastEnsuredAppearanceProfileKey !==[\s\S]*?elementAppearanceState\.activeProfileKey[\s\S]*?lastEnsuredRepositoryId = null[\s\S]*?ensureTabForRepository\(repository\)[\s\S]*?lastEnsuredRepositoryId = null/
    )
  })

  it('treats coordinator updates as canonical and rolls failed edits back', async () => {
    const source = await readSource('lib/stores/app-store.ts')

    assert.match(
      source,
      /elementAppearanceCoordinator\?\.onDidUpdate\(state => \{[\s\S]*?scheduledBaseAppearanceCustomization = state\.appearance[\s\S]*?applyScheduledSettingsValue\(this\.scheduledSettingsValue\)/
    )
    assert.match(
      source,
      /applyScheduledSettingsValue[\s\S]*?appearanceCustomization = normalizeAppearanceCustomization[\s\S]*?emitUpdate\(\)/
    )
    assert.match(
      source,
      /getBaseAppearanceAfterUserChange[\s\S]*?return normalizeAppearanceCustomization\(next\)/
    )
    assert.match(
      source,
      /_setAppearanceCustomization[\s\S]*?getBaseAppearanceAfterUserChange\(customization\)[\s\S]*?setAppearanceProjection[\s\S]*?catch \(error\)[\s\S]*?getState\(\)[\s\S]*?scheduledBaseAppearanceCustomization = state\.appearance[\s\S]*?applyScheduledSettingsValue\(this\.scheduledSettingsValue\)[\s\S]*?throw appearanceError/
    )
  })
})
