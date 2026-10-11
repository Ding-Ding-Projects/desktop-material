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
