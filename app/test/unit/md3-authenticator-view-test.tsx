import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { decodeBase32 } from '../../src/lib/authenticator/base32'
import { totp } from '../../src/lib/authenticator/totp'
import { encodeQr } from '../../src/lib/authenticator/qr-encode'
import { decodeQrMatrix } from '../../src/lib/authenticator/qr-decode'
import { Md3AuthenticatorView } from '../../src/ui/md3/md3-authenticator-view'
import {
  IMd3RegistrationResult,
  Md3AuthenticatorRegistration,
} from '../../src/ui/md3/md3-authenticator-registration'
import { Md3AuthenticatorQr } from '../../src/ui/md3/md3-authenticator-qr'
import {
  md3AuthenticatorFixtureFactors,
  md3AuthenticatorFixtureGroups,
  md3AuthenticatorFixtureSecrets,
} from '../../src/ui/md3/md3-authenticator-fixtures'
import { md3Toasts } from '../../src/ui/md3/md3-toast'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../helpers/ui/render'

/**
 * The Authenticator surface, rendered.
 *
 * A unit test over the pure helpers proves the filtering and the digits; it
 * proves nothing about whether the row that shows them is reachable, named, or
 * announces a new code without reading a countdown at somebody every second.
 * Those are the assertions here.
 */

/** The RFC 6238 SHA-1 key, which the fixtures also use. */
const Sha1Key = decodeBase32('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')

/** A pinned instant, so every expected code below is a fixed string. */
const PinnedSeconds = 1_700_000_045

const noop = () => {}

function renderView(
  overrides: Partial<React.ComponentProps<typeof Md3AuthenticatorView>> = {}
) {
  return render(
    <Md3AuthenticatorView
      factors={md3AuthenticatorFixtureFactors}
      secrets={md3AuthenticatorFixtureSecrets}
      groups={md3AuthenticatorFixtureGroups}
      clock={null}
      onRegister={noop}
      onEdit={noop}
      onDelete={noop}
      onReorder={noop}
      onAssignGroup={noop}
      nowUnixSeconds={() => PinnedSeconds}
      {...overrides}
    />
  )
}

