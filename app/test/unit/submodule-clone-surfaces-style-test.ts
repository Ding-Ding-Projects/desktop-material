import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const read = (...segments: ReadonlyArray<string>) =>
  readFileSync(join(process.cwd(), 'app', ...segments), 'utf8')

describe('submodule clone-surface contracts', () => {
  it('shows a highlighted, non-selecting submodule badge on clone rows', () => {
    const list = read(
      'src',
      'ui',
      'clone-repository',
      'cloneable-repository-filter-list.tsx'
    )

    // The badge is a real button, stops row selection, and is labelled.
    assert.match(
      list,
      /onSubmoduleBadgeClick[\s\S]*?event\.stopPropagation\(\)[\s\S]*?onShowSubmodules/
    )
    assert.match(
      list,
      /className="submodule-badge"[\s\S]*?aria-label=\{label\}/
    )
    // Rows probe lazily as they become visible.
    assert.match(list, /onProbeSubmodules\(repository\)/)

    const style = read('styles', 'ui', '_cloneable-repository-filter-list.scss')
    assert.match(
      style,
      /\.submodule-badge\s*\{[\s\S]*?background: var\(--md-sys-color-tertiary-container\);[\s\S]*?color: var\(--md-sys-color-on-tertiary-container\);/
    )
    assert.match(style, /\.submodule-badge\s*\{[\s\S]*?cursor: pointer;/)
  })

  it('registers both submodule popups and renders them from the app shell', () => {
    const popup = read('src', 'models', 'popup.ts')
    assert.match(popup, /CloneableSubmodules = 'CloneableSubmodules'/)
    assert.match(popup, /SubmoduleManager = 'SubmoduleManager'/)
    assert.match(
      popup,
      /type: PopupType\.CloneableSubmodules[\s\S]*?parentCloneUrl: string[\s\S]*?entries: ReadonlyArray<IGitModulesEntry>/
    )

    const app = read('src', 'ui', 'app.tsx')
    assert.match(
      app,
      /case PopupType\.CloneableSubmodules:[\s\S]*?<CloneableSubmodulesDialog[\s\S]*?onCloneUrl=\{popup\.onCloneUrl \?\? this\.showCloneRepo\}/
    )
    assert.match(
      app,
      /case PopupType\.SubmoduleManager:[\s\S]*?<SubmoduleManagerDialog/
    )
    assert.match(
      app,
      /onShowRepositorySubmodules=\{this\.onShowRepositorySubmodules\}/
    )
  })

  it('clones each pre-clone submodule through a resolved URL only', () => {
    const dialog = read(
      'src',
      'ui',
      'clone-repository',
      'cloneable-submodules-dialog.tsx'
    )

    assert.match(
      dialog,
      /resolveSubmoduleCloneUrl\(this\.props\.parentCloneUrl, entry\.url\)/
    )
    assert.match(dialog, /disabled=\{resolvedUrl === null\}/)
    assert.match(dialog, /'Clone as Repository' : 'Clone as repository'/)
  })

  it('lists the submodule manager on the repo page only when submodules exist', () => {
    const tools = read('src', 'ui', 'repository-tools', 'repository-tools.tsx')

    // The hub entry is gated on a positive count plus an opener callback.
    assert.match(
      tools,
      /getAllHubEntries\(\)[\s\S]*?onOpenSubmoduleManager === undefined \|\|[\s\S]*?submoduleCount === null \|\|[\s\S]*?submoduleCount === 0[\s\S]*?return RepositoryToolsHubEntries/
    )
    assert.match(tools, /id: 'submodule-manager'/)
    assert.match(
      tools,
      /selected === 'submodule-manager' && this\.renderSubmoduleManager\(\)/
    )

    const repositoryView = read('src', 'ui', 'repository.tsx')
    assert.match(
      repositoryView,
      /submoduleCount=\{this\.state\.submoduleCount\}[\s\S]*?onOpenSubmoduleManager=\{this\.onOpenSubmoduleManager\}/
    )
    assert.match(
      repositoryView,
      /type: PopupType\.SubmoduleManager,[\s\S]*?repository: this\.props\.repository,/
    )
  })

  it('lists the subtree manager on the repo page for every git repository', () => {
    const tools = read('src', 'ui', 'repository-tools', 'repository-tools.tsx')

    // The hub entry is shown whenever the opener is wired (any git repo);
    // unlike the submodule gate it is decoupled from any subtree count, since
    // the manager is the only place to add a first subtree.
    assert.match(
      tools,
      /getAllHubEntries\(\)[\s\S]*?const subtreesHidden = onOpenSubtreeManager === undefined/
    )
    assert.match(tools, /id: 'subtree-manager'/)
    assert.match(
      tools,
      /selected === 'subtree-manager' && this\.renderSubtreeManager\(\)/
    )

    const repositoryView = read('src', 'ui', 'repository.tsx')
    assert.match(
      repositoryView,
      /subtreeCount=\{this\.state\.subtreeCount\}[\s\S]*?onOpenSubtreeManager=\{this\.onOpenSubtreeManager\}/
    )
    assert.match(
      repositoryView,
      /type: PopupType\.SubtreeManager,[\s\S]*?repository: this\.props\.repository,/
    )

    const popup = read('src', 'models', 'popup.ts')
    assert.match(popup, /SubtreeManager = 'SubtreeManager'/)
    assert.match(popup, /AddSubtree = 'AddSubtree'/)

    const app = read('src', 'ui', 'app.tsx')
    assert.match(
      app,
      /case PopupType\.SubtreeManager:[\s\S]*?<SubtreeManagerDialog/
    )
    assert.match(app, /case PopupType\.AddSubtree:[\s\S]*?<AddSubtreeDialog/)

    const uiManifest = read('styles', '_ui.scss')
    assert.match(uiManifest, /@import 'ui\/subtree-manager';/)

    const style = read('styles', 'ui', '_subtree-manager.scss')
    assert.match(style, /#subtree-manager\s*\{[\s\S]*?\.subtree-row-editor/)
    assert.match(
      style,
      /dialog\.clone-repository\.add-subtree-dialog\s*\{[\s\S]*?\.add-subtree-review/
    )
  })

  it('lists the cheap LFS panel on the repo page only for GitHub repositories', () => {
    const tools = read('src', 'ui', 'repository-tools', 'repository-tools.tsx')

    // A dedicated hub category and entry, gated prop-driven like the nested
    // repository managers (a positive availability flag rather than a count).
    assert.match(tools, /'Large files & storage'/)
    assert.match(tools, /id: 'cheap-lfs'/)
    assert.match(
      tools,
      /getAllHubEntries\(\)[\s\S]*?cheapLfsHidden = cheapLfs === undefined \|\| cheapLfs\.available !== true[\s\S]*?return RepositoryToolsHubEntries/
    )
    assert.match(tools, /selected === 'cheap-lfs' && this\.renderCheapLfs\(\)/)

    // The repository view supplies the panel wiring only for GitHub repos.
    const repositoryView = read('src', 'ui', 'repository.tsx')
    assert.match(
      repositoryView,
      /cheapLfs=\{\{[\s\S]*?dispatcher: this\.props\.dispatcher,[\s\S]*?available: this\.showsGitHubReleases\(\),/
    )

    // The panel owns a registered, compact-safe style partial.
    const uiManifest = read('styles', '_ui.scss')
    assert.match(uiManifest, /@import 'ui\/cheap-lfs';/)

    const style = read('styles', 'ui', '_cheap-lfs.scss')
    assert.match(style, /\.cheap-lfs \{[\s\S]*?\.cheap-lfs-rows/)
  })

  it('manages cloned and uncloned submodules in place', () => {
    const manager = read('src', 'ui', 'repository-settings', 'submodules.tsx')

    // Summary chips distinguish cloned from not-cloned submodules.
    assert.match(manager, /submodules-summary-cloned[\s\S]*?\{cloned\} cloned/)
    assert.match(
      manager,
      /submodules-summary-uncloned[\s\S]*?\{uncloned\} not cloned/
    )
    // Uninitialized submodules get a Clone action, not Update.
    assert.match(
      manager,
      /submodule\.status === 'uninitialized' \? 'Clone' : 'Update'/
    )

    // The shared styles serve both the settings tab and the standalone
    // manager dialog.
    const settingsStyle = read(
      'styles',
      'ui',
      'dialogs',
      '_repository-settings.scss'
    )
    assert.match(
      settingsStyle,
      /#repository-settings,\s*#submodule-manager\s*\{[\s\S]*?\.submodules-settings/
    )

    const uiManifest = read('styles', '_ui.scss')
    assert.match(uiManifest, /@import 'ui\/cloneable-submodules';/)
  })

  it('opens the per-submodule config dialog from the manager rows', () => {
    const popup = read('src', 'models', 'popup.ts')
    assert.match(popup, /SubmoduleConfig = 'SubmoduleConfig'/)
    assert.match(
      popup,
      /type: PopupType\.SubmoduleConfig[\s\S]*?submodule: IManagedSubmodule/
    )

    // Each manager row offers a Configure action carrying its submodule.
    const manager = read('src', 'ui', 'repository-settings', 'submodules.tsx')
    assert.match(
      manager,
      /type: PopupType\.SubmoduleConfig,[\s\S]*?repository: this\.props\.repository,[\s\S]*?submodule,/
    )
    assert.match(manager, /onClick=\{onConfigure\}[\s\S]*?Configure/)

    const app = read('src', 'ui', 'app.tsx')
    assert.match(
      app,
      /case PopupType\.SubmoduleConfig:[\s\S]*?<SubmoduleConfigDialog[\s\S]*?submodule=\{popup\.submodule\}/
    )

    // The dialog form diffs against its seed and clears keys via the
    // inherit-default sentinel.
    const dialog = read(
      'src',
      'ui',
      'submodules',
      'submodule-config-dialog.tsx'
    )
    assert.match(dialog, /const UseDefault = 'inherit-default'/)
    assert.match(dialog, /value === UseDefault \? null : value/)
    assert.match(dialog, /id="submodule-config"/)

    const uiManifest = read('styles', '_ui.scss')
    assert.match(uiManifest, /@import 'ui\/submodule-config';/)

    const style = read('styles', 'ui', '_submodule-config.scss')
    assert.match(
      style,
      /#submodule-config\s*\{[\s\S]*?\.submodule-config-fields/
    )
  })
})
