import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publishRoot = resolve(repositoryRoot, process.argv[2] ?? 'site')
const route = 'cheap-lfs-vs-git-lfs.html'
const pagePath = join(publishRoot, route)
const homePath = join(publishRoot, 'index.html')
const guidePath = join(publishRoot, 'cheap-lfs.html')
const stylePath = join(publishRoot, 'cheap-lfs-vs-git-lfs.css')
const scriptPath = join(publishRoot, 'cheap-lfs-vs-git-lfs.js')
const sharedScriptPath = join(publishRoot, 'cheap-lfs.js')
const orbitPath = join(
  publishRoot,
  'assets',
  'cheap-lfs',
  'comparison-orbit.svg'
)
const pathsPath = join(publishRoot, 'assets', 'cheap-lfs', 'pointer-paths.svg')

const fail = message => {
  throw new Error(`Cheap LFS comparison atlas contract: ${message}`)
}

for (const required of [
  pagePath,
  homePath,
  guidePath,
  stylePath,
  scriptPath,
  sharedScriptPath,
  orbitPath,
  pathsPath,
]) {
  if (!existsSync(required)) {
    fail(`required published file is missing: ${required}`)
  }
}

const html = readFileSync(pagePath, 'utf8')
// Git checks this HTML out with CRLF on Windows. Normalize only for the
// newline-bounded command assertions so the contract still distinguishes the
// standalone `git push` step from `git push --set-upstream ...`.
const commandHtml = html.replace(/\r\n/g, '\n')
const home = readFileSync(homePath, 'utf8')
const guide = readFileSync(guidePath, 'utf8')
const pageScript = readFileSync(scriptPath, 'utf8')
const sharedScript = readFileSync(sharedScriptPath, 'utf8')
const pageStyle = readFileSync(stylePath, 'utf8')
const orbit = readFileSync(orbitPath, 'utf8')
const pathsGraphic = readFileSync(pathsPath, 'utf8')
const count = (source, pattern) => source.match(pattern)?.length ?? 0

if (!home.includes('href="cheap-lfs-vs-git-lfs.html#matrix"')) {
  fail('the Pages homepage does not link to the standalone atlas')
}
if (!guide.includes('href="cheap-lfs-vs-git-lfs.html#matrix"')) {
  fail('the existing Cheap LFS guide does not cross-link to the atlas')
}
if (!html.includes('href="cheap-lfs.html"')) {
  fail('the atlas does not link back to the complete Cheap LFS guide')
}
if (count(html, /data-set-language=/g) !== 3) {
  fail('English, Cantonese, and bilingual language modes are required')
}
for (const language of ['en', 'yue']) {
  if (
    !new RegExp(
      `<input[\\s\\S]*?id="funny-${language}"[\\s\\S]*?type="range"[\\s\\S]*?min="1"[\\s\\S]*?max="5"`,
      'm'
    ).test(html)
  ) {
    fail(`the independent 1–5 ${language} funny-level slider is missing`)
  }
  if (!html.includes(`data-atlas-tone="${language}"`)) {
    fail(`the ${language} funny-level slider has no visible tone target`)
  }
}
if (!html.includes('lang="zh-HK"')) {
  fail('Cantonese content must be labelled as Hong Kong Cantonese')
}

const tabIds = [...html.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1])
const panelIds = [...html.matchAll(/data-panel="([^"]+)"/g)].map(
  match => match[1]
)
if (
  tabIds.length !== 6 ||
  panelIds.length !== 6 ||
  tabIds.some(tab => !panelIds.includes(tab))
) {
  fail('the six browser-style tabs and panels are not one-to-one')
}
for (const tab of tabIds) {
  if (
    !html.includes(`id="tab-${tab}"`) ||
    !html.includes(`aria-controls="panel-${tab}"`) ||
    !html.includes(`aria-labelledby="tab-${tab}"`)
  ) {
    fail(`tab semantics are incomplete for ${tab}`)
  }
}
if (
  !pageScript.includes('ArrowRight') ||
  !pageScript.includes('ArrowLeft') ||
  !pageScript.includes("event.key === 'Home'") ||
  !pageScript.includes("event.key === 'End'") ||
  !pageScript.includes('desktop-material-lfs-atlas-tab-order-v1')
) {
  fail('tab roving focus, ordering, and persistence are incomplete')
}