describe('the authenticator list', () => {
  it('names the grid and marks it multi-selectable', () => {
    renderView()
    const grid = screen.getByRole('grid', { name: 'Registered second factors' })
    assert.equal(grid.getAttribute('aria-multiselectable'), 'true')
  })

  it('shows the code the RFC would produce at this instant', () => {
    renderView()
    const expected = totp(Sha1Key, PinnedSeconds, {
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    })
    const code = screen.getByRole('textbox', {
      name: 'Current code for Example Forge (lily@example.com)',
    }) as HTMLInputElement
    assert.equal(code.value, expected)
    assert.equal(code.readOnly, true)
  })

  it('peeks at the next code as well as the current one', () => {
    renderView()
    const expected = totp(Sha1Key, PinnedSeconds + 30, {
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    })
    assert.ok(screen.getAllByText(`Next: ${expected}`).length > 0)
  })

  it('gives the countdown a text equivalent rather than colour alone', () => {
    renderView()
    // 1_700_000_045 is five seconds into a 30-second step, so 25 remain.
    assert.ok(
      screen.getAllByText('This code is valid for another 25 seconds').length >
        0
    )
  })

  it('announces the code and never the countdown', () => {
    const { container } = renderView()
    const live = Array.from(
      container.querySelectorAll('[aria-live="polite"]')
    ).map(element => element.textContent ?? '')

    assert.ok(live.length > 0, 'the code region must be a live region')
    for (const text of live) {
      assert.ok(
        text.startsWith('New code for '),
        `a live region reads "${text}", which is not a code announcement`
      )
      assert.equal(
        /valid for another/.test(text),
        false,
        'the countdown must not be inside a live region'
      )
    }
  })

  it('says plainly that a factor with no stored secret cannot produce one', () => {
    renderView()
    assert.ok(
      screen.getByText(
        'No secret is stored for this factor, so it cannot produce a code. Delete it and register it again.'
      )
    )
    assert.equal(
      screen.queryByRole('textbox', {
        name: 'Current code for Example Bank (account-4417)',
      }),
      null
    )
  })

  it('reports an unverified clock as unverified rather than as fine', () => {
    renderView({ clock: null })
    assert.ok(
      screen.getByText(
        'Nothing has been compared against this machine’s clock, so whether these codes will be accepted is unknown.'
      )
    )
  })

  it('states a skewed clock with the exact offset', () => {
    renderView({
      clock: { offsetSeconds: 42, skewed: true, toleranceSeconds: 15 },
    })
    assert.ok(
      screen.getByText(
        /clock is 42 seconds ahead of the reference, which is more than the 15 seconds/
      )
    )
  })

  it('carries a search field wired to the regex builder', () => {
    renderView()
    assert.ok(
      screen.getByRole('searchbox', { name: 'Search factors' }),
      'the list needs its own search field'
    )
    assert.ok(
      screen.getByRole('button', {
        name: 'Regex builder for authenticator factors',
      }),
      'the search field needs its anchored regex builder'
    )
  })

  it('filters the rendered rows from the search field', () => {
    renderView()
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search factors' }),
      {
        target: { value: 'registry' },
      }
    )
    const grid = screen.getByRole('grid')
    assert.equal(within(grid).getAllByRole('row').length, 1)
  })

  it('scopes the select-all honestly and says which scope it means', () => {
    renderView()
    assert.ok(screen.getByText('Select all 4 factors'))

    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search factors' }),
      {
        target: { value: 'lily' },
      }
    )
    assert.ok(screen.getByText('Select the 2 matching factors'))
  })

  it('offers the bulk actions every list in this project carries', () => {
    renderView({ onExport: noop, onExportSecrets: noop })
    // Each bulk control names the scope it would act on in its accessible
    // name, which is also what tells it apart from the per-row Delete beside
    // it.
    for (const name of [
      'Invert selection',
      'Move into group — all 4 factors',
      'Delete — all 4 factors',
      'Export — all 4 factors',
    ]) {
      assert.ok(
        screen.getByRole('button', { name }),
        `the bulk row is missing "${name}"`
      )
    }
  })

  it('selects a row from its checkbox and reports the count', () => {
    renderView()
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Select Example Forge (lily@example.com)',
      })
    )
    assert.ok(screen.getByText('1 selected'))
  })

  it('extends a selection with shift-click', () => {
    renderView()
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Select Example Forge (lily@example.com)',
      })
    )
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Select Example Bank (account-4417)',
      }),
      { shiftKey: true }
    )
    assert.ok(screen.getByText('4 selected'))
  })

  it('gives the rows a roving tabindex rather than one stop each', () => {
    renderView()
    const rows = screen.getAllByRole('row')
    const focusable = rows.filter(row => row.getAttribute('tabindex') === '0')
    assert.equal(focusable.length, 1)
  })

  it('shows an honest empty state when nothing matches', () => {
    renderView()
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search factors' }),
      {
        target: { value: 'nothing at all matches this' },
      }
    )
    assert.ok(screen.getByText('No factor matches.'))
    assert.ok(screen.getByRole('button', { name: 'Reset filters' }))
  })

  it('never renders a secrets action when the host cannot write one', () => {
    renderView({ onExport: noop })
    assert.equal(
      screen.queryByRole('button', { name: /secrets/i }),
      null,
      'a secrets action with nowhere to write is worse than none'
    )
  })

  it('names the secrets a delete could not clear from the vault', async () => {
    // A bulk delete that claims a clean sweep while the keys are still on the
    // machine is the worst outcome this surface has, so a host that reports
    // failures must have somewhere for them to land.
    renderView({
      onDelete: () => Promise.resolve(['factor-forge', 'factor-mail']),
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Delete Example Forge (lily@example.com)',
      })
    )
    await waitFor(() =>
      assert.ok(
        md3Toasts.toasts.some(toast =>
          toast.message.includes(
            '2 secrets could not be removed from the credential store'
          )
        ),
        'the refused vault deletions were never reported'
      )
    )
    md3Toasts.clear()
  })

  it('carries its explanation behind progressive disclosure', () => {
    renderView()
    const toggle = screen.getByRole('button', { name: 'How this list works' })
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    fireEvent.click(toggle)
    assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  })

  it('states where the current defaults came from', () => {
    renderView()
    assert.ok(
      screen.getByText(
        /Default in use: new factors are created as SHA1 with 6 digits every 30 seconds — the shipped values/
      )
    )
  })
})

