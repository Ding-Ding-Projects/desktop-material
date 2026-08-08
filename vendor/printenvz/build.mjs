import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  rmSync,
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

if (process.platform !== 'win32' || !process.env.npm_config_msvs_version) {
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
const targetArchitecture =
  process.env.npm_config_arch === 'arm64' || process.env.TARGET_ARCH === 'arm64'
    ? 'arm64'
    : 'x64'
const installationPath = process.env.npm_config_msvs_version
if (!installationPath) {
  fail('npm_config_msvs_version is required for the Windows direct compiler')
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
const command = [
  `call "${developerCommand.path}" ${developerCommand.arguments.join(' ')}`,
  `cl.exe /nologo /O2 /MT /D_CRT_SECURE_NO_WARNINGS /Fe:"${executablePath}" "${sourcePath}"`,
].join(' && ')
run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', command])

if (!existsSync(executablePath)) {
  fail(`the compiler completed without creating ${executablePath}`)
}
