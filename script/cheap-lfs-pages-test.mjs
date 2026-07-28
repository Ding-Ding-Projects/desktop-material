import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publishRoot = resolve(repositoryRoot, process.argv[2] ?? 'site')
const pagePath = join(publishRoot, 'cheap-lfs.html')
const homePath = join(publishRoot, 'index.html')
const scriptPath = join(publishRoot, 'cheap-lfs.js')

const fail = message => {
  throw new Error(`Cheap LFS Pages contract: ${message}`)
}

if (!existsSync(pagePath)) fail('cheap-lfs.html is missing')
if (!existsSync(homePath)) fail('index.html is missing')
if (!existsSync(scriptPath)) fail('cheap-lfs.js is missing')

const html = readFileSync(pagePath, 'utf8')
const home = readFileSync(homePath, 'utf8')
const pageScript = readFileSync(scriptPath, 'utf8')
const count = pattern => html.match(pattern)?.length ?? 0

for (const homeTarget of [
  'href="cheap-lfs.html#push"',
  'href="cheap-lfs.html#compare"',
]) {
  if (!home.includes(homeTarget)) {
    fail(`the Pages homepage is missing its deep link: ${homeTarget}`)
  }
}
if (count(/<img\b/g) !== 17) {
  fail(`expected 17 guide images, found ${count(/<img\b/g)}`)
}
if (count(/concept-visual/g) !== 12) {
  fail(
    `expected 12 labelled concept visuals, found ${count(/concept-visual/g)}`
  )
}
if (count(/class="evidence-label"/g) !== 5) {
  fail(
    `expected five genuine UI evidence labels, found ${count(
      /class="evidence-label"/g
    )}`
  )
}
if (count(/data-set-language=/g) !== 3) {
  fail('English, Cantonese, and bilingual modes are required')
}
const hasFunnySlider = language =>
  new RegExp(
    `<input[\\s\\S]*?id="funny-${language}"[\\s\\S]*?type="range"[\\s\\S]*?min="1"[\\s\\S]*?max="5"`,
    'm'
  ).test(html)
if (!hasFunnySlider('en') || !hasFunnySlider('yue')) {
  fail('independent 1–5 English and Cantonese funny sliders are required')
}
if (
  !html.includes('data-tone-target="en"') ||
  !html.includes('data-tone-target="yue"')
) {
  fail('both language sliders must affect visible page tone')
}
if (!html.includes('lang="zh-HK"')) {
  fail('Cantonese copy must carry a Hong Kong language tag')
}
if (
  !html.includes('Cheap LFS is not encryption') ||
  !html.includes('Cheap LFS 唔等於加密')
) {
  fail('the bilingual encryption boundary is missing')
}

for (const section of ['push', 'compare']) {
  if (!html.includes(`id="${section}"`)) {
    fail(`the #${section} section is missing`)
  }
  if (!html.includes(`href="#${section}"`)) {
    fail(`the #${section} section is not discoverable from a page link`)
  }
}

if (
  !html.includes('<code>git push</code> is not a pin button') ||
  !html.includes('<code>git push</code> 唔係 pin 掣')
) {
  fail(
    'the bilingual warning that plain git push is not a pin action is missing'
  )
}
for (const [label, command] of [
  ['git remote get-url --push origin', /git remote get-url --push origin/],
  [
    'git show HEAD:path/to/large-file.bin',
    /git show HEAD:path\/to\/large-file\.bin/,
  ],
  ['git push', /(^|\r?\n)git push\r?\n/],
  [
    'git push --set-upstream origin HEAD',
    /git push --set-upstream origin HEAD/,
  ],
  ['git fetch origin', /git fetch origin/],
  ['git rev-parse HEAD', /git rev-parse HEAD/],
  ["git rev-parse '@{upstream}'", /git rev-parse '@\{upstream\}'/],
]) {
  if (!command.test(html)) {
    fail(`the push walkthrough is missing command: ${label}`)
  }
}
if (html.includes('git diff -- path/to/large-file.bin')) {
  fail(
    'the walkthrough must inspect the committed pointer, not raw worktree diff'
  )
}
if (
  count(/class="push-flow-number"/g) !== 6 ||
  !['01', '02', '03', '04', '05', '06'].every(stage =>
    html.includes(`class="push-flow-number">${stage}</span>`)
  )
) {
  fail('the push walkthrough needs six ordered stages')
}
if (
  count(/<pre[\s\S]*?tabindex="0"[\s\S]*?aria-labelledby=/g) < 2 ||
  !html.includes('do not <code>git add</code> the raw file')
) {
  fail(
    'the safe command blocks must be labelled, focusable, and warn against adding raw bytes'
  )
}
if (
  !/heavy bytes go first/i.test(html) ||
  !html.includes('Provider first') ||
  !html.includes('Pointer commit second')
) {
  fail('the provider-first pointer-push sequence is incomplete')
}

