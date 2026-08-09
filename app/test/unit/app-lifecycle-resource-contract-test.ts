import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const readSource = (path: string) =>
  readFile(join(process.cwd(), 'app', 'src', ...path.split('/')), 'utf8')

describe('App lifecycle resource ownership', () => {
  it('makes IPC subscriptions disposable at their registration boundary', async () => {
    const source = await readSource('lib/ipc-renderer.ts')

    assert.match(
      source,
      /export function on[\s\S]*?ipcRenderer\.on\(channel, listener as any\)[\s\S]*?return new Disposable\(\(\) =>[\s\S]*?ipcRenderer\.removeListener\(channel, listener as any\)/
    )
  })

  it('owns long-lived subscriptions and disposes them on unmount', async () => {
    const source = await readSource('ui/app.tsx')

    assert.match(
      source,
      /private readonly subscriptions = new CompositeDisposable\(\)/
    )
    assert.match(
      source,
      /this\.subscriptions\.add\([\s\S]*?appStore\.onDidUpdate[\s\S]*?appStore\.onDidError/
    )
    assert.match(
      source,
      /this\.subscriptions\.add\([\s\S]*?buildRunStore\.onDidUpdate/
    )
    assert.match(
      source,
      /this\.subscriptions\.add\([\s\S]*?updateStore\.onDidChange/
    )
    assert.match(
      source,
      /this\.subscriptions\.add\(dragAndDropManager\.onDragEnded/
    )
    assert.match(
      source,
      /componentWillUnmount\(\)[\s\S]*?this\.subscriptions\.dispose\(\)/
    )
  })

  it('retains and clears every deferred polling interval', async () => {
    const source = await readSource('ui/app.tsx')

    for (const handle of [
      'reportStatsIntervalHandle',
      'updateCheckIntervalHandle',
    ]) {
      assert.match(
        source,
        new RegExp(`this\\.${handle} = window\\.setInterval`)
      )
      assert.match(
        source,
        new RegExp(
          `componentWillUnmount\\(\\)[\\s\\S]*?window\\.clearInterval\\(this\\.${handle}\\)`
        )
      )
    }

    assert.match(
      source,
      /private async performDeferredLaunchActions\(\) \{\s*if \(!this\.mounted\) \{\s*return/
    )
  })

  it('releases document and window handlers that capture the App instance', async () => {
    const source = await readSource('ui/app.tsx')
    const unmount = source.slice(
      source.indexOf('public componentWillUnmount()'),
      source.indexOf('private async performDeferredLaunchActions()')
    )

    for (const cleanup of [
      "document.removeEventListener('focus', this.onDocumentFocus",
      'document.ondragenter = null',
      'document.ondragleave = null',
      'document.ondragover = null',
      'document.ondrop = null',
      'document.body.ondrop = null',
      "window.removeEventListener('keydown', this.onWindowKeyDown)",
      "window.removeEventListener('keyup', this.onWindowKeyUp)",
    ]) {
      assert.ok(unmount.includes(cleanup), `missing cleanup: ${cleanup}`)
    }

    assert.match(
      source,
      /window\.requestAnimationFrame\(\(\) => \{\s*if \(this\.mounted\) \{\s*this\.syncFeatureAppearanceOwners\(\)/
    )
  })

  it('tears down transient drag resources when the draggable unmounts', async () => {
    const source = await readSource('ui/lib/draggable.tsx')

    assert.match(
      source,
      /public componentWillUnmount\(\)[\s\S]*?this\.disposed = true/
    )
    assert.match(
      source,
      /private cleanupDragListeners\(\): void \{[\s\S]*?document\.removeEventListener\('mousemove', this\.onMouseMove\)[\s\S]*?window\.removeEventListener\('keyup', this\.onKeyUp\)[\s\S]*?mouseScroller\.clearScrollTimer\(\)/
    )
    assert.match(
      source,
      /if \(this\.disposed \|\| !this\.canDragCommit\(event\)\)/
    )
  })

  it('removes the crash renderer error listener and cancels welcome callbacks', async () => {
    const crash = await readSource('crash/crash-app.tsx')
    assert.match(crash, /ipcRenderer\.on\('error', this\.onError\)/)
    assert.match(
      crash,
      /componentWillUnmount\(\)[\s\S]*?ipcRenderer\.removeListener\('error', this\.onError\)/
    )

    const welcome = await readSource('ui/welcome/welcome.tsx')
    assert.match(welcome, /private mounted = false/)
    assert.match(
      welcome,
      /componentWillUnmount\(\)[\s\S]*?window\.clearTimeout\(this\.exitTimer\)/
    )
    assert.match(welcome, /if \(!this\.mounted\) \{\s*return\s*\}/)
  })
})
