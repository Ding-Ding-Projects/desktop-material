import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const read = (...parts: ReadonlyArray<string>) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8')

const dialog = read('app', 'src', 'ui', 'forks', 'create-fork-dialog.tsx')
const styles = read('app', 'styles', 'ui', 'dialogs', '_create-fork.scss')
const defaultMenu = read(
  'app',
  'src',
  'main-process',
  'menu',
  'build-default-menu.ts'
)
const contextMenu = read(
  'app',
  'src',
  'ui',
  'repositories-list',
  'repository-list-item-context-menu.ts'
)
const menuUpdate = read('app', 'src', 'lib', 'menu-update.ts')
const appStore = read('app', 'src', 'lib', 'stores', 'app-store.ts')

describe('visible fork repository option', () => {
  it('registers the action in the Repository and repository-list menus', () => {
    assert.match(
      defaultMenu,
      /id: 'fork-repository',[\s\S]*?Fork Repository…[\s\S]*?emit\('fork-repository'\)/
    )
    assert.match(
      contextMenu,
      /Fork Repository…[\s\S]*?onForkRepository\?\.\(repository\)[\s\S]*?forkEligibility\.canFork/
    )
  })

  it('uses the shared eligibility gate in menu state and at popup dispatch', () => {
    assert.match(menuUpdate, /canForkRepository\([\s\S]*?state\.accounts/)
    assert.match(
      appStore,
      /getForkRepositoryEligibility\([\s\S]*?if \(!eligibility\.canFork\)[\s\S]*?PopupType\.CreateFork/
    )
  })

  it('shows the source-to-fork route and accurately explains remote changes', () => {
    assert.match(dialog, /className="create-fork-route"/)
    assert.match(dialog, /Source[\s\S]*?Your fork/)
    assert.match(dialog, /<code>origin<\/code>[\s\S]*?<code>upstream<\/code>/)
    assert.doesNotMatch(dialog, /destructive=\{true\}/)
  })

  it('uses Material tokens, expressive motion, and a responsive route', () => {
    assert.match(
      styles,
      /\.create-fork-icon[\s\S]*?primary-container[\s\S]*?dmPop/
    )
    assert.match(
      styles,
      /\.create-fork-route[\s\S]*?grid-template-columns:[\s\S]*?@media \(max-width: 520px\)/
    )
    assert.doesNotMatch(styles, /#[0-9a-fA-F]{3,8}\b/)
  })

  it('distinguishes API failure from a fork created before local conversion failed', () => {
    assert.match(dialog, /createdForkURL/)
    assert.match(dialog, /Your fork was created/)
    assert.match(dialog, /could not connect this local repository/)
  })
})
