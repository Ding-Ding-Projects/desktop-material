import { describe, it } from 'node:test'
import assert from 'node:assert'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

// The published site is a single Design Component: `site/index.html` holds an
// `<x-dc>` template plus the logic class that renders it, and `site/support.js`
// is the runtime. These tests read that source rather than a built page, so
// they assert the template a reader's browser will be handed.
//
// The structural contract (vendored assets, no third-party hosts, font subset
// coverage, honest article counts, surviving documentation tree) is checked by
// `script/site-dc-pages-test.mjs`, which the Pages workflow runs against the
// assembled `_site`. What lives here is the accessibility contract, because it
// is the one a change to the markup breaks silently.
describe('Pages accessibility contracts', () => {
  it('gives both tab strips a panel, roving focus, and a live label', () => {
    const markup = read('site/index.html')

    assert.match(markup, /<div role="tablist" aria-label="Open pages"/)
    assert.match(
      markup,
      /<div role="tablist" aria-label="Sections on this page"/
    )
    assert.match(
      markup,
      /<main id="dm-page-panel" role="tabpanel" aria-labelledby="\{\{ activeTabId \}\}"/,
      'the panel must name the page tab that owns it'
    )

    // Both strips: an id, the panel they control, a roving tabindex, and the
    // arrow-key handler that makes the roving tabindex navigable.
    for (const strip of [
      /role="tab" id="\{\{ tab\./,
      /role="tab" id="\{\{ s\./,
    ]) {
      const tag = markup.match(new RegExp(`<button[^>]*${strip.source}[^>]*>`))
      assert.ok(tag, `no tab button matching ${strip}`)
      assert.match(tag[0], /aria-controls="dm-page-panel"/)
      assert.match(tag[0], /aria-selected=/)
      assert.match(tag[0], /tabIndex=/)
      assert.match(tag[0], /onKeyDown=/)
    }

    // A closed tab must leave the panel unlabelled rather than pointing at an
    // id that is no longer in the document.
    assert.match(
      markup,
      /activeTabId: visibleTabIds\.indexOf\(st\.page\) === -1 \? undefined :/
    )
  })

  it('names every slider, and states the appearance toggles', () => {
    const markup = read('site/index.html')

    for (const [, tag] of markup.matchAll(/(<input type="range"[^>]*>)/g)) {
      assert.match(
        tag,
        /aria-label="[^"]+"/,
        `a range input has no accessible name: ${tag}`
      )
    }
    // The two playfulness sliders keep their visible label inside the
    // accessible name, which is what WCAG's label-in-name rule asks for.
    assert.match(markup, /aria-label="English playfulness level, 1 to 5"/)
    assert.match(markup, /aria-label="廣東話 playfulness level, 1 to 5"/)

    for (const toggle of ['toggleBold', 'toggleItalic', 'toggleUnderline']) {
      const tag = markup.match(new RegExp(`<button[^>]*${toggle}[^>]*>`))
      assert.ok(tag, `no ${toggle} button`)
      assert.match(
        tag[0],
        /aria-pressed=/,
        `${toggle} is a toggle and must announce its state`
      )
    }
  })

  it('keeps the accent seed and its on-colour together', () => {
    const markup = read('site/index.html')

    // Replacing --md-sys-color-primary without replacing --md-sys-color-
    // on-primary leaves the theme block's text colour behind. In dark mode
    // that put #00344f on #006493 — a 2.02:1 primary call to action.
    assert.match(
      markup,
      /setProperty\('--md-sys-color-primary', st\.accent\);\s*\n\s*root\.style\.setProperty\('--md-sys-color-on-primary', this\.onColor\(st\.accent\)\);/
    )
    assert.match(markup, /onColor = \(hex\) => \{/)
    assert.match(
      markup,
      /0\.2126 \* channel\(0\) \+ 0\.7152 \* channel\(2\) \+ 0\.0722 \* channel\(4\)/,
      'the on-colour must come from relative luminance, not a brightness average'
    )
  })

  it('renders real screenshots rather than upload placeholders', () => {
    const markup = read('site/index.html')

    assert.doesNotMatch(
      markup,
      /<image-slot/,
      'a drag-and-drop upload slot is an empty box for every visitor'
    )
    const images = [...markup.matchAll(/<img\b[^>]*>/g)].map(([tag]) => tag)
    // Seven application captures plus the thirteen Cheap LFS diagrams.
    assert.equal(images.length, 20)
    assert.equal(
      images.filter(tag => tag.includes('docs/assets/screenshots/')).length,
      7,
      'the six gallery tiles and the hero capture'
    )
    assert.equal(
      images.filter(tag => tag.includes('assets/cheap-lfs/')).length,
      13
    )
    for (const tag of images) {
      const source = tag.match(/src="([^"]+)"/)?.[1]
      assert.ok(source, `image has no source: ${tag}`)
      // A source is relative to the published root, which is `site/` plus the
      // `docs/` subtree the Pages workflow copies in beside it.
      assert.ok(
        existsSync(join(process.cwd(), 'site', source)) ||
          existsSync(join(process.cwd(), source)),
        `${source} does not exist`
      )
      assert.match(tag, /alt="[^"]+"/, `${source} has no alt text`)
      if (source.startsWith('docs/assets/screenshots/')) {
        assert.match(tag, /loading="lazy"/, `${source} is not lazily loaded`)
      }
    }
    // Each one opens its full-size capture in a new tab, safely.
    for (const [, anchor] of markup.matchAll(
      /(<a href="docs\/assets\/screenshots\/[^"]+"[^>]*>)/g
    )) {
      assert.match(anchor, /target="_blank"/)
      assert.match(anchor, /rel="noopener"/)
    }
  })

  it('gives the whole document a language, a title, and a description', () => {
    const markup = read('site/index.html')

    assert.match(markup, /<html lang="en">/)
    assert.match(markup, /<title>Desktop Material — [^<]+<\/title>/)
    assert.match(markup, /<meta name="description" content="[^"]{60,}"/)
    assert.match(markup, /<meta name="color-scheme" content="light dark">/)
  })

  it('addresses every page by a real URL and keeps the retired ones alive', () => {
    const markup = read('site/index.html')

    // A single-page site still owes readers linkable pages: `#lfs` names a
    // page and `#docs/coverage` a section inside one.
    assert.match(
      markup,
      /pages = \['landing', 'docs', 'article', 'search', 'lfs', 'atlas'\]/
    )
    assert.match(
      markup,
      /window\.addEventListener\('popstate', this\.onRoute\)/
    )
    assert.match(
      markup,
      /window\.addEventListener\('hashchange', this\.onRoute\)/
    )
    assert.match(
      markup,
      /window\.removeEventListener\('popstate', this\.onRoute\)/
    )

    // The two URLs the previous site published redirect instead of 404ing.
    for (const [stub, route] of [
      ['site/cheap-lfs.html', '#lfs'],
      ['site/cheap-lfs-vs-git-lfs.html', '#atlas'],
    ]) {
      const redirect = read(stub)
      assert.match(redirect, new RegExp(`url=\\./${route}`))
      assert.match(redirect, new RegExp(`href="\\./${route}"`))
      assert.match(redirect, /<link rel="canonical"/)
      assert.match(
        redirect,
        /<h1>[^<]+has moved<\/h1>/,
        'a reader whose browser blocked the refresh still needs to be told'
      )
    }
  })

  it('respects reduced motion and a high-contrast preference', () => {
    const markup = read('site/index.html')

    assert.match(
      markup,
      /\[data-dm-motion='off'\] \*\{animation:none !important;transition:none !important;\}/
    )
    assert.match(markup, /\[data-dm-contrast='high'\]\{/)
    assert.match(
      markup,
      /\[data-dm-contrast='high'\]\[data-dm-theme='dark'\]\{/
    )
    assert.match(
      markup,
      /:focus-visible\{outline:3px solid var\(--md-sys-color-primary\);outline-offset:2px;\}/
    )
  })

  it('lays out on a phone without pushing the page sideways', () => {
    const markup = read('site/index.html')
    const mobile = markup.slice(
      markup.indexOf('@media (max-width:760px)'),
      markup.indexOf('@media (max-height:520px)')
    )
    assert.ok(mobile.length > 0, 'the narrow-window media block is gone')

    // Every multi-column grid collapses, and its items are allowed to shrink
    // below their own min-content width — a grid item defaults to
    // min-width:auto, so one long token in a card is enough to widen the page.
    assert.match(
      mobile,
      /\[style\*="grid-template-columns"\]\{grid-template-columns:1fr !important;\}/
    )
    assert.match(
      mobile,
      /\[style\*="grid-template-columns"\] > \*\{min-width:0 !important;\}/
    )
    assert.match(mobile, /main\{overflow-wrap:anywhere;\}/)

    // The inline minimums that are wider than a phone are marked rather than
    // matched on the style string, because React re-serialises inline styles
    // and a selector keyed on its spacing silently stops matching.
    assert.match(mobile, /\[data-dm-fluid\]\{min-width:0 !important;\}/)
    // Two elements carry it: the app bar's search field and the atlas matrix
    // search. Both declare an inline minimum wider than a phone.
    assert.equal((markup.match(/data-dm-fluid style="/g) ?? []).length, 2)
    for (const [, style] of markup.matchAll(/data-dm-fluid style="([^"]+)"/g)) {
      assert.match(
        style,
        /min-width:(2[3-9]\d|[3-9]\d\d)px/,
        `data-dm-fluid on an element with no wide minimum: ${style.slice(
          0,
          60
        )}`
      )
    }

    // Below the breakpoint the app bar's search field becomes a button, which
    // is the only reason the bar still fits.
    assert.match(
      mobile,
      /\[data-dm-actions\] > \[data-dm-fluid\]\{display:none !important;\}/
    )
    assert.match(
      mobile,
      /\[data-dm-search-button\]\{display:grid !important;\}/
    )
    assert.match(mobile, /header kbd\{display:none !important;\}/)

    // A phone held sideways gets the screen back.
    assert.match(
      markup,
      /@media \(max-height:520px\)\{\s*header\[data-appear="appbar"\]\{position:static !important;\}/
    )
  })

  it('gives the phone search button a name and a working action', () => {
    const markup = read('site/index.html')
    const button = markup.match(/<button[^>]*data-dm-search-button[^>]*>/)?.[0]

    assert.ok(button, 'the phone search button is gone')
    assert.match(button, /aria-label="Search this site"/)
    assert.match(button, /onClick="\{\{ openSearchPanel \}\}"/)
    // Hidden by default so it never doubles the desktop search field; the
    // media query is what reveals it.
    assert.match(button, /style="display:none;/)
    assert.match(
      markup,
      /openSearchPanel: \(\) => this\.setState\(\{ panel: 'search' \}\)/
    )
  })

  it('scrolls a teleport clear of a sticky header of any height', () => {
    const markup = read('site/index.html')

    // A fixed offset lands the target underneath the app bar once it wraps
    // onto three lines on a phone, so the clearance is measured.
    assert.match(
      markup,
      /const bar = document\.querySelector\('header\[data-appear="appbar"\]'\)/
    )
    assert.match(
      markup,
      /const clearance = \(bar \? bar\.getBoundingClientRect\(\)\.height : 140\) \+ 20/
    )
    assert.doesNotMatch(markup, /window\.pageYOffset - 160/)
  })

  it('keeps the imported Listbox operable and named', () => {
    const markup = read('site/Listbox.dc.html')

    assert.match(markup, /aria-haspopup="listbox"/)
    assert.match(markup, /aria-expanded="\{\{ open \}\}"/)
    assert.match(markup, /aria-label="\{\{ triggerLabel \}\}"/)
    assert.match(markup, /role="listbox" aria-label="\{\{ label \}\}"/)
    assert.match(
      markup,
      /role="option" aria-selected="\{\{ row\.selected \}\}"/
    )

    // The importing page is the browser's own document, where HTML lowercases
    // attribute names, so the callback arrives as `onpick` there and `onPick`
    // only when a host parses the template from source text. Reading one
    // spelling makes every selection a silent no-op on the published site.
    assert.match(
      markup,
      /const onPick = this\.props\.onPick \|\| this\.props\.onpick/
    )
    assert.doesNotMatch(markup, /this\.props\.onPick\(/)
  })
})
