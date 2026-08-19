import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import * as React from 'react'

import { englishTranslations } from '../../src/lib/i18n-resources'
import {
  IMd3Destination,
  Md3DestinationId,
  md3Destinations,
} from '../../src/ui/md3/md3-navigation-drawer'
import { Md3NavigationRail } from '../../src/ui/md3/md3-navigation-rail'
import { fireEvent, render, screen } from '../helpers/ui/render'

/**
 * The MD3 navigation rail — Classic mode's alternative to the drawer, per
 * `design/Desktop Material v2.dc.html`.
 *
 * The rail is a different presentation of the exact same destination list the
 * drawer renders, never a shorter one: it takes the same
 * `ReadonlyArray<IMd3Destination>` prop the drawer takes, and this file's
 * first and most important job is proving it renders every single entry it
 * is handed. Dropping even one destination is a feature quietly removed,
 * which the user has explicitly forbidden — so the rest of the file follows
 * the drawer's own established test shape (`md3-shell-test.tsx`) for the
 * behaviours the rail shares with it: exactly one active destination, a
 * badge that only appears for a non-empty count, roving-tabindex keyboard
 * movement, and a name that survives even when the visible label is hidden.
 */

const noop = () => undefined

interface IRailHarnessProps {
  readonly destinations?: ReadonlyArray<IMd3Destination>
  readonly initialDestination?: Md3DestinationId
  readonly showLabels?: boolean
  readonly accountName?: string
  readonly mainPaneId?: string
  readonly onSelect?: (id: string) => void
  readonly onSettings?: () => void
  readonly onAccount?: () => void
}

/**
 * Drives `Md3NavigationRail` the way a real host would: it owns which
 * destination is active and feeds the resulting list back in, so a click or a
 * keypress on one destination is reflected in which one is next rendered as
 * active — exactly the loop `md3Destinations` exists to close.
 */
function RailHarness(props: IRailHarnessProps) {
  const [active, setActive] = React.useState<Md3DestinationId>(
    props.initialDestination ?? 'history'
  )

  const destinations = props.destinations ?? md3Destinations({}, active)

  return (
    <Md3NavigationRail
      destinations={destinations}
      activeRepositoryName="desktop-material"
      accountInitials="AL"
      accountName={props.accountName}
      showLabels={props.showLabels}
      mainPaneId={props.mainPaneId}
      onSelectDestination={(id: string) => {
        props.onSelect?.(id)
        // Only meaningful for the default, harness-built list: an override
        // supplying its own `destinations` (the "renders more than eight"
        // case) never reads `active` again, so the cast is safe here.
        setActive(id as Md3DestinationId)
      }}
      onOpenSettings={props.onSettings ?? noop}
      onOpenAccountSwitcher={props.onAccount ?? noop}
    />
  )
}

function railTabs(): ReadonlyArray<HTMLElement> {
  return screen.getAllByRole('tab')
}

function railTab(id: string): HTMLElement {
  const found = railTabs().find(tab => tab.dataset.destinationId === id)
  assert.ok(found !== undefined, `no rail tab found for destination "${id}"`)
  return found as HTMLElement
}

// ---------------------------------------------------------------------------
// The regression the rail must never cause: dropping a destination
// ---------------------------------------------------------------------------

describe('md3 navigation rail — carries every destination it is given', () => {
  it('renders one control per destination, dropping none of the list it was handed', () => {
    const destinations = md3Destinations({}, 'history')
    render(<RailHarness destinations={destinations} />)

    const tabs = railTabs()
    assert.equal(
      tabs.length,
      destinations.length,
      'the rail must render exactly one control per destination — anything ' +
        'fewer than the full list is a feature quietly removed, which is ' +
        'forbidden'
    )

    for (const destination of destinations) {
      assert.ok(
        tabs.some(tab => tab.dataset.destinationId === destination.id),
        `destination "${destination.id}" went missing from the rail`
      )
    }
  })

  it('renders every entry even when handed more than the usual eight destinations', () => {
    // Proves the rail is a presentation of whatever list it is given, not a
    // component quietly hard-coded to eight destinations.
    const extra: IMd3Destination = {
      id: 'extra-destination',
      label: 'Extra',
      icon: 'book_2',
      count: '',
      active: false,
    }
    const destinations = [...md3Destinations({}, 'history'), extra]
    render(<RailHarness destinations={destinations} />)

    const tabs = railTabs()
    assert.equal(tabs.length, destinations.length)
    assert.ok(
      tabs.some(tab => tab.dataset.destinationId === 'extra-destination'),
      'a destination added beyond the usual eight must still be rendered'
    )
  })
})

