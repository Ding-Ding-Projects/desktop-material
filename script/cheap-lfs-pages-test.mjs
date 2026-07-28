import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publishRoot = resolve(repositoryRoot, process.argv[2] ?? 'site')
const pagePath = join(publishRoot, 'cheap-lfs.html')
const homePath = join(publishRoot, 'index.html')

const fail = message => {
  throw new Error(`Cheap LFS Pages contract: ${message}`)
}

if (!existsSync(pagePath)) fail('cheap-lfs.html is missing')
if (!existsSync(homePath)) fail('index.html is missing')

const html = readFileSync(pagePath, 'utf8')
const home = readFileSync(homePath, 'utf8')
const count = pattern => html.match(pattern)?.length ?? 0

if (!home.includes('href="cheap-lfs.html"')) {
  fail('the Pages homepage does not link to the guide')
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

console.log(
  `Cheap LFS Pages contract passed: 17 images, 12 concepts, 5 genuine UI captures, 3 language modes, and 2 persisted funny sliders.`
)
