// Shared knowledge about the third-party assets the published Material Design 3
// site depends on, so the vendoring step and the Pages contract test cannot
// drift apart. `vendor-site-assets.mjs` downloads what this module describes;
// `site-dc-pages-test.mjs` proves the published tree matches it.

/**
 * The Design Component sources that render through `site/support.js`. Both are
 * scanned for icon ligatures and Cantonese copy, because a glyph the Listbox
 * asks for is just as missing as one the page asks for.
 */
export const DC_SOURCE_FILES = ['index.html', 'Listbox.dc.html']

/** Pinned runtime versions. These are the exact URLs `site/support.js` asks for. */
export const RUNTIME_RESOURCES = [
  {
    url: 'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
    local: 'vendor/react.production.min.js',
    // The subresource-integrity digest support.js carries for this URL. The
    // vendoring step re-derives it from the bytes it downloaded and refuses to
    // write a file whose digest disagrees, so a mirror that served something
    // else fails at vendoring time rather than in a visitor's browser.
    sri: 'sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z',
  },
  {
    url: 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
    local: 'vendor/react-dom.production.min.js',
    sri: 'sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1',
  },
]

/**
 * Icon ligatures the template asks for through a computed expression rather
 * than a literal `icon:` property, so no amount of scanning finds them. Each
 * one names the expression it comes from; when that expression changes, this
 * list changes with it.
 */
export const COMPUTED_ICONS = [
  // renderVals(): themeIcon
  'light_mode',
  'dark_mode',
  // renderVals(): command-palette row icons
  'play_arrow',
  'tune',
  'my_location',
  // renderVals(): notification and toast kind icons
  'error',
  'check_circle',
  'info',
]

/** Unicode blocks whose glyphs the Cantonese copy needs from Noto Sans HK. */
const CJK_RANGES = [
  [0x3000, 0x303f], // CJK symbols and punctuation — 、。「」
  [0x3400, 0x4dbf], // CJK unified ideographs extension A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xff00, 0xffef], // Halfwidth and fullwidth forms — ！，：；
]

const isCjk = codePoint =>
  CJK_RANGES.some(([low, high]) => codePoint >= low && codePoint <= high)

/**
 * Every Material Symbols ligature the page names literally: the `font-family`
 * spans in the template and the `icon:` properties in the logic class. Computed
 * ones live in COMPUTED_ICONS above.
 */
export function literalIconNames(html) {
  const names = new Set()
  const spans = /Material Symbols Outlined'[^>]*>([^<{}]+)</g
  let match
  while ((match = spans.exec(html)) !== null) {
    const name = match[1].trim()
    if (/^[a-z0-9_]+$/.test(name)) names.add(name)
  }
  const properties = /\bicon\s*:\s*(['"])([a-z0-9_]+)\1/g
  while ((match = properties.exec(html)) !== null) names.add(match[2])
  return names
}

/** The literal set plus the computed one — what the subset has to cover. */
export function requiredIconNames(html) {
  return new Set([...literalIconNames(html), ...COMPUTED_ICONS])
}

/** Every CJK code point the page actually renders, as a sorted character array. */
export function requiredCjkCharacters(html) {
  const found = new Set()
  for (const character of html) {
    if (isCjk(character.codePointAt(0))) found.add(character)
  }
  return [...found].sort()
}

/**
 * Font families to vendor. `subsets` filters Google's `/* latin *\/`-style
 * section comments; a family that is subsetted by content (icons, CJK text)
 * returns a single unlabelled face instead and sets `subsets` to null.
 */
export function fontRequests({ iconNames, cjkText }) {
  return [
    {
      id: 'roboto-flex',
      family: 'Roboto Flex',
      query:
        'family=Roboto+Flex:opsz,wght@8..144,400..700&display=swap',
      subsets: ['latin', 'latin-ext'],
    },
    {
      id: 'roboto-mono',
      family: 'Roboto Mono',
      query: 'family=Roboto+Mono:wght@400..500&display=swap',
      subsets: ['latin', 'latin-ext'],
    },
    {
      id: 'material-symbols-outlined',
      family: 'Material Symbols Outlined',
      // `display=block` keeps a ligature word such as `dark_mode` from flashing
      // as text before the icon face arrives.
      query: `family=Material+Symbols+Outlined:opsz,wght@20..48,400&icon_names=${[
        ...iconNames,
      ]
        .sort()
        .join(',')}&display=block`,
      subsets: null,
      covers: [...iconNames].sort(),
    },
    {
      id: 'noto-sans-hk',
      family: 'Noto Sans HK',
      query: `family=Noto+Sans+HK:wght@400;500;700&text=${encodeURIComponent(
        cjkText.join('')
      )}&display=swap`,
      subsets: null,
      covers: cjkText,
    },
  ]
}

/**
 * The eight documentation categories the site's Docs hub advertises, in the
 * order the cards appear, paired with the directory each card links into.
 * `linux-tui` is deliberately absent: the hub covers the Windows desktop
 * application, and the terminal edition is documented but not advertised here.
 */
export const DOC_CATEGORIES = [
  { id: 'dc1', dir: 'design-system' },
  { id: 'dc2', dir: 'repository-management' },
  { id: 'dc3', dir: 'review-and-diff' },
  { id: 'dc4', dir: 'collaboration' },
  { id: 'dc5', dir: 'integrations' },
  { id: 'dc6', dir: 'agent-api' },
  { id: 'dc7', dir: 'quality-and-reliability' },
  { id: 'dc8', dir: 'identity-and-workspace' },
]

/**
 * Counts the articles behind each hub card and the whole rendered tree, so the
 * numbers the site prints are derived from `docs/` rather than remembered. A
 * category's README is its index, not an article, so it is not counted; the
 * site-wide total counts every Markdown file the Pages build renders, README
 * indexes included, because each one becomes a published page.
 */
export function countDocs(readdirRecursive) {
  const perCategory = {}
  for (const category of DOC_CATEGORIES) {
    perCategory[category.dir] = readdirRecursive(
      `docs/features/${category.dir}`
    ).filter(name => name.endsWith('.md') && !name.endsWith('README.md')).length
  }
  const total = readdirRecursive('docs').filter(name =>
    name.endsWith('.md')
  ).length
  return { perCategory, total }
}

/** Hosts the published site is allowed to name at all. */
export const ALLOWED_REMOTE_HOSTS = new Set([
  // Real destinations a visitor clicks, not assets the page loads.
  'github.com',
  // The install one-liner the Overview page shows as copyable text.
  'raw.githubusercontent.com',
])
