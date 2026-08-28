import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as FsAsync from 'node:fs/promises'
import * as Path from 'node:path'

/**
 * A lock is deliberately not a security boundary, so the recovery route is not
 * a nice extra — it is the thing that makes locking safe to offer at all. The
 * Support Tickets desk was fully built and completely unreachable: its wiring
 * lived in the shell that was reverted, and nothing replaced it. The palette
 * listed the command with no handler, and the "Forgotten your password?" link
 * reported the desk as unavailable.
 *
 * A rule alone cannot catch that, because a file with no wiring passes a rule
 * about wiring. So this names the exact call sites.
 */

const repoRoot = Path.resolve(__dirname, '..', '..', '..')

async function read(relative: string): Promise<string> {
  const absolute = Path.join(repoRoot, relative)
  try {
    await FsAsync.access(absolute)
  } catch {
    throw new Error(`${relative} does not exist`)
  }
  return FsAsync.readFile(absolute, 'utf8')
}

/** Lines that are real code rather than a comment. */
function codeLines(source: string): ReadonlyArray<string> {
  return source
    .split('\n')
    .map(line => line.trim())
    .filter(line => !line.startsWith('//') && !line.startsWith('*'))
}

describe('the lock recovery desk is reachable', () => {
  it('startup installs the Support Tickets route', async () => {
    const lines = codeLines(await read('app/src/ui/index.tsx'))
    assert.ok(
      lines.some(line => line.startsWith('setMd3LockSupportTicketsRoute(')),
      'index.tsx no longer installs the route, so the "Forgotten your password?" link reports the desk as unavailable'
    )
  })

  it('the app renders the desk for its popup type', async () => {
    const source = await read('app/src/ui/app.tsx')
    assert.ok(
      source.includes('case PopupType.SupportTickets:'),
      'app.tsx has no case for the Support Tickets popup, so nothing renders when it is opened'
    )
    assert.ok(
      source.includes('<Md3SupportTicketsDesk'),
      'app.tsx does not render the desk component'
    )
  })

  it('the palette command has a handler', async () => {
    const source = await read('app/src/ui/app.tsx')
    assert.ok(
      source.includes("case 'palette:support-tickets':"),
      'the palette lists this command; without a case, choosing it does nothing'
    )
  })

  it('the popup type carries the entry point the desk requires', async () => {
    const source = await read('app/src/models/popup.ts')
    assert.ok(source.includes('SupportTickets ='), 'popup type missing')
    assert.ok(
      source.includes('entryPoint: SupportTicketEntryPoint'),
      'the desk names which of the three routes the user arrived by; the popup must carry it'
    )
  })
})