// ---------------------------------------------------------------------------
// The active destination
// ---------------------------------------------------------------------------

describe('md3 navigation rail — the active destination', () => {
  it('marks exactly one destination selected and current, and it is the active one', () => {
    const destinations = md3Destinations({}, 'branches')
    render(<RailHarness destinations={destinations} />)

    const tabs = railTabs()
    const selected = tabs.filter(
      tab => tab.getAttribute('aria-selected') === 'true'
    )
    assert.equal(
      selected.length,
      1,
      'exactly one destination may be marked selected at a time'
    )
    assert.equal(selected[0].dataset.destinationId, 'branches')
    assert.equal(selected[0].getAttribute('aria-current'), 'page')

    for (const tab of tabs) {
      if (tab === selected[0]) {
        continue
      }
      assert.equal(tab.getAttribute('aria-selected'), 'false')
      assert.equal(tab.getAttribute('aria-current'), null)
    }
  })
})

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

describe('md3 navigation rail — badges', () => {
  it('shows a badge only for a non-empty count; an empty count means no badge, not zero', () => {
    const destinations = md3Destinations(
      { changes: '12', branches: '5', history: '' },
      'history'
    )
    render(<RailHarness destinations={destinations} />)

    const withCounts: ReadonlyArray<readonly [string, string]> = [
      ['changes', '12'],
      ['branches', '5'],
    ]
    for (const [id, count] of withCounts) {
      const badge = railTab(id).querySelector('[class*="badge"]')
      assert.ok(badge !== null, `${id} carries a count and must show a badge`)
      assert.equal(badge?.textContent, count)
    }

    const withoutCounts = [
      'history',
      'actions',
      'inbox',
      'terminal',
      'agents',
      'repositories',
    ]
    for (const id of withoutCounts) {
      assert.equal(
        railTab(id).querySelector('[class*="badge"]'),
        null,
        `${id} carries an empty count — '' means no badge at all, not a zero`
      )
    }
  })
})

// ---------------------------------------------------------------------------
// Selecting a destination
// ---------------------------------------------------------------------------

describe('md3 navigation rail — selecting a destination', () => {
  it('calls onSelectDestination with the id of the destination that was clicked', () => {
    const clicked: Array<string> = []
    const destinations = md3Destinations({}, 'history')
    render(
      <RailHarness
        destinations={destinations}
        onSelect={id => clicked.push(id)}
      />
    )

    fireEvent.click(railTab('branches'))
    assert.deepStrictEqual(clicked, ['branches'])

    fireEvent.click(railTab('agents'))
    assert.deepStrictEqual(clicked, ['branches', 'agents'])
  })
})

// ---------------------------------------------------------------------------
// Roving tab stop
// ---------------------------------------------------------------------------

describe('md3 navigation rail — roving tab stop', () => {
  it('takes one tab stop and moves it with ArrowDown, ArrowUp, Home and End', () => {
    const destinations = md3Destinations({}, 'history')
    render(<RailHarness destinations={destinations} />)

    const tabs = railTabs()
    assert.equal(tabs.length, 8)
    assert.equal(
      tabs.filter(tab => tab.getAttribute('tabindex') === '0').length,
      1,
      'a tab list is one tab stop, not eight'
    )
    assert.equal(railTab('history').getAttribute('tabindex'), '0')

    railTab('history').focus()
    fireEvent.keyDown(railTab('history'), { key: 'ArrowDown' })
    assert.equal(document.activeElement, railTab('branches'))
    assert.equal(
      railTabs().filter(tab => tab.getAttribute('tabindex') === '0').length,
      1,
      'moving the tab stop must not leave a second control reachable by Tab'
    )

    fireEvent.keyDown(railTab('branches'), { key: 'ArrowUp' })
    assert.equal(document.activeElement, railTab('history'))

    fireEvent.keyDown(railTab('history'), { key: 'End' })
    assert.equal(document.activeElement, railTab('repositories'))

    fireEvent.keyDown(railTab('repositories'), { key: 'Home' })
    assert.equal(document.activeElement, railTab('changes'))
  })
})

// ---------------------------------------------------------------------------
// showLabels
// ---------------------------------------------------------------------------

