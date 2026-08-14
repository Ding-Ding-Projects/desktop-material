#!/usr/bin/env node
//
// Contract test for the Material Design 3 Pages site.
//
//   node script/site-dc-pages-test.mjs [publishDir] [--expect-docs]
//
// The site is one Design Component rendered by a client-side runtime, so most
// of what could go wrong goes wrong silently: a vendored file that did not
// ship still leaves a page that "loads", an icon added without re-running the
// vendoring step renders as the word `dark_mode`, and a stray CDN URL is
// invisible until someone opens the site behind a firewall. Every check below
// exists because its failure mode looks fine from the outside.
//
// Run it against `site/` while working, and against the assembled `_site` in
// CI with `--expect-docs`, which additionally proves the rendered
// documentation tree the hub links into was published alongside the app.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ALLOWED_REMOTE_HOSTS,
  DC_SOURCE_FILES,
  DOC_CATEGORIES,
  RUNTIME_RESOURCES,
  requiredCjkCharacters,
  requiredIconNames,
} from './site-dc-assets.mjs'
import {
  applyCounts,
  countGalleryScenes,
  expectedCounts,
} from './sync-site-doc-counts.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const expectDocs = argv.includes('--expect-docs')
const publishRoot = resolve(
  repositoryRoot,
  argv.find(argument => !argument.startsWith('--')) ?? 'site'
)

const failures = []
const check = (condition, message) => {
  if (!condition) failures.push(message)
}
const read = relative => readFileSync(join(publishRoot, relative), 'utf8')
const has = relative => existsSync(join(publishRoot, relative))

// ---------------------------------------------------------------- structure

for (const required of [
  'index.html',
  'Listbox.dc.html',
  'support.js',
  'favicon.svg',
  'vendor/dc-resources.js',
  'vendor/manifest.json',
  'vendor/fonts/fonts.css',
  'vendor/fonts/coverage.json',
]) {
  check(has(required), `${required} is missing from the published site`)
}
if (failures.length > 0) report()

// The icon and Cantonese scans have to read exactly what the vendoring step
// read, or the two can agree on a subset neither of them checked.
const sources = DC_SOURCE_FILES.map(read).join('\n')
const page = read('index.html')
const listbox = read('Listbox.dc.html')

check(
  page.includes('<x-dc>') && page.includes('data-dc-script'),
  'index.html is not the Design Component — its <x-dc> template or logic script is gone'
)
check(
  page.indexOf('vendor/dc-resources.js') < page.indexOf('support.js'),
  'vendor/dc-resources.js must load before support.js, or the runtime resolves ' +
    'its React URLs against a CDN before the local map exists'
)
check(
  /<html lang="[a-z-]+"/.test(page),
  'index.html has no lang attribute, so assistive technology cannot pick a voice'
)
check(/<title>[^<]+<\/title>/.test(page), 'index.html has no <title>')
check(
  /<meta name="description" content="[^"]+"/.test(page),
  'index.html has no description meta'
)

// Every page the tab strip offers has to be a real route, because the redirect
// stubs and every external deep link address them by name.
for (const route of ['landing', 'docs', 'article', 'search', 'lfs', 'atlas']) {
  check(
    new RegExp(`\\{ id: '${route}',`).test(page),
    `the '${route}' page is missing from the tab catalog`
  )
}

// ------------------------------------------------------- no remote requests

// support.js legitimately *names* the CDN URLs it would fall back to, so the
// test proves they are all mapped rather than banning the strings outright.
const resources = read('vendor/dc-resources.js')
for (const resource of RUNTIME_RESOURCES) {
  check(
    resources.includes(resource.url),
    `${resource.url} is not remapped in vendor/dc-resources.js`
  )
  check(has(resource.local), `${resource.local} was never vendored`)
}
// Babel is only fetched for a `jsx` x-import. The site has none, and if one is
// ever added the vendoring story has to be revisited before it ships.
check(
  !/<x-import\b/.test(sources),
  'an <x-import> appeared; it may pull Babel from a CDN at runtime'
)
for (const match of sources.matchAll(/<dc-import[^>]*name="([^"]+)"/g)) {
  check(
    has(`${match[1]}.dc.html`),
    `<dc-import name="${match[1]}"> has no ${match[1]}.dc.html beside it`
  )
}