if (count(html, /data-push-stage="[1-6]"/g) !== 6) {
  fail('the Cheap LFS publication walkthrough must have six exact stages')
}
for (const command of [
  'git remote get-url --push origin',
  'git show HEAD:path/to/large-file.bin',
  '\ngit push\n',
  'git fetch origin',
  'git rev-parse HEAD',
  "git rev-parse '@{upstream}'",
  'git push --set-upstream origin HEAD',
  'git lfs install',
  'git lfs track "*.psd"',
]) {
  if (!commandHtml.includes(command)) {
    fail(`the publication proof is missing command: ${command.trim()}`)
  }
}
if (count(html, /<pre[\s\S]*?tabindex="0"[\s\S]*?aria-label=/g) < 3) {
  fail('all command regions must be focusable and explicitly labelled')
}
for (const caveat of [
  'does not magically turn it into Cheap LFS',
  'Do not add restored raw bytes',
  'not equivalent to Desktop Material’s',
  'The pointers are not interchangeable',
  'Windows-only',
  'Pages does not natively dereference Cheap pointers',
  'Git LFS cannot be used with GitHub Pages',
]) {
  if (!html.includes(caveat) && !pageScript.includes(caveat)) {
    fail(`a required factual boundary is missing: ${caveat}`)
  }
}

if (
  !html.includes('docs/assets/site/docs-regex-job.js') ||
  !pageScript.includes('docs/assets/site/docs-hub-regex-worker.js') ||
  !pageScript.includes('budgetMilliseconds: 750')
) {
  fail('the shared 750 ms worker-isolated regex contract is not wired')
}
if (pageScript.includes('new RegExp') || pageScript.includes('showModal(')) {
  fail(
    'reader regex must never compile on the page thread and editors must stay nonmodal'
  )
}
for (const builderFeature of [
  'data-regex-token="literal"',
  'data-regex-token="[A-Za-z]"',
  'data-regex-token="^$"',
  'data-regex-token="()"',
  'data-regex-token="|"',
  'data-regex-token="+"',
  'data-regex-token="{2,4}"',
  'data-copy-regex',
  'data-apply-regex',
  'data-regex-matches',
]) {
  if (!html.includes(builderFeature)) {
    fail(`the bounded regex builder is missing ${builderFeature}`)
  }
}
if (
  !pageScript.includes('state.regexMode = false') ||
  !pageScript.includes("operation: 'builder'") ||
  !pageScript.includes("operation: 'search'")
) {
  fail(
    'plain-text default and worker-backed search/builder modes are incomplete'
  )
}

for (const localAsset of [
  'assets/cheap-lfs/comparison-orbit.svg',
  'assets/cheap-lfs/pointer-paths.svg',
]) {
  if (!html.includes(`src="${localAsset}"`)) {
    fail(`the marketing graphic is not used: ${localAsset}`)
  }
}
for (const [name, svg] of [
  ['comparison orbit', orbit],
  ['pointer paths', pathsGraphic],
]) {
  if (
    !svg.includes('<title') ||
    !svg.includes('<desc') ||
    /<script\b/i.test(svg) ||
    /(?:href|src)="https?:/i.test(svg)
  ) {
    fail(`${name} SVG is not self-contained and accessible`)
  }
}

for (const match of html.matchAll(
  /<(?:script|link|img)\b[^>]*(?:src|href)="([^"]+)"/g
)) {
  const target = match[1]
  if (/^(?:https?:)?\/\//.test(target)) {
    fail(`remote runtime dependency is forbidden: ${target}`)
  }
}

