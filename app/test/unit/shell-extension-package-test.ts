import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  IShellExtensionManifestOptions,
  ShellExtensionClsid,
  ShellExtensionPackageName,
  assertPackageRelativePath,
  buildQueryPackageArguments,
  buildRegisterPackageArguments,
  buildShellExtensionManifest,
  buildUnregisterPackageArguments,
  decideContextMenuMode,
  decideShellExtensionPackageSource,
  escapeXml,
  formatX500Publisher,
  manifestClsid,
  parsePackageRegistrationOutput,
} from '../../src/lib/shell-extension-package'

// Generation-only coverage. Nothing here registers a package, writes a
// certificate store, or touches Windows security settings.

function options(
  overrides: Partial<IShellExtensionManifestOptions> = {}
): IShellExtensionManifestOptions {
  return {
    publisher: formatX500Publisher('GitHub, Inc.'),
    publisherDisplayName: 'GitHub, Inc.',
    dllPath: 'shell-extension\\DesktopMaterialShellExtension.dll',
    executablePath: 'GitHubDesktop.exe',
    assetsPath: 'shell-extension\\Assets',
    ...overrides,
  }
}

describe('shell extension package', () => {
  describe('publisher formatting', () => {
    it('quotes a value containing a comma', () => {
      // The manifest schema rejects an unquoted comma; this only surfaces at
      // packaging time, so it is pinned here.
      assert.equal(formatX500Publisher('GitHub, Inc.'), 'CN="GitHub, Inc."')
    })

    it('leaves a simple name unquoted', () => {
      assert.equal(formatX500Publisher('Example'), 'CN=Example')
    })

    it('refuses a name containing a double quote', () => {
      assert.throws(() => formatX500Publisher('a"b'), /double quote/)
    })
  })

  describe('clsid formatting', () => {
    it('strips braces and lower-cases for the manifest', () => {
      assert.equal(
        manifestClsid('{6E2F4C1A-6E5D-4D5B-9D3F-3F0B2A7C9D41}'),
        '6e2f4c1a-6e5d-4d5b-9d3f-3f0b2a7c9d41'
      )
    })

    it('rejects a malformed clsid', () => {
      assert.throws(() => manifestClsid('not-a-guid'), /well-formed/)
    })

    it('matches the CLSID compiled into the COM server', () => {
      // The manifest and the DLL must name the same class or Explorer loads
      // nothing. Read the C++ source rather than trusting a comment.
      const source = readFileSync(
        join(process.cwd(), 'shell-extension', 'src', 'dllmain.cpp'),
        'utf8'
      )
      const match =
        /CLSID_DesktopMaterialCommand\s*=\s*\{\s*(0x[0-9a-f]+),\s*(0x[0-9a-f]+),\s*(0x[0-9a-f]+),\s*\{([^}]*)\}/i.exec(
          source
        )
      assert.notEqual(match, null, 'CLSID not found in dllmain.cpp')

      const bytes = match![4]
        .split(',')
        .map(value => Number(value.trim()))
        .map(value => value.toString(16).padStart(2, '0'))

      const fromSource = [
        Number(match![1]).toString(16).padStart(8, '0'),
        Number(match![2]).toString(16).padStart(4, '0'),
        Number(match![3]).toString(16).padStart(4, '0'),
        bytes.slice(0, 2).join(''),
        bytes.slice(2).join(''),
      ].join('-')

      assert.equal(fromSource, manifestClsid(ShellExtensionClsid))
    })
  })

  describe('package-relative paths', () => {
    it('normalises separators', () => {
      assert.equal(assertPackageRelativePath('a/b/c.dll'), 'a\\b\\c.dll')
    })

    it('refuses an absolute path', () => {
      assert.throws(
        () => assertPackageRelativePath('C:\\Windows\\evil.dll'),
        /absolute/
      )
      assert.throws(() => assertPackageRelativePath('\\evil.dll'), /absolute/)
    })

    it('refuses upward traversal', () => {
      // A traversal segment would point the shell at a binary outside the app's
      // own install directory.
      assert.throws(
        () => assertPackageRelativePath('..\\..\\evil.dll'),
        /traverse/
      )
      assert.throws(() => assertPackageRelativePath('a/../../b'), /traverse/)
    })

    it('refuses an empty path', () => {
      assert.throws(() => assertPackageRelativePath(''), /empty/)
    })
  })

  describe('xml escaping', () => {
    it('escapes every significant character', () => {
      assert.equal(escapeXml(`a&b<c>d"e'f`), 'a&amp;b&lt;c&gt;d&quot;e&apos;f')
    })
  })

  describe('manifest generation', () => {
    it('declares the COM server and both Explorer surfaces', () => {
      const manifest = buildShellExtensionManifest(options())

      assert.match(manifest, /Category="windows\.comServer"/)
      assert.match(manifest, /Category="windows\.fileExplorerContextMenus"/)
      assert.match(manifest, /<desktop5:ItemType Type="Directory">/)
      assert.match(manifest, /<desktop5:ItemType Type="Directory\\Background">/)
    })

    it('uses desktop5 item types, which are the ones that accept Directory', () => {
      // desktop4's own ItemType only accepts file extensions and '*'; using it
      // for a folder fails MSIX schema validation at pack time.
      const manifest = buildShellExtensionManifest(options())
      assert.match(
        manifest,
        /xmlns:desktop5="http:\/\/schemas\.microsoft\.com\/appx\/manifest\/desktop\/windows10\/5"/
      )
      assert.equal(/<desktop4:ItemType/.test(manifest), false)
    })

    it('marks the package sparse', () => {
      // Without AllowExternalContent the binaries would have to be copied into
      // a package root instead of staying in the app's install directory.
      assert.match(
        buildShellExtensionManifest(options()),
        /<uap10:AllowExternalContent>true<\/uap10:AllowExternalContent>/
      )
    })

    it('binds every verb to the compiled CLSID in bare form', () => {
      const manifest = buildShellExtensionManifest(options())
      const bare = manifestClsid()
      assert.equal(manifest.includes(ShellExtensionClsid), false)
      assert.equal(
        (manifest.match(new RegExp(bare, 'g')) ?? []).length,
        3,
        'expected the CLSID on the com:Class and both verbs'
      )
    })

    it('requires Windows 11', () => {
      assert.match(
        buildShellExtensionManifest(options()),
        /MinVersion="10\.0\.22000\.0"/
      )
    })

    it('keeps the package out of the app list', () => {
      // It is a shell extension, not an app the user launches.
      assert.match(
        buildShellExtensionManifest(options()),
        /AppListEntry="none"/
      )
    })

    it('rejects a traversing dll path', () => {
      assert.throws(
        () => buildShellExtensionManifest(options({ dllPath: '..\\evil.dll' })),
        /traverse/
      )
    })

    it('escapes a publisher display name containing markup', () => {
      const manifest = buildShellExtensionManifest(
        options({ publisherDisplayName: 'A & B <script>' })
      )
      assert.match(manifest, /A &amp; B &lt;script&gt;/)
      assert.equal(manifest.includes('<script>'), false)
    })
  })

  describe('registration commands', () => {
    it('registers loosely against an external location', () => {
      // A loose -Register needs no signature, so no certificate is ever
      // installed into a trust store.
      const args = buildRegisterPackageArguments(
        'C:\\app\\shell-extension\\AppxManifest.xml',
        'C:\\app'
      )
      assert.ok(args.includes('-Register'))
      assert.ok(args.includes('-ExternalLocation'))
      assert.ok(args.includes('C:\\app'))
      assert.ok(args.includes('-NonInteractive'))
      assert.equal(
        args.some(arg =>
          /Import-Certificate|Cert:|New-SelfSignedCertificate/.test(arg)
        ),
        false,
        'registration must never touch a certificate store'
      )
    })

    it('unregisters by package name', () => {
      const args = buildUnregisterPackageArguments()
      assert.ok(args.some(arg => arg.includes(ShellExtensionPackageName)))
      assert.ok(args.some(arg => arg.includes('Remove-AppxPackage')))
    })

    it('queries registration and parses the answer', () => {
      assert.ok(
        buildQueryPackageArguments().some(arg =>
          arg.includes(ShellExtensionPackageName)
        )
      )
      assert.equal(parsePackageRegistrationOutput('registered\r\n'), true)
      assert.equal(parsePackageRegistrationOutput('  Registered '), true)
      assert.equal(parsePackageRegistrationOutput('absent\n'), false)
      assert.equal(parsePackageRegistrationOutput(''), false)
    })
  })

  describe('mode decision', () => {
    const capable = {
      isWindows11OrLater: true,
      packagePresent: true,
      canRegisterLoosePackage: true,
      packageRegistered: false,
    }

    it('reports modern when the package is registered', () => {
      assert.deepEqual(
        decideContextMenuMode({ ...capable, packageRegistered: true }, false),
        { mode: 'modern', modernBlocker: null }
      )
    })

    it('trusts registration over the prerequisite checks', () => {
      // If the package is live the menu really is modern, whatever Developer
      // Mode now says.
      assert.deepEqual(
        decideContextMenuMode(
          {
            isWindows11OrLater: true,
            packagePresent: true,
            canRegisterLoosePackage: false,
            packageRegistered: true,
          },
          true
        ),
        { mode: 'modern', modernBlocker: null }
      )
    })

    it('falls back to classic and names the blocker', () => {
      assert.deepEqual(decideContextMenuMode(capable, true), {
        mode: 'classic',
        modernBlocker: null,
      })
      assert.deepEqual(
        decideContextMenuMode({ ...capable, isWindows11OrLater: false }, true),
        { mode: 'classic', modernBlocker: 'requires-windows-11' }
      )
      assert.deepEqual(
        decideContextMenuMode({ ...capable, packagePresent: false }, true),
        { mode: 'classic', modernBlocker: 'package-missing' }
      )
      assert.deepEqual(
        decideContextMenuMode(
          { ...capable, canRegisterLoosePackage: false },
          true
        ),
        { mode: 'classic', modernBlocker: 'developer-mode-required' }
      )
    })

    it('reports none when nothing is installed', () => {
      assert.deepEqual(decideContextMenuMode(capable, false), {
        mode: 'none',
        modernBlocker: null,
      })
    })

    it('reports the most fundamental blocker first', () => {
      // An old Windows cannot be fixed by enabling Developer Mode, so that is
      // the blocker worth telling the user about.
      assert.equal(
        decideContextMenuMode(
          {
            isWindows11OrLater: false,
            packagePresent: false,
            canRegisterLoosePackage: false,
            packageRegistered: false,
          },
          true
        ).modernBlocker,
        'requires-windows-11'
      )
    })
  })

  describe('package source decision', () => {
    // The 2026-07-26 live verification found packaged builds ship the folder
    // only under resources\app, so registration must self-heal by copying it
    // beside the executable — the layout the manifest's relative paths need.
    it('prefers the layout registration requires', () => {
      assert.equal(
        decideShellExtensionPackageSource(true, true),
        'beside-executable'
      )
      assert.equal(
        decideShellExtensionPackageSource(true, false),
        'beside-executable'
      )
    })

    it('copies from resources when only the shipped copy exists', () => {
      assert.equal(
        decideShellExtensionPackageSource(false, true),
        'copy-from-resources'
      )
    })

    it('reports a build without the package as missing', () => {
      assert.equal(decideShellExtensionPackageSource(false, false), 'missing')
    })
  })
})
