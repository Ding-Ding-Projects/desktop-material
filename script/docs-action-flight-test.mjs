import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'

const source = readFileSync(
  join(
    import.meta.dirname,
    '..',
    'docs',
    'assets',
    'site',
    'docs-action-flight.js'
  ),
  'utf8'
)

function harness() {
  const dom = new JSDOM('<button type="button">Copy</button>', {
    runScripts: 'outside-only',
  })
  dom.window.eval(source)
  return {
    dom,
    button: dom.window.document.querySelector('button'),
    actions: dom.window.DesktopMaterialActionFlight,
  }
}

describe('documentation action single-flight', () => {
  it('blocks a duplicate key until the real promise settles', async () => {
    const { dom, button, actions } = harness()
    let calls = 0
    let finish = () => {}
    const pending = new Promise(resolve => {
      finish = resolve
    })

    const first = actions.run('copy:command', button, function () {
      calls++
      return pending
    })
    const second = actions.run('copy:command', button, function () {
      calls++
      return Promise.resolve()
    })

    assert.equal(calls, 1)
    assert.equal(button.getAttribute('aria-busy'), 'true')
    assert.equal(button.getAttribute('aria-disabled'), 'true')
    assert.equal(await second, undefined)

    finish()
    await first
    assert.equal(button.hasAttribute('aria-busy'), false)
    assert.equal(actions.isActive('copy:command'), false)
    dom.window.close()
  })

  it('releases synchronous controls immediately and keeps keys independent', async () => {
    const { dom, button, actions } = harness()
    let calls = 0

    await actions.run('toggle', button, function () {
      calls++
    })
    await actions.run('toggle', button, function () {
      calls++
    })
    await Promise.all([
      actions.run('one', button, function () {}),
      actions.run('two', button, function () {}),
    ])

    assert.equal(calls, 2)
    assert.equal(actions.isActive('toggle'), false)
    dom.window.close()
  })

  it('releases after rejection and synchronous throw', async () => {
    const { dom, button, actions } = harness()

    await assert.rejects(
      actions.run('reject', button, function () {
        return Promise.reject(new Error('rejected'))
      }),
      /rejected/
    )
    assert.equal(actions.isActive('reject'), false)

    assert.throws(function () {
      actions.run('throw', button, function () {
        throw new Error('thrown')
      })
    }, /thrown/)
    assert.equal(actions.isActive('throw'), false)
    dom.window.close()
  })
})
