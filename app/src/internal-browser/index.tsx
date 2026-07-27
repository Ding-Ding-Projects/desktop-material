import '../lib/logging/renderer/install'

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { InternalBrowserApp } from './internal-browser-app'

if (!process.env.TEST_ENV) {
  require('../../styles/internal-browser.scss')
}

document.body.classList.add(`platform-${process.platform}`)

const container = document.createElement('div')
container.id = 'desktop-internal-browser-container'
document.body.appendChild(container)

ReactDOM.render(<InternalBrowserApp />, container)