const resolvePublishedAsset = target => {
  const direct = join(publishRoot, target)
  if (existsSync(direct)) return direct
  const repositoryFallback = join(repositoryRoot, target)
  if (existsSync(repositoryFallback)) return repositoryFallback
  if (target.startsWith('docs/')) {
    const docsFallback = join(repositoryRoot, target)
    if (existsSync(docsFallback)) return docsFallback
  }
  return undefined
}
for (const match of html.matchAll(
  /\b(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g
)) {
  const target = match[1]
  if (/^(?:https?:|mailto:)/.test(target)) continue
  if (!resolvePublishedAsset(target)) {
    const extension = extname(target)
    if (extension !== '.html') {
      fail(`local runtime asset does not resolve: ${target}`)
    }
  }
}

const createDom = (stored = {}) => {
  const dom = new JSDOM(html, {
    url: 'https://example.test/cheap-lfs-vs-git-lfs.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  const { window } = dom
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  window.HTMLElement.prototype.scrollIntoView = () => {}
  if (window.HTMLDialogElement !== undefined) {
    window.HTMLDialogElement.prototype.show = function () {
      this.setAttribute('open', '')
    }
    window.HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open')
    }
  }
  for (const [key, value] of Object.entries(stored)) {
    window.localStorage.setItem(key, value)
  }
  window.DesktopMaterialRegexJob = {
    create: () => ({
      budgetMilliseconds: 750,
      cancel() {},
      run(_surface, payload, success, failure) {
        try {
          const flags = payload.flags.replace(/g/g, '')
          const regex = new RegExp(payload.pattern, flags)
          if (payload.operation === 'search') {
            const hits = []
            payload.catalog.forEach((fields, catalogIndex) => {
              regex.lastIndex = 0
              if (regex.test(fields.join(' '))) hits.push({ catalogIndex })
            })
            success({ ok: true, hits, total: hits.length })
            return
          }
          if (payload.operation === 'builder') {
            const global = new RegExp(
              payload.pattern,
              payload.flags.includes('g') ? payload.flags : payload.flags + 'g'
            )
            const matches = []
            let match
            while (
              matches.length < payload.maximumMatches &&
              (match = global.exec(payload.sample)) !== null
            ) {
              matches.push({
                value: { value: match[0] },
                index: match.index,
                captures: match.slice(1).map(value => ({ value })),
              })
              if (match[0] === '') global.lastIndex += 1
            }
            success({ ok: true, matches })
            return
          }
          failure('invalid-request', '')
        } catch (error) {
          failure('invalid', error.message)
        }
      },
    }),
  }
  window.eval(sharedScript)
  window.eval(pageScript)
  return dom
}

const dom = createDom({
  'desktop-material-lfs-atlas-category-v1': 'definitely-invalid',
  'desktop-material-lfs-atlas-outcome-v1': 'also-invalid',
})
const { window } = dom
const { document } = window
const tableRows = [...document.querySelectorAll('[data-row]')]
const cards = [...document.querySelectorAll('[data-card]')]
if (tableRows.length !== 72 || cards.length !== 72) {
  fail(
    `expected 72 rendered rows and cards, found ${tableRows.length}/${cards.length}`
  )
}
const ids = tableRows.map(row => row.id)
if (new Set(ids).size !== 72) {
  fail('comparison row IDs are not unique')
}
const categoryCounts = new Map()
for (const row of tableRows) {
  categoryCounts.set(
    row.dataset.category,
    (categoryCounts.get(row.dataset.category) ?? 0) + 1
  )
  if (
    row.querySelector('th[scope="row"]') === null ||
    row.querySelector('.copy.en') === null ||
    row.querySelector('.copy.yue[lang="zh-HK"]') === null
  ) {
    fail(`row ${row.id} is not semantic and bilingual`)
  }
  for (const sourceId of row.dataset.sourceIds.split(' ')) {
    if (document.querySelector(`#source-${sourceId.toLowerCase()}`) === null) {
      fail(`row ${row.id} references missing source ${sourceId}`)
    }
  }
}
if (
  categoryCounts.size !== 12 ||
  [...categoryCounts.values()].some(value => value !== 6)
) {
  fail('the comparison must contain exactly 12 categories × six rows')
}
if (document.querySelectorAll('.source-card').length !== 36) {
  fail('the source library must expose exactly 36 visible source entries')
}
if (document.querySelector('[data-visible-count]').textContent !== '72') {
  fail('invalid persisted filters did not fall back safely to all 72 rows')
}

for (const [category, expected] of categoryCounts) {
  document.querySelector(`[data-category="${category}"]`).click()
  const visible = tableRows.filter(row => !row.hidden)
  if (
    visible.length !== expected ||
    visible.some(row => row.dataset.category !== category)
  ) {
    fail(`category filter ${category} did not isolate its six rows`)
  }
}
document.querySelector('[data-category="all"]').click()
for (const outcome of ['cheap', 'git', 'tie', 'depends']) {
  document.querySelector(`[data-outcome="${outcome}"]`).click()
  const expected = tableRows.filter(row => row.dataset.outcome === outcome)
  const visible = tableRows.filter(row => !row.hidden)
  if (visible.length !== expected.length || visible.length === 0) {
    fail(`outcome filter ${outcome} did not report its DOM-derived count`)
  }
}
document.querySelector('[data-outcome="all"]').click()

const search = document.querySelector('#matrix-search')
search.value = 'encryption'
search.dispatchEvent(new window.Event('input', { bubbles: true }))
const plainCount = tableRows.filter(row => !row.hidden).length
if (plainCount === 0 || plainCount >= 72) {
  fail('plain-text search did not narrow the matrix')
}
document.querySelector('[data-category="security"]').click()
document.querySelector('[data-outcome="cheap"]').click()
if (
  tableRows.some(
    row =>
      !row.hidden &&
      (row.dataset.category !== 'security' || row.dataset.outcome !== 'cheap')
  )
) {
  fail('category, outcome, and text filters do not compose')
}

document.querySelector('[data-tab="matrix"]').click()
if (
  window.location.hash !== '#matrix' ||
  document.querySelector('[data-panel="matrix"]').hidden ||
  document.querySelector('[data-tab="matrix"]').tabIndex !== 0
) {
  fail('tab activation did not synchronize hash, panel, and roving focus')
}
document
  .querySelector('[data-tab="matrix"]')
  .dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'End', bubbles: true })
  )
