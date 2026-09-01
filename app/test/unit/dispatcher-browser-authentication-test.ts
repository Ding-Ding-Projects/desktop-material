import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const read = (path: string) =>
  readFile(join(process.cwd(), 'app', 'src', ...path.split('/')), 'utf8')

describe('browser authentication entry-point wiring', () => {
  it('guards every Dispatcher route before state replacement and reports rejection', async () => {
    const source = (await read('ui/dispatcher/dispatcher.ts')).replace(
      /\r\n?/g,
      '\n'
    )
    assert.ok(
      source.includes(
        'singleFlightActions.isActive(BrowserAuthenticationActionKey)'
      )
    )
    assert.ok(
      source.includes(
        "void request.catch(error =>\n      log.error('Browser authentication request failed', error)"
      )
    )

    const browserBased = source.slice(
      source.indexOf('public beginBrowserBasedSignIn('),
      source.indexOf('public requestBrowserAuthentication()')
    )
    assert.ok(
      browserBased.includes('if (this.isBrowserAuthenticationActive())')
    )
    assert.ok(
      browserBased.indexOf('this.isBrowserAuthenticationActive()') <
        browserBased.indexOf('this.appStore._beginDotComSignIn')
    )

    const dotCom = source.slice(
      source.indexOf('public requestBrowserAuthenticationToDotcom('),
      source.indexOf('private isBrowserAuthenticationActive()')
    )
    assert.ok(
      dotCom.indexOf('this.isBrowserAuthenticationActive()') <
        dotCom.indexOf('this.appStore._beginDotComSignIn')
    )
  })

  it('returns the guarded promise from the form, welcome, and dialog paths', async () => {
    const [form, welcome, dialog] = await Promise.all([
      read('ui/lib/sign-in.tsx'),
      read('ui/welcome/start.tsx'),
      read('ui/sign-in/sign-in.tsx'),
    ])
    assert.ok(
      form.includes(
        'return this.props.dispatcher.requestBrowserAuthentication()'
      )
    )
    assert.ok(
      welcome.includes(
        'return this.props.dispatcher.requestBrowserAuthenticationToDotcom()'
      )
    )
    assert.ok(
      dialog.includes(
        'return this.props.dispatcher.requestBrowserAuthentication()'
      )
    )
  })
})
