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
  decideShellExtensionExternalLocation,
  decideShellExtensionPackageSource,
  decideShellExtensionRegistrationState,
  decideShellExtensionRepair,
  escapeXml,
  formatX500Publisher,
  isModernContextMenuActionable,
  isSameWindowsPath,
  manifestClsid,
  parsePackageRegistrationOutput,
  squirrelUpdateRoot,
} from '../../src/lib/shell-extension-package'

// Generation-only coverage. Nothing here registers a package, writes a
// certificate store, or touches Windows security settings.

function options(
  overrides: Partial<IShellExtensionManifestOptions> = {}
): IShellExtensionManifestOptions {
  return {
    architecture: 'x64',
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

    it('declares the architecture of the native Explorer DLL', () => {
      assert.match(
        buildShellExtensionManifest(options({ architecture: 'x64' })),
        /ProcessorArchitecture="x64"/
      )
      assert.match(
        buildShellExtensionManifest(options({ architecture: 'arm64' })),
        /ProcessorArchitecture="arm64"/
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
      assert.deepEqual(
        parsePackageRegistrationOutput(
          'registered\r\nC:\\app\\shell-extension'
        ),
        { registered: true, installLocation: 'C:\\app\\shell-extension' }
      )
      assert.deepEqual(parsePackageRegistrationOutput('  Registered \r\n'), {
        registered: true,
        installLocation: null,
      })
      assert.deepEqual(parsePackageRegistrationOutput('absent\n'), {
        registered: false,
        installLocation: null,
      })
      assert.deepEqual(parsePackageRegistrationOutput(''), {
        registered: false,
        installLocation: null,
      })
    })

    it('asks where the package is registered from, not only whether it is', () => {
      // A registration recorded against a deleted directory still answers
      // "registered", so the location is the half that detects issue #66.
      assert.ok(
        buildQueryPackageArguments().some(arg =>
          arg.includes('InstallLocation')
        )
      )
    })

    it('registers against the location the caller chose', () => {
      // The manifest may sit under the external location; the two arguments are
      // distinct and must not be collapsed into one.
      const args = buildRegisterPackageArguments(
        'C:\\Users\\a\\AppData\\Local\\GitHubDesktop\\shell-extension\\AppxManifest.xml',
        'C:\\Users\\a\\AppData\\Local\\GitHubDesktop'
      )
      assert.equal(
        args[args.indexOf('-ExternalLocation') + 1],
        'C:\\Users\\a\\AppData\\Local\\GitHubDesktop'
      )
    })
  })

  describe('external location', () => {
    // Issue #66: Windows records the external location once and never revisits
    // it, so naming Squirrel's `app-<version>` directory gives the registration
    // a shelf life of exactly one update.
    const installed =
      'C:\\Users\\a\\AppData\\Local\\GitHubDesktop\\app-3.6.3-beta3-zadtuyunxj'
    const root = 'C:\\Users\\a\\AppData\\Local\\GitHubDesktop'

    it('recognises a Squirrel versioned directory and its stable root', () => {
      assert.equal(squirrelUpdateRoot(installed), root)
      assert.equal(squirrelUpdateRoot(`${installed}\\`), root)
      assert.equal(squirrelUpdateRoot('C:\\Program Files\\Whatever'), null)
      assert.equal(
        squirrelUpdateRoot('C:\\dm-ctxmenu-live\\GitHubDesktop-win32-x64'),
        null
      )
      // `app` alone is not a version directory; a bare drive has no root above.
      assert.equal(squirrelUpdateRoot('C:\\app'), null)
      assert.equal(squirrelUpdateRoot('C:\\'), null)
    })

    it('chooses a location no update can take away', () => {
      const chosen = decideShellExtensionExternalLocation(installed, true)

      assert.equal(chosen, root)
      assert.equal(
        /\\app-\d/.test(chosen),
        false,
        'the external location must not name a per-version install directory'
      )
    })

    it('keeps the executable directory when the root holds no launcher', () => {
      // Registering against a directory with no `GitHubDesktop.exe` in it would
      // break the manifest's Executable entry, which is worse than rotting.
      assert.equal(
        decideShellExtensionExternalLocation(installed, false),
        installed
      )
    })

    it('leaves an unpackaged or development layout exactly as it was', () => {
      const unpackaged = 'C:\\dm-ctxmenu-live\\GitHubDesktop-win32-x64'

      assert.equal(
        decideShellExtensionExternalLocation(unpackaged, false),
        unpackaged
      )
      // Even if something above it happens to hold a launcher: without an
      // `app-<version>` directory there is no Squirrel root to climb to.
      assert.equal(
        decideShellExtensionExternalLocation(unpackaged, true),
        unpackaged
      )
    })

    it('compares Windows paths the way Windows does', () => {
      assert.equal(isSameWindowsPath('C:\\App\\X', 'c:\\app\\x'), true)
      assert.equal(isSameWindowsPath('C:\\App\\X\\', 'C:/App/X'), true)
      assert.equal(isSameWindowsPath('C:\\App\\X', 'C:\\App\\Y'), false)
    })
  })

  describe('registration freshness', () => {
    const expected = {
      expectedExternalLocation: 'C:\\Users\\a\\AppData\\Local\\GitHubDesktop',
      expectedManifestDirectory:
        'C:\\Users\\a\\AppData\\Local\\GitHubDesktop\\shell-extension',
    }

    it('reports absent when nothing is registered', () => {
      assert.equal(
        decideShellExtensionRegistrationState({
          ...expected,
          registration: { registered: false, installLocation: null },
          installLocationExists: false,
        }),
        'absent'
      )
    })

    it('accepts either spelling of this install', () => {
      for (const location of [
        expected.expectedManifestDirectory,
        expected.expectedExternalLocation,
        'c:/users/a/appdata/local/githubdesktop/shell-extension/',
      ]) {
        assert.equal(
          decideShellExtensionRegistrationState({
            ...expected,
            registration: { registered: true, installLocation: location },
            installLocationExists: true,
          }),
          'current',
          location
        )
      }
    })

    it('detects a registration whose location no longer exists', () => {
      // The update case: `app-<version>` was deleted out from under a
      // registration that still reports Status: Ok.
      assert.equal(
        decideShellExtensionRegistrationState({
          ...expected,
          registration: {
            registered: true,
            installLocation:
              'C:\\Users\\a\\AppData\\Local\\GitHubDesktop\\app-3.6.3-beta3-zadtxjinmz\\shell-extension',
          },
          installLocationExists: false,
        }),
        'stale'
      )
    })

    it('detects a registration pointing outside this install', () => {
      // Both `app-<version>` directories can coexist for a while, so the old
      // path existing proves nothing about which install owns it.
      assert.equal(
        decideShellExtensionRegistrationState({
          ...expected,
          registration: {
            registered: true,
            installLocation:
              'C:\\Users\\a\\AppData\\Local\\GitHubDesktop\\app-3.6.3-beta3-zadtxjinmz\\shell-extension',
          },
          installLocationExists: true,
        }),
        'stale'
      )
    })

    it('treats a registration with nowhere recorded as stale', () => {
      // Windows empties InstallLocation once the registered folder is gone.
      assert.equal(
        decideShellExtensionRegistrationState({
          ...expected,
          registration: { registered: true, installLocation: null },
          installLocationExists: false,
        }),
        'stale'
      )
    })
  })

  describe('post-update repair', () => {
    it('repairs a stale registration', () => {
      assert.equal(decideShellExtensionRepair('stale'), 're-register')
    })

    it('never registers for a user who did not ask for it', () => {
      // `absent` covers everyone who never turned the feature on and everyone
      // who turned it off. Repair restores a choice; it never makes one.
      assert.equal(decideShellExtensionRepair('absent'), 'none')
    })

    it('leaves a healthy registration alone', () => {
      assert.equal(decideShellExtensionRepair('current'), 'none')
    })
  })

  describe('mode decision', () => {
    const capable = {
      isWindows11OrLater: true,
      packagePresent: true,
      canRegisterLoosePackage: true,
      registrationState: 'absent' as const,
    }

    it('reports modern when the package is registered', () => {
      assert.deepEqual(
        decideContextMenuMode(
          { ...capable, registrationState: 'current' },
          false
        ),
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
            registrationState: 'current',
          },
          true
        ),
        { mode: 'modern', modernBlocker: null }
      )
    })

    it('refuses to call a stale registration modern', () => {
      // Issue #66: the package reported Status: Ok from a directory a later
      // update deleted, and the pane echoed it as "on" while Explorer showed
      // nothing. A stale registration is a named, visible state instead.
      assert.deepEqual(
        decideContextMenuMode({ ...capable, registrationState: 'stale' }, true),
        { mode: 'classic', modernBlocker: 'registration-stale' }
      )
      assert.deepEqual(
        decideContextMenuMode(
          { ...capable, registrationState: 'stale' },
          false
        ),
        { mode: 'none', modernBlocker: 'registration-stale' }
      )
    })

    it('keeps the stale toggle operable and every other blocker disabled', () => {
      // Switching it on re-registers, which is the whole repair. Nothing else
      // on this list is fixable from inside the app.
      assert.equal(isModernContextMenuActionable('registration-stale'), true)
      assert.equal(isModernContextMenuActionable(null), true)
      assert.equal(isModernContextMenuActionable('requires-windows-11'), false)
      assert.equal(isModernContextMenuActionable('package-missing'), false)
      assert.equal(
        isModernContextMenuActionable('developer-mode-required'),
        false
      )
    })

    it('names the prerequisite ahead of the staleness it prevents fixing', () => {
      // Re-registering needs sideloading, so that is the actionable blocker
      // even though the registration is also stale.
      assert.equal(
        decideContextMenuMode(
          {
            ...capable,
            canRegisterLoosePackage: false,
            registrationState: 'stale',
          },
          true
        ).modernBlocker,
        'developer-mode-required'
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
            registrationState: 'absent',
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
      assert.equal(
        decideShellExtensionPackageSource(false, false, true),
        'missing'
      )
    })

    it('replaces the copy left behind by an earlier version when refreshing', () => {
      // The external location now outlives the version that wrote it, so
      // without a refresh every later release would register the first
      // release's DLL forever.
      assert.equal(
        decideShellExtensionPackageSource(true, true, true),
        'copy-from-resources'
      )
      // Nothing to refresh from: keep the working copy rather than losing it.
      assert.equal(
        decideShellExtensionPackageSource(true, false, true),
        'beside-executable'
      )
    })
  })
})