for (const [name, text] of [
  ['index.html', page],
  ['Listbox.dc.html', listbox],
  ['vendor/fonts/fonts.css', read('vendor/fonts/fonts.css')],
]) {
  for (const match of text.matchAll(/https?:\/\/([^/"'\s)]+)/g)) {
    check(
      ALLOWED_REMOTE_HOSTS.has(match[1]),
      `${name} references the third-party host ${match[1]}; the published site ` +
        'must load every asset from its own origin'
    )
  }
}

// ----------------------------------------------------------- font coverage

const fontsCss = read('vendor/fonts/fonts.css')
for (const match of fontsCss.matchAll(/url\('\.\/([^']+)'\)/g)) {
  check(
    has(`vendor/fonts/${match[1]}`),
    `vendor/fonts/fonts.css points at ${match[1]}, which was not published`
  )
}
for (const family of [
  'Roboto Flex',
  'Roboto Mono',
  'Material Symbols Outlined',
  'Noto Sans HK',
]) {
  check(
    fontsCss.includes(`font-family: '${family}'`),
    `no @font-face for ${family}; that text falls back to a system font`
  )
}

const coverage = JSON.parse(read('vendor/fonts/coverage.json'))
const covered = new Set(coverage.materialSymbolsOutlined)
const missingIcons = [...requiredIconNames(sources)].filter(
  name => !covered.has(name)
)
check(
  missingIcons.length === 0,
  `the icon subset is missing ${missingIcons.join(', ')} — those render as ` +
    'their ligature words. Re-run: node script/vendor-site-assets.mjs'
)
const coveredCjk = new Set(coverage.notoSansHk)
const missingCjk = requiredCjkCharacters(sources).filter(
  character => !coveredCjk.has(character)
)
check(
  missingCjk.length === 0,
  `the Hong Kong Chinese subset is missing ${missingCjk.join(
    ''
  )} — that copy ` +
    'renders as tofu. Re-run: node script/vendor-site-assets.mjs'
)

// ------------------------------------------------------------------ images

// A broken <img> still lays the page out; only the picture is missing, which
// is why nobody notices until a reader does.
const referencedImages = new Set(
  [...sources.matchAll(/src="((?!https?:)[^"]+\.(?:webp|svg|png|jpg))"/g)].map(
    match => match[1]
  )
)
check(referencedImages.size > 0, 'the site references no local images at all')
for (const image of referencedImages) {
  // Screenshots live under docs/ and are copied into the publish tree by the
  // workflow. Testing a raw `site/` therefore resolves them from the
  // repository; testing the assembled `_site` demands the copy actually
  // happened, which is the case a visitor would see as a broken image.
  const published = has(image)
  const inRepository = existsSync(join(repositoryRoot, image))
  check(
    expectDocs ? published : published || inRepository,
    `${image} is referenced but ${
      inRepository ? 'was not copied into the publish tree' : 'does not exist'
    }`
  )
}
// A screenshot with no alt text is invisible to anyone who cannot see it.
for (const match of page.matchAll(/<img (?![^>]*\balt=")[^>]*>/g)) {
  check(false, `an image has no alt text: ${match[0].slice(0, 90)}`)
}
// The design shipped drag-and-drop upload placeholders for these captures.
// Those are an authoring affordance; on a published page they are empty boxes.
check(
  !page.includes('<image-slot'),
  'an <image-slot> upload placeholder is still on the published page — it ' +
    'renders as an empty box for every visitor'
)
// The count the Screenshots section quotes is the gallery manifest's, so it
// cannot drift away from the gallery it points at. Counted by the same
// function that writes it, imported rather than re-derived here: two regexes
// over one table is two chances for the check and the repair to disagree about
// what counts as a scene, and then neither number is trustworthy.
const galleryScenes = countGalleryScenes()
check(
  page.includes(`targets ${galleryScenes} Windows scenes`) &&
    page.includes(`Browse all ${galleryScenes} scenes`),
  `the Screenshots section should quote the gallery's ${galleryScenes} ` +
    `scenes. Run: node script/sync-site-doc-counts.mjs`
)
// The reverse: an asset nobody renders is bytes every visitor downloads the
// directory listing of for nothing, and a sign a page was dropped by mistake.
const assetDirectory = 'assets/cheap-lfs'
if (has(assetDirectory)) {
  for (const entry of readdirSync(join(publishRoot, assetDirectory))) {
    check(
      referencedImages.has(`${assetDirectory}/${entry}`),
      `${assetDirectory}/${entry} ships but nothing on the site renders it`
    )
  }
}

// ------------------------------------------------------------ accessibility

check(
  page.includes('role="tabpanel"') && page.includes('id="dm-page-panel"'),
  'the tab strips control no tabpanel'
)
check(
  (page.match(/aria-controls="dm-page-panel"/g) ?? []).length >= 2,
  'both the page tabs and the section tabs must name the panel they control'
)
check(
  (page.match(/role="tab"[^>]*tabIndex=/g) ?? []).length >= 2,
  'the tab strips have no roving tabindex, so a keyboard user tabs through ' +
    'every tab to reach the content'
)
for (const match of page.matchAll(
  /<input type="range"(?![^>]*aria-label)[^>]*>/g
)) {
  check(false, `a range input has no accessible name: ${match[0].slice(0, 90)}`)
}
// The accent seed replaces --md-sys-color-primary at runtime. Setting it
// without its on-colour leaves the theme block's text colour behind, and the
// primary call to action drops to roughly 2:1 in one of the two themes.
check(
  /setProperty\('--md-sys-color-primary'[\s\S]{0,240}setProperty\('--md-sys-color-on-primary'/.test(
    page
  ),
  'the accent override sets --md-sys-color-primary without a matching ' +
    '--md-sys-color-on-primary, so the primary CTA loses its contrast'
)

// ------------------------------------------------------- the legacy URLs

for (const [stub, route] of [
  ['cheap-lfs.html', '#lfs'],
  ['cheap-lfs-vs-git-lfs.html', '#atlas'],
]) {
  check(has(stub), `${stub} is gone; every link ever made to it now 404s`)
  if (!has(stub)) continue
  const text = read(stub)
  check(
    text.includes(`url=./${route}`) && text.includes(`href="./${route}"`),
    `${stub} must redirect to ./${route} and offer the same link for readers ` +
      'whose browser did not follow the refresh'
  )
}

// -------------------------------------------------- honest article counts

const expected = expectedCounts()
check(
  applyCounts(page, expected) === page,
  'the Docs hub advertises article counts that docs/ no longer matches. ' +
    'Run: node script/sync-site-doc-counts.mjs'
)
check(
  page.includes(`Open all ${expected.total} articles`),
  `the Docs hub should offer all ${expected.total} rendered articles. ` +
    `Run: node script/sync-site-doc-counts.mjs`
)

// ------------------------------------------- the documentation it links to

const docTargets = [
  'docs/index.html',
  'docs/search.html',
  'docs/screenshots/index.html',
  ...DOC_CATEGORIES.map(category => `docs/features/${category.dir}/index.html`),
]
check(
  page.includes('href="./docs/screenshots/"'),
  'the Screenshots section no longer links to the full gallery'
)
for (const category of DOC_CATEGORIES) {
  check(
    page.includes(`href: './docs/features/${category.dir}/'`),
    `the Docs hub no longer links to the ${category.dir} category`
  )
}
if (expectDocs) {
  for (const target of docTargets) {
    check(
      has(target),
      `${target} was not published, so a Docs hub card leads to a 404`
    )
  }
}

report()

function report() {
  if (failures.length === 0) {
    const files = countFiles(publishRoot)
    process.stdout.write(
      `Material Design 3 Pages contract: OK (${files} files under ` +
        `${publishRoot}${expectDocs ? ', documentation tree included' : ''}).\n`
    )
    return
  }
  process.stderr.write('Material Design 3 Pages contract failed:\n')
  for (const failure of failures) process.stderr.write(`  - ${failure}\n`)
  process.exit(1)
}

function countFiles(directory) {
  let total = 0
  for (const entry of readdirSync(directory)) {
    const child = join(directory, entry)
    total += statSync(child).isDirectory() ? countFiles(child) : 1
  }
  return total
}
