import { readFile, writeFile } from 'node:fs/promises'

// vinext 0.0.50 builds its standalone static-file cache keys with
// path.relative(). On Windows that produces backslashes, so URL paths such as
// /assets/app.js miss the cache even though the files are present. Normalize
// the generated cache key exactly as the Linux Docker runtime already does.
const target = new URL(
  '../dist/standalone/node_modules/vinext/dist/server/static-file-cache.js',
  import.meta.url
)
const source = await readFile(target, 'utf8')
const before = 'relativePath: path.relative(base, batch[j]),'
const after =
  'relativePath: path.relative(base, batch[j]).split(path.sep).join("/"),'

if (!source.includes(before)) {
  throw new Error(
    'vinext standalone cache layout changed; review the Windows path fix'
  )
}

await writeFile(target, source.replace(before, after), 'utf8')
