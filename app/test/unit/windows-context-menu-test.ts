import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  IWindowsContextMenuEnvironment,
  WindowsContextMenuEntryIds,
  buildDesktopMaterialCommand,
  buildOpencodeCommand,
  buildRegDeleteArguments,
  buildWindowsContextMenuPlan,
  buildWindowsContextMenuRemoval,
  chooseEntryIcon,
  decideWindowsContextMenuState,
  formatWindowsCommand,
  isWindowsContextMenuEntryId,
  quoteWindowsCommandArgument,
  sanitizeContextMenuLabel,
  summarizeWindowsContextMenuState,
  unsupportedWindowsContextMenuState,
} from '../../src/lib/windows-context-menu'
import { decideQuickAction } from '../../src/lib/quick-action'

// These tests only exercise payload *generation*. Nothing here reads or writes
// the live registry — the installer that performs that I/O is deliberately kept
// out of the pure module so the suite can never mutate a developer's machine.

const AppPath = 'C:\\Users\\test\\AppData\\Local\\DesktopMaterial\\app.exe'
const CmdPath = 'C:\\Windows\\System32\\cmd.exe'
const WtPath = 'C:\\Users\\test\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe'
const OpencodePath = 'C:\\Users\\test\\AppData\\Roaming\\npm\\opencode.cmd'

function environment(
  overrides: Partial<IWindowsContextMenuEnvironment> = {}
): IWindowsContextMenuEnvironment {
  return {
    appPath: AppPath,
    opencodePath: OpencodePath,
    windowsTerminalPath: WtPath,
    cmdPath: CmdPath,
    labels: {
      openWithOpencode: 'Open with OpenCode here',
      openInDesktopMaterial: 'Open in Desktop Material',
    },
    ...overrides,
  }
}

