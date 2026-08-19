import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateInventory } from './design-parity-inventory.mjs'

const RequiredOptions = Object.freeze([
  'inventory',
  'route-catalog',
  'repository-root',
  'expected-reference-route-count',
  'allow-fixture',
])

function fail(message) {
  throw new Error(message)
}

function parsePairs(argv) {
  if (argv.length % 2 !== 0) fail('Every option requires one explicit value')
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index]
    const value = argv[index + 1]
    if (typeof option !== 'string' || !/^--[a-z][a-z-]*$/.test(option)) {
      fail('Invalid option near ' + String(option))
    }
    const key = option.slice(2)
    if (!RequiredOptions.includes(key)) fail('Unsupported option --' + key)
    if (values.has(key)) fail('Duplicate option --' + key)
    values.set(key, value)
  }
  for (const option of RequiredOptions) {
    if (!values.has(option)) fail('Missing required option --' + option)
  }
  return values
}

function strictBoolean(value, option) {
  if (value === 'true') return true
  if (value === 'false') return false
  fail('--' + option + ' must be true or false')
}

function strictCount(value) {
  if (!/^\d+$/.test(value)) fail('--expected-reference-route-count must be an integer')
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < 1 || count > 500) {
    fail('--expected-reference-route-count must be from 1 through 500')
  }
  return count
}

export function parseValidationArguments(argv) {
  const values = parsePairs(argv)
  return Object.freeze({
    inventory: path.resolve(values.get('inventory')),
    routeCatalog: path.resolve(values.get('route-catalog')),
    repositoryRoot: path.resolve(values.get('repository-root')),
    expectedReferenceRouteCount: strictCount(
      values.get('expected-reference-route-count')
    ),
    allowFixture: strictBoolean(values.get('allow-fixture'), 'allow-fixture'),
  })
}

export function runValidationCli(argv = process.argv.slice(2)) {
  const summary = validateInventory(parseValidationArguments(argv))
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
  return summary
}

const directEntry = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null
if (directEntry === import.meta.url) {
  try {
    runValidationCli()
  } catch (error) {
    process.stderr.write('Design parity inventory validation failed: ' + error.message + '\n')
    process.exitCode = 1
  }
}