const comparisonRows = [
  ...html.matchAll(/<tr class="comparison-row">([\s\S]*?)<\/tr>/g),
]
if (comparisonRows.length !== 30) {
  fail(`expected 30 comparison criteria, found ${comparisonRows.length}`)
}
for (const [index, row] of comparisonRows.entries()) {
  if (!/<th scope="row">/.test(row[1])) {
    fail(`comparison criterion ${index + 1} has no semantic row header`)
  }
  if (
    !/class="copy en"/.test(row[1]) ||
    !/class="copy yue" lang="zh-HK"/.test(row[1])
  ) {
    fail(`comparison criterion ${index + 1} is not bilingual`)
  }
}
if (count(/data-comparison-group=/g) !== 5) {
  fail('expected five filterable comparison groups')
}
if (count(/data-comparison-filter=/g) !== 6) {
  fail('expected the All filter plus five comparison category filters')
}
if (
  count(/scope="rowgroup"/g) !== 5 ||
  html.includes('scope="colgroup"') ||
  !html.includes('aria-live="polite" aria-atomic="true"')
) {
  fail('comparison group headers and live result count are not fully semantic')
}
if (
  !/<caption[\s\S]*?class="visually-hidden copy-stack"[\s\S]*?class="copy en"[\s\S]*?class="copy yue" lang="zh-HK"[\s\S]*?<\/caption>/.test(
    html
  )
) {
  fail('the comparison table needs a bilingual semantic caption')
}
if (
  !/Pick\s*<b>Git LFS<\/b>/.test(html) ||
  !html.includes('standard, cross-platform ecosystem') ||
  !html.includes('Git LFS 佔優')
) {
  fail('honest choose-Git-LFS fit guidance is missing')
}
for (const source of [
  'https://git-lfs.com/',
  'https://github.com/git-lfs/git-lfs/blob/main/docs/spec.md',
  'https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-track.adoc',
  'https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-migrate.adoc',
  'https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-config.adoc',
  'https://github.com/git-lfs/git-lfs/blob/main/docs/api/locking.md',
  'https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage',
  'https://docs.github.com/en/repositories/working-with-files/managing-large-files/collaboration-with-git-large-file-storage',
  'https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github',
  'https://docs.github.com/en/billing/concepts/product-billing/git-lfs',
  'https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases',
]) {
  if (!html.includes(`href="${source}"`)) {
    fail(`the comparison is missing its official source: ${source}`)
  }
}
if (
  !html.includes('No Git LFS meter is used') ||
  !html.includes('quotas,') ||
  !html.includes('terms still apply')
) {
  fail('the provider-cost boundary must reject free or unlimited implications')
}
for (const behavior of [
  'data-comparison-filter',
  'data-comparison-group',
  'group.hidden = !visible',
  'desktop-material-cheap-lfs-comparison-filter',
]) {
  if (!pageScript.includes(behavior)) {
    fail(`comparison filter behavior is missing: ${behavior}`)
  }
}

const conceptDirectory = join(publishRoot, 'assets', 'cheap-lfs')
const conceptFiles = existsSync(conceptDirectory)
  ? readdirSync(conceptDirectory).filter(file => file.endsWith('.webp'))
  : []
if (conceptFiles.length !== 12) {
  fail(
    `expected 12 optimized WebP concept assets, found ${conceptFiles.length}`
  )
}

const localSources = [...html.matchAll(/\bsrc="([^"]+)"/g)].map(
  match => match[1]
)
for (const source of localSources) {
  const publishedPath = join(publishRoot, source)
  const sourceTreeFallback =
    publishRoot === join(repositoryRoot, 'site')
      ? join(repositoryRoot, source)
      : undefined
  if (
    !existsSync(publishedPath) &&
    (!sourceTreeFallback || !existsSync(sourceTreeFallback))
  ) {
    fail(`published asset does not resolve: ${source}`)
  }
}

const dom = new JSDOM(html, {
  url: 'https://example.test/cheap-lfs.html',
  runScripts: 'outside-only',
})
dom.window.matchMedia = () => ({ matches: false })
dom.window.eval(pageScript)

const comparisonGroups = [
  ...dom.window.document.querySelectorAll('[data-comparison-group]'),
]
for (const group of comparisonGroups) {
  const name = group.dataset.comparisonGroup
  const filter = dom.window.document.querySelector(
    `[data-comparison-filter="${name}"]`
  )
  filter.click()
  const visibleNames = comparisonGroups
    .filter(candidate => !candidate.hidden)
    .map(candidate => candidate.dataset.comparisonGroup)
  if (visibleNames.join(',') !== name) {
    fail(`the ${name} filter did not hide the other comparison groups`)
  }
  if (
    dom.window.document.querySelector('[data-comparison-count]').textContent !==
    '6'
  ) {
    fail(`the ${name} filter did not report its six decision rows`)
  }
  if (filter.getAttribute('aria-pressed') !== 'true') {
    fail(`the ${name} filter did not expose aria-pressed=true`)
  }
  if (
    dom.window.localStorage.getItem(
      'desktop-material-cheap-lfs-comparison-filter'
    ) !== name
  ) {
    fail(`the ${name} filter did not persist`)
  }
}
dom.window.document.querySelector('[data-comparison-filter="all"]').click()
if (
  comparisonGroups.some(group => group.hidden) ||
  dom.window.document.querySelector('[data-comparison-count]').textContent !==
    '30'
) {
  fail('the All filter did not restore all 30 comparison rows')
}
dom.window.close()

console.log(
  `Cheap LFS Pages contract passed: 30 cross-checked comparison criteria, 6 safe push stages, 17 images, 12 concepts, 5 genuine UI captures, 3 language modes, and 2 persisted funny sliders.`
)