if (document.querySelectorAll('[data-tab][tabindex="0"]').length !== 1) {
  fail('keyboard tab navigation lost the single roving tab stop')
}
document.querySelector('[data-tab-action="pin"]').click()
if (
  !window.localStorage
    .getItem('desktop-material-lfs-atlas-pinned-tabs-v1')
    .includes(document.querySelector('[data-tab][tabindex="0"]').dataset.tab)
) {
  fail('tab pinning did not persist')
}

const tone = document.querySelector('#funny-en')
const toneTarget = document.querySelector('[data-atlas-tone="en"]')
const oldTone = toneTarget.textContent
tone.value = '5'
tone.dispatchEvent(new window.Event('input', { bubbles: true }))
if (
  toneTarget.textContent === oldTone ||
  window.localStorage.getItem('desktop-material-funny-en') !== '5'
) {
  fail('the English funny level did not persist and alter visible copy')
}
document.querySelector('[data-set-language="yue"]').click()
if (document.documentElement.dataset.language !== 'yue') {
  fail('Cantonese mode did not activate')
}

document.querySelector('[data-tab="decision"]').click()
const fitInput = document.querySelector(
  '[data-fit-cheap="3"][data-fit-git="0"]'
)
fitInput.click()
if (
  document.querySelector('[data-fit-cheap-score]').textContent !== '3' ||
  !window.localStorage
    .getItem('desktop-material-lfs-atlas-fit-v1')
    .includes('0')
) {
  fail('the fit finder did not update and persist its signal')
}

document.querySelector('[data-open-regex]').click()
const pattern = document.querySelector('#regex-pattern')
pattern.value = 'Git\\s+LFS'
pattern.dispatchEvent(new window.Event('input', { bubbles: true }))
document.querySelector('[data-apply-regex]').click()
if (
  !document
    .querySelector('[data-search-mode-note]')
    .textContent.includes('Regex search') ||
  tableRows.filter(row => !row.hidden).length === 0
) {
  fail('the bounded regex builder did not synchronize into matrix search')
}

dom.window.close()

if (!pageStyle.includes('@media (max-width: 760px)')) {
  fail('the page lacks its narrow-screen matrix adaptation')
}
if (
  !pageStyle.includes('@media (prefers-reduced-motion: reduce)') ||
  !pageStyle.includes('@media (forced-colors: active)')
) {
  fail('reduced-motion and forced-colors contracts are missing')
}
if (!pageStyle.includes('min-height: 44px')) {
  fail('the page does not declare minimum 44 px interactive targets')
}

console.log(
  'Cheap LFS comparison atlas contract passed: 72 sourced differences, 12 categories, 6 browser-style tabs, 6 push stages, 36 source entries, 3 languages, 2 funny sliders, bounded worker regex, fit finder, and responsive SVG marketing graphics.'
)
