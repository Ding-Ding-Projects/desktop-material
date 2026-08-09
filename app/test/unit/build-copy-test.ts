import assert from 'node:assert'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  assertRendererBundlesAreRunnable,
  copyStaticResourceTree,
  getSelfHostedServerExtraResourcePath,
  keepNodeProcessAliveUntil,
  removeAndCopy,
} from '../../../script/build'

describe('build copying', () => {
  it('keeps Node alive until asynchronous packaging settles', async () => {
    const timer = {} as ReturnType<typeof setInterval>
    let scheduledDelay: number | undefined
    let clearedHandle: ReturnType<typeof setInterval> | undefined
    let resolveBuild: ((value: string) => void) | undefined
    const build = new Promise<string>(resolve => {
      resolveBuild = resolve
    })

    const result = keepNodeProcessAliveUntil(
      build,
      (_callback, delay) => {
        scheduledDelay = delay
        return timer
      },
      handle => {
        clearedHandle = handle
      }
    )

    assert.equal(scheduledDelay, 60_000)
    assert.equal(clearedHandle, undefined)

    resolveBuild?.('packaged')

    assert.equal(await result, 'packaged')
    assert.equal(clearedHandle, timer)
  })

  it('routes the CLI build through the process keep-alive lifecycle', () => {
    const source = readFileSync(
      join(process.cwd(), 'script', 'build.ts'),
      'utf8'
    )
    assert.match(source, /void keepNodeProcessAliveUntil\(buildPromise\)/)
  })

  it('rejects renderer bundles with an undefined Webpack module binding', () => {
    const root = mkdtempSync(join(tmpdir(), 'desktop-renderer-bundle-test-'))
    const rendererPath = join(root, 'renderer.js')
    const internalBrowserPath = join(root, 'internal-browser.js')

    try {
      writeFileSync(rendererPath, 'window.start(); __webpack_module__')
      writeFileSync(internalBrowserPath, 'window.start();')

      assert.throws(
        () => assertRendererBundlesAreRunnable(root),
        /undefined Webpack module binding/
      )

      writeFileSync(rendererPath, 'window.start();')
      writeFileSync(internalBrowserPath, 'window.start(); __webpack_module__')
      assert.throws(
        () => assertRendererBundlesAreRunnable(root),
        /undefined Webpack module binding/
      )

      writeFileSync(internalBrowserPath, 'window.start();')
      assert.doesNotThrow(() => assertRendererBundlesAreRunnable(root))

      rmSync(rendererPath)
      assert.throws(
        () => assertRendererBundlesAreRunnable(root),
        /Missing renderer bundle required for startup:.*renderer\.js/
      )

      writeFileSync(rendererPath, 'window.start();')
      rmSync(internalBrowserPath)
      assert.throws(
        () => assertRendererBundlesAreRunnable(root),
        /Missing renderer bundle required for startup:.*internal-browser\.js/
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('ships the immutable self-hosted server build context as an extra resource', () => {
    const resource = getSelfHostedServerExtraResourcePath(process.cwd())
    assert.equal(
      resource,
      join(process.cwd(), 'services', 'desktop-material-server')
    )
    for (const file of [
      'compose.yml',
      'Dockerfile',
      'package.json',
      'server.mjs',
    ]) {
      const entry = join(resource, file)
      assert.equal(lstatSync(entry).isFile(), true)
      assert.equal(lstatSync(entry).isSymbolicLink(), false)
    }
  })

  it('dereferences a directory link before removing destination children', () => {
    const root = mkdtempSync(join(tmpdir(), 'desktop-build-copy-test-'))

    try {
      const sourceTarget = join(root, 'source-target')
      const sourceLink = join(root, 'source-link')
      const destination = join(root, 'destination')
      const sourceUnicodeFile = join(
        sourceTarget,
        'unicode',
        'source-must-survive.txt'
      )

      mkdirSync(join(sourceTarget, 'unicode'), { recursive: true })
      writeFileSync(sourceUnicodeFile, 'source content')
      symlinkSync(
        sourceTarget,
        sourceLink,
        process.platform === 'win32' ? 'junction' : 'dir'
      )

      removeAndCopy(sourceLink, destination)

      assert.equal(lstatSync(sourceLink).isSymbolicLink(), true)
      assert.equal(lstatSync(destination).isSymbolicLink(), false)
      assert.equal(
        readFileSync(
          join(destination, 'unicode', 'source-must-survive.txt'),
          'utf8'
        ),
        'source content'
      )

      rmSync(join(destination, 'unicode'), { recursive: true, force: true })

      assert.equal(existsSync(join(destination, 'unicode')), false)
      assert.equal(readFileSync(sourceUnicodeFile, 'utf8'), 'source content')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects nested links instead of copying outside-tree contents', () => {
    const root = mkdtempSync(join(tmpdir(), 'desktop-build-copy-test-'))

    try {
      const source = join(root, 'source')
      const outside = join(root, 'outside')
      const nestedLink = join(source, 'nested-link')
      const destination = join(root, 'destination')
      const outsideFile = join(outside, 'must-not-be-copied.txt')

      mkdirSync(source, { recursive: true })
      mkdirSync(outside, { recursive: true })
      writeFileSync(outsideFile, 'outside content')
      symlinkSync(
        outside,
        nestedLink,
        process.platform === 'win32' ? 'junction' : 'dir'
      )

      assert.throws(
        () => removeAndCopy(source, destination),
        /Refusing to copy nested symbolic link from build input/
      )
      assert.equal(readFileSync(outsideFile, 'utf8'), 'outside content')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('materializes contained static-resource file links', () => {
    const root = mkdtempSync(join(tmpdir(), 'desktop-build-copy-test-'))

    try {
      const source = join(root, 'source')
      const destination = join(root, 'destination')
      const target = join(source, 'templates', 'Canonical.gitignore')
      const alias = join(source, 'Alias.gitignore')

      mkdirSync(join(source, 'templates'), { recursive: true })
      writeFileSync(target, 'canonical content')
      symlinkSync(join('templates', 'Canonical.gitignore'), alias, 'file')

      copyStaticResourceTree(source, destination)

      const copiedAlias = join(destination, 'Alias.gitignore')
      assert.equal(lstatSync(copiedAlias).isSymbolicLink(), false)
      assert.equal(lstatSync(copiedAlias).isFile(), true)
      assert.equal(readFileSync(copiedAlias, 'utf8'), 'canonical content')
      assert.equal(
        readFileSync(
          join(destination, 'templates', 'Canonical.gitignore'),
          'utf8'
        ),
        'canonical content'
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects static-resource file links that escape the source tree', () => {
    const root = mkdtempSync(join(tmpdir(), 'desktop-build-copy-test-'))

    try {
      const source = join(root, 'source')
      const outside = join(root, 'outside.txt')
      const alias = join(source, 'Alias.gitignore')
      const destination = join(root, 'destination')

      mkdirSync(source, { recursive: true })
      writeFileSync(outside, 'outside content')
      symlinkSync(join('..', 'outside.txt'), alias, 'file')

      assert.throws(
        () => copyStaticResourceTree(source, destination),
        /Static resource link escapes its source tree/
      )
      assert.equal(readFileSync(outside, 'utf8'), 'outside content')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects static-resource directory links', () => {
    const root = mkdtempSync(join(tmpdir(), 'desktop-build-copy-test-'))

    try {
      const source = join(root, 'source')
      const target = join(source, 'target')
      const linkedDirectory = join(source, 'linked-directory')
      const destination = join(root, 'destination')

      mkdirSync(target, { recursive: true })
      writeFileSync(join(target, 'resource.txt'), 'resource content')
      symlinkSync(
        target,
        linkedDirectory,
        process.platform === 'win32' ? 'junction' : 'dir'
      )

      assert.throws(
        () => copyStaticResourceTree(source, destination),
        /Static resource links must target regular files/
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects static-resource links with unsupported missing targets', () => {
    const root = mkdtempSync(join(tmpdir(), 'desktop-build-copy-test-'))

    try {
      const source = join(root, 'source')
      const brokenLink = join(source, 'broken.txt')
      const destination = join(root, 'destination')

      mkdirSync(source, { recursive: true })
      symlinkSync('missing.txt', brokenLink, 'file')

      assert.throws(
        () => copyStaticResourceTree(source, destination),
        /Static resource link has an unsupported or missing target/
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects dangling destination links before copying outside the tree', () => {
    const root = mkdtempSync(join(tmpdir(), 'desktop-build-copy-test-'))

    try {
      const source = join(root, 'source')
      const destination = join(root, 'destination')
      const outsideTarget = join(root, 'outside-created.txt')
      const destinationLink = join(destination, 'resource.txt')

      mkdirSync(source, { recursive: true })
      mkdirSync(destination, { recursive: true })
      writeFileSync(join(source, 'resource.txt'), 'source content')
      symlinkSync(outsideTarget, destinationLink, 'file')

      assert.throws(
        () => copyStaticResourceTree(source, destination),
        /Static resource destination file is unsafe/
      )
      assert.equal(existsSync(outsideTarget), false)
      assert.equal(lstatSync(destinationLink).isSymbolicLink(), true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('preserves platform files when merging common static resources', () => {
    const root = mkdtempSync(join(tmpdir(), 'desktop-build-copy-test-'))

    try {
      const platformSource = join(root, 'platform')
      const commonSource = join(root, 'common')
      const destination = join(root, 'destination')

      mkdirSync(platformSource, { recursive: true })
      mkdirSync(commonSource, { recursive: true })
      writeFileSync(join(platformSource, 'shared.txt'), 'platform content')
      writeFileSync(join(commonSource, 'shared.txt'), 'common content')
      writeFileSync(join(commonSource, 'common-only.txt'), 'common only')

      copyStaticResourceTree(platformSource, destination)
      copyStaticResourceTree(commonSource, destination, { force: false })

      assert.equal(
        readFileSync(join(destination, 'shared.txt'), 'utf8'),
        'platform content'
      )
      assert.equal(
        readFileSync(join(destination, 'common-only.txt'), 'utf8'),
        'common only'
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
