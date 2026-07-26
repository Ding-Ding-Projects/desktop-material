import '../lib/logging/renderer/install'

import * as Path from 'path'
import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { QuickActionApp } from './quick-action-app'

if (!process.env.TEST_ENV) {
  /* This is the magic trigger for webpack to go compile
   * our sass into css and inject it into the DOM. */
  require('./styles/quick-action.scss')
}

// Point dugite at the bundled git before anything can call it. The main
// renderer does the same at startup; this window is a separate realm and gets
// none of that setup for free.
process.env['LOCAL_GIT_DIRECTORY'] = Path.resolve(__dirname, 'git')
// Ensure the bundled git's exec path is inferred rather than inherited from a
// git installed on the host.
delete process.env.GIT_EXEC_PATH

document.body.classList.add(`platform-${process.platform}`)

const container = document.createElement('div')
container.id = 'desktop-quick-action-container'
document.body.appendChild(container)

ReactDOM.render(<QuickActionApp />, container)
