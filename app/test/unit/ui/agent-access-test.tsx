import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import '../../helpers/ui/setup'
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AgentAccess } from '../../../src/ui/preferences/agent-access'

const source = readFileSync(
  join(process.cwd(), 'app', 'src', 'ui', 'preferences', 'agent-access.tsx'),
  'utf8'
)
const styles = readFileSync(
  join(process.cwd(), 'app', 'styles', 'ui', '_agent-access.scss'),
  'utf8'
)

describe('Agent access preferences', () => {
  it('exposes status and read-only connection fields accessibly', () => {
    const markup = renderToStaticMarkup(<AgentAccess />)

    assert.match(markup, /role="status"/)
    assert.match(markup, /aria-live="polite"/)
    assert.match(markup, /role="textbox"/)
    assert.match(markup, /aria-readonly="true"/)
    assert.match(markup, /aria-pressed="false"/)
  })

  it('renders a theme-independent QR quiet zone with an explicit warning mode', () => {
    assert.match(source, /import \{ QRCodeSVG \} from 'qrcode\.react'/)
    assert.match(
      source,
      /<QRCodeSVG[\s\S]*?bgColor="#ffffff"[\s\S]*?fgColor="#000000"[\s\S]*?marginSize=\{4\}/
    )
    assert.match(styles, /\.agent-qr-surface[\s\S]*?background: #ffffff;/)
    assert.match(source, /YOLO LAN mode disables all authentication/)
    assert.match(source, /mode,\s*yoloConfirmed: mode === 'yolo-lan'/)
  })

  it('explains fragment trust, LAN plaintext, and HTTPS gateway behavior', () => {
    assert.match(source, /secret is in the URL fragment/)
    assert.match(source, /mobile page can still read it/)
    assert.match(source, /direct LAN HTTP does not[\s\S]*?encrypt traffic/)
    assert.match(source, /reverse proxy must forward the gateway Host header/)
  })
})