describe('windows context menu payload generation', () => {
  describe('quoting', () => {
    it('wraps arguments in double quotes', () => {
      assert.equal(
        quoteWindowsCommandArgument('C:\\Program Files\\a.exe'),
        '"C:\\Program Files\\a.exe"'
      )
    })

    it('refuses a value containing a double quote', () => {
      // A quote cannot appear in a Windows path, so its presence means the
      // input is not a path and escaping it could smuggle extra arguments.
      assert.throws(
        () => quoteWindowsCommandArgument('C:\\a" & calc.exe "'),
        /double quote/
      )
    })

    it('refuses a value containing a control character', () => {
      assert.throws(
        () => quoteWindowsCommandArgument('C:\\a\r\nb'),
        /control character/
      )
      assert.throws(() => quoteWindowsCommandArgument('C:\\a\0b'), /control/)
    })

    it('joins an executable and its arguments', () => {
      assert.equal(
        formatWindowsCommand('C:\\a.exe', ['-d', '%V']),
        '"C:\\a.exe" "-d" "%V"'
      )
    })
  })

  describe('label sanitisation', () => {
    it('collapses whitespace and strips control characters', () => {
      assert.equal(
        sanitizeContextMenuLabel('Open\t with\n\n me', 'x'),
        'Open with me'
      )
    })

    it('falls back when the label is empty after cleaning', () => {
      assert.equal(sanitizeContextMenuLabel('   ', 'Fallback'), 'Fallback')
      assert.equal(
        sanitizeContextMenuLabel('\u0000\u0001', 'Fallback'),
        'Fallback'
      )
    })

    it('caps an over-long label', () => {
      const label = sanitizeContextMenuLabel('a'.repeat(200), 'x')
      assert.equal(label.length, 60)
    })

    it('keeps Cantonese labels intact', () => {
      assert.equal(
        sanitizeContextMenuLabel('喺呢度開 OpenCode', 'x'),
        '喺呢度開 OpenCode'
      )
    })
  })

  describe('icon selection', () => {
    it('uses the executable itself when it is an .exe', () => {
      assert.equal(
        chooseEntryIcon('C:\\tools\\opencode.exe', AppPath),
        '"C:\\tools\\opencode.exe",0'
      )
    })

    it('falls back to the app icon for a .cmd shim', () => {
      // An npm shim carries no icon resource, which would render a blank entry.
      assert.equal(chooseEntryIcon(OpencodePath, AppPath), `"${AppPath}",0`)
    })

    it('falls back to the app icon when there is no preferred path', () => {
      assert.equal(chooseEntryIcon(null, AppPath), `"${AppPath}",0`)
    })
  })

  describe('opencode command', () => {
    it('prefers Windows Terminal with -d', () => {
      assert.equal(
        buildOpencodeCommand(OpencodePath, WtPath, CmdPath),
        `"${WtPath}" "-d" "%V" "${OpencodePath}"`
      )
    })

    it('falls back to cmd start with /D and /k when wt is absent', () => {
      const command = buildOpencodeCommand(OpencodePath, null, CmdPath)
      assert.equal(
        command,
        `"${CmdPath}" /c start "OpenCode" /D "%V" "${CmdPath}" /k "${OpencodePath}"`
      )
      // /k keeps the window open so a crash is readable rather than a flash.
      assert.ok(command.includes('/k'))
      // An explicit window title stops `start` eating the quoted exe path.
      assert.ok(command.includes('start "OpenCode"'))
    })

    it('uses %V so the same command works on both surfaces', () => {
      // %1 is unavailable on Directory\Background; %V is defined for both.
      assert.ok(
        buildOpencodeCommand(OpencodePath, WtPath, CmdPath).includes('"%V"')
      )
    })
  })

  describe('desktop material command', () => {
    it('opens the quick-action window rather than the full app', () => {
      assert.equal(
        buildDesktopMaterialCommand(AppPath),
        `"${AppPath}" "--quick-action=status-commit-push" "--path=%V"`
      )
    })

    it('emits argv the launch-path parser accepts', () => {
      // The generated command and the argument parser must agree; a drift here
      // would surface only as a right-click that silently does nothing.
      const command = buildDesktopMaterialCommand(AppPath)
      const match = /"--quick-action=([^"]+)" "--path=([^"]+)"/.exec(command)
      assert.notEqual(match, null)
      assert.deepEqual(
        decideQuickAction({
          'quick-action': match![1],
          path: 'C:\\Users\\test\\repo',
        }),
        {
          kind: 'quick-action',
          request: {
            verb: 'status-commit-push',
            path: 'C:\\Users\\test\\repo',
          },
        }
      )
      assert.equal(match![2], '%V')
    })
  })

  describe('plan generation', () => {
    it('generates both entries on a fully equipped host', () => {
      const plan = buildWindowsContextMenuPlan(environment())
      assert.deepEqual(
        plan.entries.map(entry => entry.id),
        ['open-with-opencode', 'open-in-desktop-material']
      )
      assert.equal(plan.unavailable.length, 0)
    })

    it('registers each entry on both the folder and its background', () => {
      const plan = buildWindowsContextMenuPlan(environment())
      for (const entry of plan.entries) {
        assert.deepEqual(
          entry.rootKeys.map(key => key.surface),
          ['directory', 'background']
        )
        assert.deepEqual(
          entry.rootKeys.map(key => key.key),
          [
            `Software\\Classes\\Directory\\shell\\${
              entry.id === 'open-with-opencode'
                ? 'DesktopMaterialOpenCodeHere'
                : 'DesktopMaterialOpenRepository'
            }`,
            `Software\\Classes\\Directory\\Background\\shell\\${
              entry.id === 'open-with-opencode'
                ? 'DesktopMaterialOpenCodeHere'
                : 'DesktopMaterialOpenRepository'
            }`,
          ]
        )
      }
    })

    it('writes MUIVerb and Icon on the verb key and the command on its subkey', () => {
      const plan = buildWindowsContextMenuPlan(environment())
      const entry = plan.entries[1]
      const verbKey = entry.keys[0]
      const commandKey = entry.keys[1]

      assert.deepEqual(
        verbKey.values.map(value => value.name),
        ['MUIVerb', 'Icon']
      )
      assert.equal(verbKey.values[0].data, 'Open in Desktop Material')
      assert.ok(commandKey.key.endsWith('\\command'))
      // The default value (empty name) is what Explorer executes.
      assert.equal(commandKey.values[0].name, '')
      assert.equal(commandKey.values[0].data, entry.command)
    })

    it('never leaves HKCU or the Directory subtree', () => {
      const plan = buildWindowsContextMenuPlan(environment())
      for (const entry of plan.entries) {
        for (const key of entry.keys) {
          assert.equal(key.hive, 'HKEY_CURRENT_USER')
          assert.ok(
            key.key.startsWith('Software\\Classes\\Directory\\'),
            `${key.key} escaped the Directory subtree`
          )
          assert.ok(!/HKLM|HKEY_LOCAL_MACHINE/i.test(key.key))
        }
      }
    })

    it('emits only REG_SZ values so nothing depends on expansion', () => {
      const plan = buildWindowsContextMenuPlan(environment())
      for (const entry of plan.entries) {
        for (const key of entry.keys) {
          for (const value of key.values) {
            assert.equal(value.type, 'REG_SZ')
          }
        }
      }
    })

    it('omits the opencode entry entirely when opencode is missing', () => {
      const plan = buildWindowsContextMenuPlan(
        environment({ opencodePath: null })
      )
      assert.deepEqual(
        plan.entries.map(entry => entry.id),
        ['open-in-desktop-material']
      )
      assert.deepEqual(plan.unavailable, [
        { id: 'open-with-opencode', reason: 'opencode-not-found' },
      ])
    })

    it('treats an empty opencode path as missing', () => {
      const plan = buildWindowsContextMenuPlan(
        environment({ opencodePath: '' })
      )
      assert.equal(
        plan.entries.some(entry => entry.id === 'open-with-opencode'),
        false
      )
    })

    it('generates nothing when the app path is unknown', () => {
      const plan = buildWindowsContextMenuPlan(environment({ appPath: null }))
      assert.equal(plan.entries.length, 0)
      assert.deepEqual(
        plan.unavailable.map(item => item.reason),
        ['app-path-unknown', 'app-path-unknown']
      )
    })

    it('sanitises a label supplied over IPC before it reaches the registry', () => {
      const plan = buildWindowsContextMenuPlan(
        environment({
          labels: {
            openWithOpencode: '  Open\r\nwith\tOpenCode  ',
            openInDesktopMaterial: '',
          },
        })
      )
      assert.equal(plan.entries[0].label, 'Open with OpenCode')
      // An empty label falls back rather than producing a nameless verb.
      assert.equal(plan.entries[1].label, 'Open in Desktop Material')
    })

    it('refuses to build a command from a path containing a quote', () => {
      assert.throws(
        () =>
          buildWindowsContextMenuPlan(environment({ appPath: 'C:\\a".exe' })),
        /double quote/
      )
    })
  })

  describe('removal generation', () => {
    it('deletes both surfaces for each requested entry', () => {
      const removals = buildWindowsContextMenuRemoval(['open-with-opencode'])
      assert.deepEqual(
        removals.map(removal => removal.key),
        [
          'Software\\Classes\\Directory\\shell\\DesktopMaterialOpenCodeHere',
          'Software\\Classes\\Directory\\Background\\shell\\DesktopMaterialOpenCodeHere',
        ]
      )
      assert.ok(removals.every(removal => removal.hive === 'HKEY_CURRENT_USER'))
    })

    it('can remove an entry this host could no longer generate', () => {
      // Uninstalling opencode must not strand its verb in the registry.
      const planless = buildWindowsContextMenuPlan(
        environment({ opencodePath: null })
      )
      assert.equal(planless.entries.length, 1)
      assert.equal(
        buildWindowsContextMenuRemoval(['open-with-opencode']).length,
        2
      )
    })

    it('generates reg.exe argv rather than a command string', () => {
      assert.deepEqual(
        buildRegDeleteArguments(
          'HKEY_CURRENT_USER',
          'Software\\Classes\\Directory\\shell\\DesktopMaterialOpenCodeHere'
        ),
        [
          'delete',
          'HKCU\\Software\\Classes\\Directory\\shell\\DesktopMaterialOpenCodeHere',
          '/f',
        ]
      )
    })

    it('refuses to generate a delete outside the owned subtree', () => {
      assert.throws(
        () => buildRegDeleteArguments('HKEY_CURRENT_USER', 'Software\\Classes'),
        /unexpected registry key/
      )
      assert.throws(
        () =>
          buildRegDeleteArguments(
            'HKEY_LOCAL_MACHINE' as 'HKEY_CURRENT_USER',
            'Software\\Classes\\Directory\\shell\\X'
          ),
        /outside HKCU/
      )
    })

    it('covers every known entry id', () => {
      assert.equal(
        buildWindowsContextMenuRemoval(WindowsContextMenuEntryIds).length,
        WindowsContextMenuEntryIds.length * 2
      )
    })
  })

  describe('state detection', () => {
    const expected = buildDesktopMaterialCommand(AppPath)

    it('reports not-installed when neither surface has the verb', () => {
      assert.equal(
        decideWindowsContextMenuState(
          {
            id: 'open-in-desktop-material',
            commands: { directory: null, background: null },
          },
          expected
        ),
        'not-installed'
      )
    })

    it('reports installed when both surfaces match', () => {
      assert.equal(
        decideWindowsContextMenuState(
          {
            id: 'open-in-desktop-material',
            commands: { directory: expected, background: expected },
          },
          expected
        ),
        'installed'
      )
    })

    it('ignores case and surrounding whitespace when comparing', () => {
      assert.equal(
        decideWindowsContextMenuState(
          {
            id: 'open-in-desktop-material',
            commands: {
              directory: `  ${expected.toUpperCase()} `,
              background: expected,
            },
          },
          expected
        ),
        'installed'
      )
    })

    it('reports outdated when only one surface is present', () => {
      assert.equal(
        decideWindowsContextMenuState(
          {
            id: 'open-in-desktop-material',
            commands: { directory: expected, background: null },
          },
          expected
        ),
        'outdated'
      )
    })

    it('reports outdated when the command points at a different install', () => {
      assert.equal(
        decideWindowsContextMenuState(
          {
            id: 'open-in-desktop-material',
            commands: {
              directory: '"C:\\Old\\app.exe" "--cli-open=%V"',
              background: '"C:\\Old\\app.exe" "--cli-open=%V"',
            },
          },
          expected
        ),
        'outdated'
      )
    })

    it('reports outdated for a verb this host can no longer generate', () => {
      // opencode was uninstalled but its verb is still on disk: the user needs
      // the removal offered, so this must not read as not-installed.
      assert.equal(
        decideWindowsContextMenuState(
          {
            id: 'open-with-opencode',
            commands: { directory: 'anything', background: 'anything' },
          },
          null
        ),
        'outdated'
      )
    })

    it('treats an empty command value as absent', () => {
      assert.equal(
        decideWindowsContextMenuState(
          {
            id: 'open-in-desktop-material',
            commands: { directory: '', background: '' },
          },
          expected
        ),
        'not-installed'
      )
    })
  })

  describe('state summary', () => {
    it('reports every entry even when the plan omits one', () => {
      const plan = buildWindowsContextMenuPlan(
        environment({ opencodePath: null })
      )
      const state = summarizeWindowsContextMenuState(plan, [])

      assert.equal(state.supported, true)
      assert.deepEqual(
        state.entries.map(entry => entry.id),
        [...WindowsContextMenuEntryIds]
      )
      assert.equal(state.entries[0].unavailableReason, 'opencode-not-found')
      assert.equal(state.entries[0].state, 'not-installed')
      assert.equal(state.entries[1].unavailableReason, null)
    })

    it('folds observed registry contents into per-entry state', () => {
      const plan = buildWindowsContextMenuPlan(environment())
      const command = plan.entries[1].command
      const state = summarizeWindowsContextMenuState(plan, [
        {
          id: 'open-in-desktop-material',
          commands: { directory: command, background: command },
        },
      ])

      assert.equal(state.entries[0].state, 'not-installed')
      assert.equal(state.entries[1].state, 'installed')
    })

    it('reports the feature as unsupported off Windows', () => {
      const state = unsupportedWindowsContextMenuState()
      assert.equal(state.supported, false)
      assert.equal(state.entries.length, WindowsContextMenuEntryIds.length)
    })
  })

  describe('entry id guard', () => {
    it('accepts known ids and rejects anything else', () => {
      assert.ok(isWindowsContextMenuEntryId('open-with-opencode'))
      assert.ok(isWindowsContextMenuEntryId('open-in-desktop-material'))
      assert.equal(isWindowsContextMenuEntryId('rm -rf'), false)
      assert.equal(isWindowsContextMenuEntryId(42), false)
      assert.equal(isWindowsContextMenuEntryId(null), false)
    })
  })
})
