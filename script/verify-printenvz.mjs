import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { getPrintenvzPath } from 'printenvz'

const targetArchitecture = process.argv[2]
if (targetArchitecture !== 'x64' && targetArchitecture !== 'arm64') {
  console.error(
    `Unsupported printenvz target architecture: ${
      targetArchitecture ?? '<missing>'
    }`
  )
  process.exit(1)
}

const executablePath = getPrintenvzPath()
const executable = readFileSync(executablePath)
if (executable.length < 0x40 || executable.toString('ascii', 0, 2) !== 'MZ') {
  console.error(`printenvz is not a valid PE executable: ${executablePath}`)
  process.exit(1)
}

const peOffset = executable.readUInt32LE(0x3c)
if (
  peOffset + 6 > executable.length ||
  executable.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0'
) {
  console.error(`printenvz has an invalid PE header: ${executablePath}`)
  process.exit(1)
}

const machine = executable.readUInt16LE(peOffset + 4)
const expectedMachine = targetArchitecture === 'arm64' ? 0xaa64 : 0x8664
if (machine !== expectedMachine) {
  console.error(
    `printenvz machine mismatch: expected ${targetArchitecture}, got 0x${machine.toString(
      16
    )}`
  )
  process.exit(1)
}

const hostArchitecture =
  process.arch === 'arm64'
    ? 'arm64'
    : process.arch === 'x64'
    ? 'x64'
    : undefined
if (hostArchitecture !== targetArchitecture) {
  console.log(
    `Verified printenvz ${targetArchitecture} PE image; skipping runtime smoke test on ${
      hostArchitecture ?? process.arch
    } host.`
  )
  process.exit(0)
}

const result = spawnSync(executablePath, { stdio: 'ignore', timeout: 10000 })
if (result.error || result.status !== 0) {
  console.error(
    `printenvz executable failed: ${
      result.error?.message ?? `exit ${result.status}`
    }`
  )
  process.exit(1)
}
