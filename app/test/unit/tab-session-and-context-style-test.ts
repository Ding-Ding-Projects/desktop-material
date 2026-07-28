import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import * as Path from 'node:path'
import { describe, it } from 'node:test'

const app = Path.resolve(__dirname, '../..')

describe('tab session, folder drop, and customization context contracts', () => {
  it('exposes explicit tab-session commands and responsive Material dialogs', async () => {
    const [menu, appSource, styles] = await Promise.all([
      readFile(
        Path.join(app, 'src/main-process/menu/build-default-menu.ts'),
        'utf8'
      ),
      readFile(Path.join(app, 'src/ui/app.tsx'), 'utf8'),
      readFile(
        Path.join(app, 'styles/ui/_repository-list-transfer.scss'),
        'utf8'
      ),
    ])
    assert.match(menu, /Export Current Tabs/)
    assert.match(menu, /Import Current Tabs/)
    assert.match(appSource, /ExportTabSessionDialog/)
    assert.match(appSource, /ImportTabSessionDialog/)
    assert.match(styles, /dialog#export-tab-session/)
    assert.match(styles, /dialog#import-tab-session/)
    assert.match(styles, /max-height: min\(220px, 34vh\)/)
  })

  it('shows a bounded folder-drop target and auto-adds repository folders', async () => {
    const [appSource, shell] = await Promise.all([
      readFile(Path.join(app, 'src/ui/app.tsx'), 'utf8'),
      readFile(Path.join(app, 'styles/_material-shell.scss'), 'utf8'),
    ])
    assert.match(appSource, /webUtils\.getPathForFile/)
    assert.match(appSource, /dispatcher\.addRepositories\(\[path\]\)/)
    assert.match(appSource, /Drop repository folders to open tabs/)
    assert.match(
      shell,
      /\.repository-drop-overlay\s*\{[\s\S]*?position: absolute/
    )
    assert.match(shell, /body\.repository-folder-dragging/)
  })

  it('anchors independently versioned appearance editors to their owners', async () => {
    const [appSource, tabStrip, tab, brand] = await Promise.all([
      readFile(Path.join(app, 'src/ui/app.tsx'), 'utf8'),
      readFile(
        Path.join(app, 'src/ui/repository-tabs/repository-tab-strip.tsx'),
        'utf8'
      ),
      readFile(
        Path.join(app, 'src/ui/repository-tabs/repository-tab.tsx'),
        'utf8'
      ),
      readFile(Path.join(app, 'src/ui/window/app-brand.tsx'), 'utf8'),
    ])
    assert.match(appSource, /onCustomizationContextMenu/)
    assert.match(appSource, /getProfileAppearanceHistorySource/)
    assert.match(appSource, /getRepositoryAppearanceHistorySource/)
    assert.match(appSource, /getFeatureAppearanceHistorySource/)
    assert.match(appSource, /AnchoredAppearanceEditor/)
    assert.match(
      appSource,
      /import \{ PopoverAnchorPosition \} from '\.\/lib\/popover'/
    )
    assert.match(
      appSource,
      /target\.kind === 'repository'[\s\S]*?RepositoryAppearanceElementId\.Toolbar[\s\S]*?target\.kind === 'profile'[\s\S]*?ProfileAppearanceElementId\.Toolbar/
    )
    assert.match(
      appSource,
      /return ownsToolbar[\s\S]*?PopoverAnchorPosition\.BottomLeft[\s\S]*?PopoverAnchorPosition\.RightTop/
    )
    assert.match(
      appSource,
      /anchorPosition=\{this\.getAppearanceEditorAnchorPosition\(target\)\}/
    )
    assert.doesNotMatch(appSource, /RepositorySettingsTab\.Appearance/)
    assert.match(tabStrip, /getTabStyleHistorySource/)
    assert.match(tabStrip, /getTabStyleRepositoryPath/)
    assert.match(tabStrip, /AnchoredAppearanceEditor/)
    assert.match(tab, /data-context-menu-owner="tab-title-appearance"/)
    assert.match(tab, /Customize tab appearance/)
    assert.match(brand, /data-customization-surface="app-identity"/)
  })

  it('routes every appearance-editor pointer gesture through one shared predicate', async () => {
    const [helpers, appSource, tabStrip, tab, list, submoduleBack] =
      await Promise.all([
        readFile(
          Path.join(app, 'src/ui/appearance/anchored-appearance-editor.tsx'),
          'utf8'
        ),
        readFile(Path.join(app, 'src/ui/app.tsx'), 'utf8'),
        readFile(
          Path.join(app, 'src/ui/repository-tabs/repository-tab-strip.tsx'),
          'utf8'
        ),
        readFile(
          Path.join(app, 'src/ui/repository-tabs/repository-tab.tsx'),
          'utf8'
        ),
        readFile(
          Path.join(app, 'src/ui/repositories-list/repositories-list.tsx'),
          'utf8'
        ),
        readFile(
          Path.join(app, 'src/ui/submodules/submodule-back-button.tsx'),
          'utf8'
        ),
      ])

    // The gesture is Shift+Right-click and it is decided in exactly one place,
    // so changing it later is a single edit.
    assert.match(
      helpers,
      /export function isAppearanceEditorPointerGesture\([\s\S]{0,160}?return event\.shiftKey/
    )
    // The shared pointer opener refuses a plain right-click without preventing
    // or stopping it, leaving the surface's ordinary context menu intact.
    assert.match(
      helpers,
      /openAppearanceEditorFromContextMenu[\s\S]{0,320}?if \(!isAppearanceEditorPointerGesture\(event\)\) \{\s*return false/
    )
    // The keyboard route is untouched: Shift+F10 and the ContextMenu key still
    // reach every editor a pointer can.
    assert.match(
      helpers,
      /isAppearanceEditorContextMenuKey[\s\S]{0,200}?event\.key === 'ContextMenu' \|\| \(event\.key === 'F10' && event\.shiftKey\)/
    )
    // Shell-wide owners have no other menu, so a keyboard context-menu request
    // still reaches them; only a real right-click has to hold Shift.
    assert.match(
      helpers,
      /isAppearanceEditorFallbackContextMenu\(event: Event\)[\s\S]{0,240}?event instanceof MouseEvent && event\.button === 2[\s\S]{0,160}?isAppearanceEditorPointerGesture\(event\)/
    )

    // The shell-wide document listener used to swallow every right-click that
    // reached `#desktop-app-contents`; it now answers only the gesture (or the
    // keyboard).
    assert.match(
      appSource,
      /onCustomizationContextMenu = \(event: MouseEvent\) => \{\s*if \([\s\S]{0,160}?!isAppearanceEditorFallbackContextMenu\(event\)/
    )

    // Category (b) surfaces keep their ordinary menu and gain the shortcut.
    assert.match(
      tabStrip,
      /if \(isAppearanceEditorPointerGesture\(event\)\) \{[\s\S]{0,120}?this\.openStyleEditor\(tab, titleAnchor\)/
    )
    assert.match(
      tabStrip,
      /onOverflowContextMenu = \([\s\S]{0,160}?isAppearanceEditorPointerGesture\(event\)/
    )
    assert.match(tabStrip, /showTabCommandMenu\(tab, anchor, titleAnchor\)/)
    assert.match(tabStrip, /label: 'Customize Appearance…'/)
    assert.match(
      list,
      /isAppearanceEditorPointerGesture\(event\)[\s\S]{0,120}?this\.onCustomizeNameAppearance/
    )

    // Category (a) surfaces delegate to the shared opener instead of grabbing
    // the event themselves.
    assert.match(
      tab,
      /onLabelContextMenu = [\s\S]{0,200}?openAppearanceEditorFromContextMenu\(event/
    )
    assert.match(
      submoduleBack,
      /onContextMenu = [\s\S]{0,200}?openAppearanceEditorFromContextMenu\(event/
    )
    assert.match(
      submoduleBack,
      /onKeyDown = [\s\S]{0,160}?isAppearanceEditorContextMenuKey\(event\)/
    )

    // No surface may open-code the gesture; the predicate owns it. app.tsx
    // keeps exactly one unrelated `shiftKey` read — the macOS Shift+F10
    // keyboard bridge — and none inside its customization handler.
    for (const [name, source] of [
      ['repository-tab-strip.tsx', tabStrip],
      ['repository-tab.tsx', tab],
      ['repositories-list.tsx', list],
      ['submodule-back-button.tsx', submoduleBack],
    ] as const) {
      assert.doesNotMatch(
        source,
        /shiftKey/,
        `${name} must ask isAppearanceEditorPointerGesture rather than reading shiftKey directly`
      )
    }
    assert.deepEqual(appSource.match(/shiftKey/g), ['shiftKey'])
    assert.match(appSource, /event\.shiftKey && event\.key === 'F10'/)
  })

  it('advertises the Shift+Right-click gesture in appearance settings, in both languages, at every playfulness level', async () => {
    const [pane, resources, funnyLevels] = await Promise.all([
      readFile(Path.join(app, 'src/ui/preferences/appearance.tsx'), 'utf8'),
      readFile(Path.join(app, 'src/lib/i18n-resources.ts'), 'utf8'),
      readFile(Path.join(app, 'src/lib/funny-level-text.ts'), 'utf8'),
    ])

    assert.match(
      pane,
      /translateWithFunnyLevel\(\s*'appearance\.elementGesture',/
    )
    assert.match(pane, /translate\('appearance\.elementGestureHeading'/)
    // The retired hard-coded English note claimed a plain right-click opened
    // the editor. It must not survive anywhere in the pane.
    assert.doesNotMatch(pane, /right-click that element/)
    assert.match(funnyLevels, /'appearance\.elementGesture'/)

    for (const band of ['plain', 'light', 'playful']) {
      const key = new RegExp(`'appearance\\.elementGesture\\.${band}':`, 'g')
      assert.equal(
        resources.match(key)?.length,
        2,
        `appearance.elementGesture.${band} needs an English and a Cantonese entry`
      )
    }

    // The voice moves with the level; these facts never do.
    for (const [band, english, cantonese] of [
      ['plain', /Shift\+Right-click an element/, /撳住 Shift 再右擊一個元素/],
      ['light', /Shift\+Right-click it/, /撳住 Shift 右擊佢/],
      ['playful', /Hold Shift, right-click anything/, /撳住 Shift 再右擊/],
    ] as const) {
      const entries = resources.split(`'appearance.elementGesture.${band}':`)
      assert.equal(entries.length, 3)
      assert.match(entries[1], english)
      assert.match(entries[1], /Shift\+F10 or the Menu key/)
      assert.match(entries[1], /ordinary menu/)
      assert.match(entries[2], cantonese)
      assert.match(entries[2], /Shift\+F10 或者 Menu 鍵/)
      assert.match(entries[2], /選單/)
    }
  })
})
