import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as path from 'node:path'
import * as React from 'react'
import { compare } from 'compare-versions'
import Confetti from 'react-confetti'
import { renderer } from '../../webpack.common'

describe('updated app dependency compatibility', () => {
  it('loads react-confetti through the React 16 JSX runtime', () => {
    const jsxRuntime = require('react/jsx-runtime') as {
      readonly jsx?: unknown
      readonly jsxs?: unknown
    }

    assert.equal(typeof jsxRuntime.jsx, 'function')
    assert.equal(typeof jsxRuntime.jsxs, 'function')
    assert.equal(
      React.isValidElement(
        React.createElement(Confetti, {
          height: 1,
          numberOfPieces: 0,
          width: 1,
        })
      ),
      true
    )
  })

  it('keeps Webpack ESM resolution pointed at the React 16 JSX runtime file', () => {
    const alias = renderer.resolve?.alias as Record<string, string>
    assert.equal(
      alias['react/jsx-runtime$'],
      path.resolve(__dirname, '../../node_modules/react/jsx-runtime.js')
    )
  })

  it('loads the Node-side Copilot SDK outside the renderer bundle', () => {
    const configuredExternals = renderer.externals as ReadonlyArray<string>
    assert.equal(configuredExternals.includes('@github/copilot-sdk'), true)
  })

  it('keeps the compare-versions 6 API used by the Windows version guards', () => {
    assert.equal(compare('10.0.26100', '10.0.22000', '>='), true)
    assert.equal(compare('10.0.19045', '10.0.22000', '<'), true)
  })
})
