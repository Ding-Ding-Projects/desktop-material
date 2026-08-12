import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(fileURLToPath(import.meta.url))
const buildRoot = join(packageRoot, 'build')
const releaseRoot = join(buildRoot, 'Release')
const executableName = process.platform === 'win32' ? 'printenvz.exe' : 'printenvz'
const executablePath = join(releaseRoot, executableName)
const mode = process.argv.includes('--clean')
  ? 'clean'
  : process.argv.includes('--rebuild')
    ? 'rebuild'
    : 'build'

function fail(message) {
  console.error(`printenvz build failed: ${message}`)
  process.exit(1)
}

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    cwd: packageRoot,
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.error) {
    fail(result.error.message)
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (mode === 'clean') {
  rmSync(buildRoot, { recursive: true, force: true })
  process.exit(0)
}

const targetArchitecture =
  process.env.npm_config_arch === 'arm64' || process.env.TARGET_ARCH === 'arm64'
    ? 'arm64'
    : 'x64'
const explicitInstallationPath = process.env.npm_config_msvs_version?.trim()
const requiresWindowsDirectCompiler =
  process.platform === 'win32' && targetArchitecture === 'arm64'

function discoverVisualStudioInstallation() {
  const vswhereCandidates = [
    process.env.VSWHERE_PATH,
    process.env['ProgramFiles(x86)'] &&
      join(
        process.env['ProgramFiles(x86)'],
        'Microsoft Visual Studio',
        'Installer',
        'vswhere.exe'
      ),
    process.env.ProgramFiles &&
      join(
        process.env.ProgramFiles,
        'Microsoft Visual Studio',
        'Installer',
        'vswhere.exe'
      ),
  ].filter(candidate => candidate && existsSync(candidate))

  for (const vswherePath of vswhereCandidates) {
    const result = spawnSync(
      vswherePath,
      ['-latest', '-products', '*', '-property', 'installationPath'],
      { encoding: 'utf8', windowsHide: true }
    )
    if (result.status === 0) {
      const installationPath = result.stdout
        ?.split(/\r?\n/)
        .map(line => line.trim())
        .find(Boolean)
      if (installationPath) return installationPath
    }
  }

  return undefined
}

if (
  process.platform !== 'win32' ||
  (!explicitInstallationPath && !requiresWindowsDirectCompiler)
) {
  const require = (await import('node:module')).createRequire(import.meta.url)
  const nodeGyp = require.resolve('node-gyp/bin/node-gyp.js')
  run(process.execPath, [nodeGyp, mode])
  process.exit(0)
}

// printenvz is a standalone C executable, not a Node addon. On Windows,
// node-gyp routes this target through MSBuild's CL task. Some self-hosted
// Visual Studio installations have crashed in that task before producing a
// usable binary, so compile the tiny source directly in the provisioned
// developer environment instead. This keeps the install deterministic and
// avoids depending on Node headers for a program that never links to Node.
const installationPath =
  explicitInstallationPath ?? discoverVisualStudioInstallation()
if (!installationPath) {
  fail(
    'Visual Studio installation was not provided by npm_config_msvs_version '
      + 'and could not be discovered with vswhere for the Windows arm64 build'
  )
}

const developerCommands = [
  {
    path: join(installationPath, 'Common7', 'Tools', 'VsDevCmd.bat'),
    arguments: [`-arch=${targetArchitecture}`, '-host_arch=x64'],
  },
  {
    path: join(installationPath, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat'),
    arguments: [targetArchitecture === 'arm64' ? 'x64_arm64' : 'x64'],
  },
]
const developerCommand = developerCommands.find(candidate =>
  existsSync(candidate.path)
)
if (!developerCommand) {
  fail(
    `Visual Studio developer command was not found under ${installationPath}`
  )
}

rmSync(buildRoot, { recursive: true, force: true })
mkdirSync(releaseRoot, { recursive: true })

const sourcePath = join(packageRoot, 'src', 'printenvz.c')
const commandFileName = 'printenvz-build.cmd'
const commandFilePath = join(packageRoot, commandFileName)
writeFileSync(
  commandFilePath,
  [
    '@echo off',
    `call "${developerCommand.path}" ${developerCommand.arguments.join(' ')}`,
    'if errorlevel 1 exit /b 1',
    `cl.exe /nologo /O2 /MT /D_CRT_SECURE_NO_WARNINGS /Fe:"${executablePath}" "${sourcePath}"`,
    '',
  ].join('\r\n'),
  'utf8'
)
let result
try {
  result = spawnSync(
    process.env.ComSpec ?? 'cmd.exe',
    // The absolute path, not the bare file name. `call foo.cmd` relies on cmd
    // searching the current directory, which a host can turn off — and does,
    // through `NoDefaultCurrentDirectoryInExePath`. The failure is
    // `'printenvz-build.cmd' is not recognized`, naming a file sitting in the
    // working directory the command was given, which reads as a missing file
    // rather than a lookup rule.
    //
    // Unquoted: `spawnSync` already quotes an argument containing spaces, and
    // adding quotes here gets them escaped into the argument itself — the
    // command then fails naming a path wrapped in literal `\"` marks.
    ['/d', '/s', '/c', 'call', commandFilePath],
    {
      cwd: packageRoot,
      stdio: 'inherit',
      windowsHide: true,
    }
  )
} finally {
  rmSync(commandFilePath, { force: true })
}
if (result.error) {
  fail(result.error.message)
}
if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

if (!existsSync(executablePath)) {
  fail(`the compiler completed without creating ${executablePath}`)
}