describe('registering a factor', () => {
  const renderRegistration = (
    overrides: Partial<
      React.ComponentProps<typeof Md3AuthenticatorRegistration>
    > = {}
  ) => {
    const committed: Array<IMd3RegistrationResult> = []
    const result = render(
      <Md3AuthenticatorRegistration
        onCommit={value => committed.push(value)}
        onDismissed={noop}
        nowUnixSeconds={() => PinnedSeconds}
        generateSecret={() => Sha1Key}
        {...overrides}
      />
    )
    return { ...result, committed }
  }

  it('offers every source the contract names', () => {
    renderRegistration()
    const group = screen.getByRole('radiogroup', {
      name: 'Where the secret comes from',
    })
    assert.deepEqual(
      within(group)
        .getAllByRole('radio')
        .map(button => button.textContent),
      [
        'auto_awesomeGenerate here',
        'content_paste_goPaste a link',
        'editType the secret',
        'folder_openRead an image',
        'content_pasteRead the clipboard',
        'crop_squareScan with a camera',
      ]
    )
  })

  it('keeps the generated secret hidden until it is deliberately shown', () => {
    renderRegistration()
    fireEvent.change(screen.getByLabelText('Account'), {
      target: { value: 'lily@example.com' },
    })
    assert.ok(
      screen.getByText(
        'The secret is hidden. Show it only if you are pairing by hand rather than scanning.'
      )
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show the secret' }))
    assert.ok(screen.getByText('GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ'))
  })

  it('draws a QR whose text alternative names the pairing and its parameters', () => {
    renderRegistration()
    fireEvent.change(screen.getByLabelText('Account'), {
      target: { value: 'lily@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Issuer'), {
      target: { value: 'Example Forge' },
    })
    const image = screen.getByRole('img')
    assert.equal(
      image.getAttribute('aria-label'),
      'Pairing QR for lily@example.com at Example Forge. It encodes the same secret shown beside it, using SHA1 with 6 digits every 30 seconds.'
    )
  })

  it('refuses to register until a current code matches', () => {
    const { committed } = renderRegistration()
    fireEvent.change(screen.getByLabelText('Account'), {
      target: { value: 'lily@example.com' },
    })
    const code = screen.getByLabelText('Current code')

    fireEvent.change(code, { target: { value: '000000' } })
    fireEvent.submit(screen.getByRole('dialog'))
    assert.equal(committed.length, 0)
    assert.ok(screen.getByRole('alert').textContent?.includes('does not match'))

    const correct = totp(Sha1Key, PinnedSeconds, {
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    })
    fireEvent.change(code, { target: { value: correct } })
    fireEvent.submit(screen.getByRole('dialog'))
    assert.equal(committed.length, 1)
    assert.equal(committed[0].account, 'lily@example.com')
    assert.equal(committed[0].secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  })

  it('adopts an otpauth link and its parameters', () => {
    renderRegistration()
    fireEvent.click(screen.getByRole('radio', { name: /Paste a link/ }))
    fireEvent.change(screen.getByLabelText('otpauth:// link'), {
      target: {
        value:
          'otpauth://totp/Example%20Registry:publisher?secret=GEZDGNBVGY3TQOJQ&issuer=Example%20Registry&algorithm=SHA256&digits=8&period=60',
      },
    })
    assert.equal(
      (screen.getByLabelText('Account') as HTMLInputElement).value,
      'publisher'
    )
    assert.equal(
      (screen.getByLabelText('Issuer') as HTMLInputElement).value,
      'Example Registry'
    )
    assert.equal(
      (screen.getByLabelText('Algorithm') as HTMLSelectElement).value,
      'SHA256'
    )
    assert.equal(
      (screen.getByLabelText('Digits') as HTMLInputElement).value,
      '8'
    )
  })

  it('says which parameters came from an issuer rather than from defaults', () => {
    renderRegistration()
    assert.ok(
      screen.getByText(/Default in use: SHA1, 6 digits, every 30 seconds/)
    )

    fireEvent.click(screen.getByRole('radio', { name: /Paste a link/ }))
    fireEvent.change(screen.getByLabelText('otpauth:// link'), {
      target: { value: 'otpauth://totp/a@b.c?secret=GEZDGNBVGY3TQOJQ' },
    })
    assert.ok(screen.getByText(/Set by the issuer: SHA1, 6 digits/))
  })

  it('states why a link could not be read', () => {
    renderRegistration()
    fireEvent.click(screen.getByRole('radio', { name: /Paste a link/ }))
    fireEvent.change(screen.getByLabelText('otpauth:// link'), {
      target: { value: 'otpauth://hotp/a?secret=GEZDGNBVGY3TQOJQ&counter=1' },
    })
    assert.ok(
      screen.getByRole('alert').textContent?.includes('counter-based factor')
    )
  })

  it('edits an existing factor without ever touching its secret', () => {
    const { committed } = renderRegistration({
      subject: {
        title: 'Example Forge (lily@example.com)',
        issuer: 'Example Forge',
        account: 'lily@example.com',
        group: 'Work',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      },
    })

    assert.equal(screen.queryByLabelText('Current code'), null)
    assert.equal(screen.queryByRole('radiogroup'), null)

    fireEvent.change(screen.getByLabelText('Issuer'), {
      target: { value: 'Renamed Forge' },
    })
    fireEvent.submit(screen.getByRole('dialog'))
    assert.equal(committed.length, 1)
    assert.equal(committed[0].issuer, 'Renamed Forge')
    assert.equal(committed[0].secret, undefined)
  })

  it('explains where the secret goes, behind progressive disclosure', () => {
    renderRegistration()
    const toggle = screen.getByRole('button', {
      name: 'What happens to this secret',
    })
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    fireEvent.click(toggle)
    assert.ok(
      screen.getByText(
        /kept in the operating system’s credential store under this factor’s own id/
      )
    )
  })
})

describe('the pairing QR', () => {
  it('renders the quiet zone inside its own plate', () => {
    const { container } = render(
      <Md3AuthenticatorQr value="HELLO" alternativeText="A test QR" />
    )
    const svg = container.querySelector('svg')
    assert.ok(svg !== null)
    // Version 1 is 21 modules; four light modules on each side make 29.
    assert.equal(svg.getAttribute('viewBox'), '0 0 29 29')
  })

  it('paints true black on true white, whatever the theme is', () => {
    const { container } = render(
      <Md3AuthenticatorQr value="HELLO" alternativeText="A test QR" />
    )
    const svg = container.querySelector('svg')
    assert.equal(svg?.querySelector('rect')?.getAttribute('fill'), '#ffffff')
    assert.equal(svg?.querySelector('g')?.getAttribute('fill'), '#000000')
  })

  it('reads back as the value it was given', () => {
    // The component draws whatever `encodeQr` produced, so decoding that
    // matrix is what proves the picture on screen is the pairing link and not
    // a differently-encoded one.
    const value = 'otpauth://totp/a@b.c?secret=GEZDGNBVGY3TQOJQ'
    const decoded = decodeQrMatrix(encodeQr(value).modules)
    assert.ok(decoded.ok)
    assert.equal(decoded.text, value)
  })

  it('never leaves the value out of the accessible name', () => {
    render(
      <Md3AuthenticatorQr
        value="HELLO"
        alternativeText="Pairing QR for somebody"
      />
    )
    assert.ok(screen.getByRole('img', { name: 'Pairing QR for somebody' }))
  })
})
