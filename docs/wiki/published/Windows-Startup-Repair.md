# Native-free Windows startup argument parsing

Custom external integrations keep the `parseCommandLineArgv(commandLine)`
interface, but parsing now runs in TypeScript without a native addon. Application
Control blocking the old `windows-argv-parser.node` therefore cannot stop the
main process while importing the integration module.

The first value follows Windows executable-name parsing. Later values preserve
the native quotation and backslash rules, including consecutive quotes, empty
quoted values, and unmatched quotes. NUL terminates the input. Empty input
intentionally returns `[]` instead of the current executable path. JavaScript
strings preserve Unicode without the previous ANSI conversion.

No user configuration or migration is required. Existing custom editor and
shell definitions retain their stored argument strings and target placeholders.
The parser never executes a shell, expands variables, or changes command-path
validation. Security settings and user profiles are not modified by this repair.

The vendored package compiles with the same pinned TypeScript 6.0.3 as the root
project and has no native build inputs or runtime dependencies. Root build cache
checks still verify its compiled output, input hashes and runtime behavior.
Obsolete native snapshot and restoration paths have been removed.

Run `node --test script/windows-argv-parser-test.mjs` for explicit examples and,
on Windows with PowerShell 7, deterministic comparisons against the real
Unicode `CommandLineToArgvW` API. Run
`node --test script/build-windows-contract-test.mjs` for related build contracts.
The native comparison uses UTF-8 on both sides of its pipe and a bounded timeout.

Source tests are separate from acceptance of the root build, produced Squirrel
package, isolated-profile startup and the updated installed application.
If another native module is blocked, record that exact module separately.
Successful argument-parser tests do not establish acceptance of other modules.

## Production builds on smaller hosts

The root `build.bat /s` and `build-installer.bat /s` routes retain all six
production configurations. On hosts with at most 12 GiB physical memory, the
production runner compiles them sequentially in separate Node processes with
a 4 GiB old-space limit per child. This releases each compiler's graph before
the next configuration starts. Production minification, source maps, plugins
and output definitions remain unchanged. Set `DESKTOP_WEBPACK_SERIAL=1` to
select the same path explicitly on a larger host.

The runner stops at the first unsuccessful compiler and propagates its result.
It never packages a partially compiled set. Run
`node --test script/run-webpack-production-test.mjs` for the focused execution
and old-space limit checks. An earlier parallel production run was deliberately
stopped under memory pressure. That interrupted run is retained as diagnostic
evidence and is not successful build proof.

## October 11, 2026 acceptance record

Both exact root entrypoints passed at application source 58e628b62f61b5f9c1a24ce973a484f740bb283a: build.bat /s exited 0 in 00:35:04, and build-installer.bat /s exited 0 with entrypoint elapsed 01:09:49. The complete local 4.0.0 full package passed decompression/CRC for 2,558 files and 257 folders. It contains neither the native argument-parser addon nor the private agent directory. Its lower version must not downgrade the installed 4.0.133401 application.

The separately verified normal release [v4.0.133501](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v4.0.133501), source 1ef2e137353ea431082d7bbd2026ad14be16f561, has six downloadable assets matching published byte counts and SHA-256 digests. The full package hash is deeff825f46f26a70a90c13250af6f39b07753e1fdbaaf86d18e316e2a8cd13c. Its complete decompression/CRC, RELEASES hash/size and unsigned Setup checks passed. The native argument-parser addon is absent.

The extracted candidate reached a usable empty workspace on a named hidden Windows desktop with an isolated profile. A second instance delivered a Unicode repository path into the reviewed Add Local Repository workflow. The real external-editor menu action delivered all eight expected arguments, covering the target path, empty value, spaces, Unicode, escaped quotation marks, backslashes and tab separation. A direct second-instance protocol invocation reached the exact reviewed clone URL and was cancelled without cloning. The separate operating-system association invocation did not reach that form, so shell association delivery remains unverified.

The [qualified startup image and provenance](https://ding-ding-projects.github.io/desktop-material/docs/verification/startup-repair-2026-10-11.html) are verified release evidence. The unedited PNG is 1200 by 700, SHA-256 781b95e452ad1edadd7b50b5c47b283222da8aebcb19c22ab375a5b7fcf8f634. Its actual CSS viewport is 1247 by 728 at device pixel ratio 0.9620000808040317. The observation interval reported zero console, unhandled and page errors, but does not observe historical startup events. Normal owned process and desktop teardown, restored protocol registrations and unchanged global Git configuration passed.

This verifies package and isolated-profile behavior. Installed startup and existing-profile acceptance remain incomplete. Two older installed processes predate the task and remain protected pending the existing narrow closure decision. No security setting, existing profile or unrelated process was changed. The capture is bound to release 4.0.133501, not newer application main, and does not establish full layout or design-parity acceptance.

The application main at 1a4d40974b9e0a563879a7e643b584f874d3b7d3 contains the fully replaced README and qualified capture. Its [documentation deployment](https://github.com/Ding-Ding-Projects/desktop-material/actions/runs/38121177697) passed. Live readback verified 15 mirrored wiki articles plus index, 107 internal links/anchors across 40 routes, 118 referenced article assets including 116 images, 335 catalog entries, 25 home-page assets, six CSS-referenced assets and the exact About homepage. The prefixed README route and source inventory both return 200 with the expected destination/bytes.

### 廣東話驗證界線

兩個指定建置入口同完整套件校驗都已通過。隔離版本已到可用工作區，真正外部編輯器收到八個正確參數；直接通訊協定啟動到指定確認畫面後取消，冇複製資料。作業系統關聯啟動仍未驗證成功。原始畫面、來源同清理紀錄已核對，但唔代表原有個人資料或已安裝版本已驗證。原有程序繼續保留，安全設定冇改。