describe('md3 navigation rail — showLabels', () => {
  it('shows the visible label text by default, since showLabels defaults to true', () => {
    const destinations = md3Destinations({}, 'history')
    render(<RailHarness destinations={destinations} />)

    for (const destination of destinations) {
      assert.ok(
        screen.getByText(destination.label) instanceof HTMLElement,
        `${destination.id} must show its label when showLabels is not set`
      )
    }
  })

  it('keeps every destination named even with showLabels false — the failure no screenshot reveals', () => {
    const destinations = md3Destinations({}, 'history')
    render(<RailHarness destinations={destinations} showLabels={false} />)

    // Hiding the visible label is a stylesheet concern jsdom cannot model, so
    // this proves the same thing the drawer's collapsed-row test proves: an
    // EXPLICIT `aria-label` carries the name, rather than relying on visible
    // text that a hidden label would take with it.
    for (const destination of destinations) {
      const tab = railTab(destination.id)
      assert.equal(
        tab.getAttribute('aria-label'),
        destination.label,
        `${destination.id} carries no name a hidden label cannot take with it`
      )
    }
  })

  it('emits the exact modifier class the stylesheet hides labels with', () => {
    // The defect this catches shipped once already: the component emitted
    // `--labels-hidden` while the stylesheet targeted `--no-labels`, so
    // hiding the labels quietly did nothing. Nothing else finds it — the
    // types agree, the component renders, every behavioural test above still
    // passes, and jsdom has no opinion about which selectors match. So the
    // check is the only place the two halves are ever compared, and it reads
    // the real stylesheet rather than restating the name.
    const stylesheet = readFileSync(
      join(process.cwd(), 'app/styles/ui/_md3-navigation-rail.scss'),
      'utf8'
    )
    const targeted = new Set(
      stylesheet.match(/\.md3-navigation-rail--[a-z-]+/g)?.map(m => m.slice(1))
    )
    assert.ok(
      targeted.size > 0,
      'the stylesheet targets no modifier at all, so this check proves nothing'
    )

    const { container } = render(
      <RailHarness
        destinations={md3Destinations({}, 'history')}
        showLabels={false}
      />
    )
    const nav = container.querySelector('nav')
    assert.ok(nav !== null)

    for (const modifier of targeted) {
      assert.ok(
        nav.classList.contains(modifier),
        `the stylesheet styles .${modifier}, but the rail never emits it`
      )
    }
  })
})

// ---------------------------------------------------------------------------
// Settings and account controls
// ---------------------------------------------------------------------------

describe('md3 navigation rail — settings and account controls', () => {
  it('opens settings when its button is activated', () => {
    let opened = 0
    render(<RailHarness onSettings={() => opened++} />)

    fireEvent.click(
      screen.getByRole('button', {
        name: englishTranslations['md3.rail.settings'],
      })
    )
    assert.equal(opened, 1)
  })

  it('opens the account switcher when its button is activated, naming the account', () => {
    let opened = 0
    render(
      <RailHarness accountName="Alice Lindqvist" onAccount={() => opened++} />
    )

    // `RailHarness` always renders with `activeRepositoryName="desktop-
    // material"`, which the rail folds into the same accessible name — see
    // the doc comment on `Md3NavigationRail`'s `activeRepositoryName` prop
    // for why: the prototype's rail has no separate repository chip, so this
    // is where the drawer's dropped chip content now lives.
    fireEvent.click(
      screen.getByRole('button', {
        name: englishTranslations['md3.rail.accountFor']
          .replace('{name}', 'Alice Lindqvist')
          .replace('{repository}', 'desktop-material'),
      })
    )
    assert.equal(opened, 1)
  })
})

// ---------------------------------------------------------------------------
// Pane relationship and orientation
// ---------------------------------------------------------------------------

describe('md3 navigation rail — pane relationship and orientation', () => {
  it('links every destination to the main pane when mainPaneId is supplied', () => {
    const destinations = md3Destinations({}, 'history')
    render(
      <RailHarness destinations={destinations} mainPaneId="md3-shell-pane" />
    )

    for (const tab of railTabs()) {
      assert.equal(tab.getAttribute('aria-controls'), 'md3-shell-pane')
    }
  })

  it('sets no aria-controls when mainPaneId is omitted', () => {
    const destinations = md3Destinations({}, 'history')
    render(<RailHarness destinations={destinations} />)

    for (const tab of railTabs()) {
      assert.equal(tab.getAttribute('aria-controls'), null)
    }
  })

  it('announces the destination list as a vertical tab list', () => {
    render(<RailHarness />)

    const tablist = screen.getByRole('tablist')
    assert.equal(
      tablist.getAttribute('aria-orientation'),
      'vertical',
      'a strip announced as horizontal moves the wrong way when a screen ' +
        'reader user presses the arrow keys'
    )
  })
})
