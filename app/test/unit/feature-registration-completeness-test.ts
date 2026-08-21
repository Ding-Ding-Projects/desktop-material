import { describe, it } from 'node:test'
import assert from 'node:assert'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

type EvidenceDimension =
  | 'implementation'
  | 'documentation'
  | 'localization'
  | 'focusedTest'
  | 'builtArtifactInteraction'
  | 'realCapture'

interface CanonicalFeature {
  id: string
  name: string
}

interface CanonicalInventory {
  schemaVersion: number
  features: Array<CanonicalFeature>
}

interface EvidencePathContract {
  schemaVersion: number
  canonicalFeatureDigest: string
  dimensions: Record<EvidenceDimension, string>
}

const evidenceDimensions: ReadonlyArray<EvidenceDimension> = [
  'implementation',
  'documentation',
  'localization',
  'focusedTest',
  'builtArtifactInteraction',
  'realCapture'
]

const parseFixture = <T>(path: string): T => JSON.parse(read(path)) as T

function inventoryDigest(inventory: CanonicalInventory): string {
  return createHash('sha256')
    .update(JSON.stringify(inventory.features))
    .digest('hex')
}

function validateInventoryShape(
  inventory: CanonicalInventory,
  canonicalDigest: string
): Array<string> {
  const errors: Array<string> = []
  if (inventory.schemaVersion !== 1) errors.push('unsupported inventory schema')
  if (!Array.isArray(inventory.features) || inventory.features.length === 0) {
    errors.push('canonical feature inventory is empty')
    return errors
  }

  const seen = new Set<string>()
  for (const [index, feature] of inventory.features.entries()) {
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(feature.id ?? '')) {
      errors.push(`feature row ${index} has no stable kebab-case id`)
    }
    if (typeof feature.name !== 'string' || feature.name.trim().length === 0) {
      errors.push(`feature row ${index} has no human-readable name`)
    }
    if (seen.has(feature.id)) errors.push(`duplicate feature id: ${feature.id}`)
    seen.add(feature.id)
  }
  if (inventoryDigest(inventory) !== canonicalDigest) {
    errors.push('canonical feature rows were removed, renamed, reordered, or added without review')
  }
  return errors
}

function validateEvidenceContract(contract: EvidencePathContract): Array<string> {
  const errors: Array<string> = []
  if (contract.schemaVersion !== 1) errors.push('unsupported evidence schema')
  if (!/^[a-f0-9]{64}$/.test(contract.canonicalFeatureDigest ?? '')) {
    errors.push('missing canonical feature digest')
  }
  for (const dimension of evidenceDimensions) {
    const template = contract.dimensions?.[dimension]
    if (typeof template !== 'string' || template.length === 0) {
      errors.push(`missing ${dimension} evidence reference`)
    } else if ((template.match(/\{featureId\}/g) ?? []).length !== 1) {
      errors.push(`${dimension} evidence reference must contain exactly one {featureId}`)
    }
  }
  return errors
}

function evidencePath(
  contract: EvidencePathContract,
  feature: CanonicalFeature,
  dimension: EvidenceDimension
): string {
  return contract.dimensions[dimension].replace('{featureId}', feature.id)
}

function enumMembers(source: string, name: string): Array<string> {
  const body = source.match(
    new RegExp(`export enum ${name}\\s*\\{([\\s\\S]*?)\\n\\}`)
  )?.[1]
  assert.ok(body, `Could not find enum ${name}`)

  return [...body.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:=.*)?,$/gm)].map(
    match => match[1]
  )
}

function uniqueMatches(source: string, expression: RegExp): Array<string> {
  return [...new Set([...source.matchAll(expression)].map(match => match[1]))]
}

describe('public feature registration completeness', () => {
  it('requires exact six-dimensional evidence for every canonical universal feature', () => {
    const inventory = parseFixture<CanonicalInventory>(
      'app/test/fixtures/feature-completeness/canonical-features.json'
    )
    const contract = parseFixture<EvidencePathContract>(
      'app/test/fixtures/feature-completeness/evidence-paths.json'
    )

    assert.deepEqual(
      validateInventoryShape(inventory, contract.canonicalFeatureDigest),
      []
    )
    assert.deepEqual(validateEvidenceContract(contract), [])

    for (const feature of inventory.features) {
      for (const dimension of evidenceDimensions) {
        const path = evidencePath(contract, feature, dimension)
        assert.ok(
          existsSync(join(root, path)),
          `${feature.id} lacks exact ${dimension} evidence reference: ${path}`
        )
      }
    }
  })

  it('proves the universal-feature completeness contract fails closed under mutation', () => {
    const inventory = parseFixture<CanonicalInventory>(
      'app/test/fixtures/feature-completeness/canonical-features.json'
    )
    const contract = parseFixture<EvidencePathContract>(
      'app/test/fixtures/feature-completeness/evidence-paths.json'
    )

    for (const feature of inventory.features) {
      const removed = {
        ...inventory,
        features: inventory.features.filter(candidate => candidate.id !== feature.id)
      }
      assert.equal(
        validateInventoryShape(removed, contract.canonicalFeatureDigest).some(
          error => error.includes('canonical feature rows were removed')
        ),
        true,
        `${feature.id} row-removal mutation did not turn the contract red`
      )

      for (const dimension of evidenceDimensions) {
        const mutated = structuredClone(contract)
        delete (mutated.dimensions as Partial<Record<EvidenceDimension, string>>)[
          dimension
        ]
        assert.ok(
          validateEvidenceContract(mutated).some(error =>
            error.includes(`missing ${dimension}`)
          ),
          `${feature.id}/${dimension} mutation did not turn the contract red`
        )
      }
    }
  })

  it('renders every registered popup type', () => {
    const registered = enumMembers(
      read('app/src/models/popup.ts'),
      'PopupType'
    ).sort()
    const rendered = uniqueMatches(
      read('app/src/ui/app.tsx'),
      /case PopupType\.([A-Za-z][A-Za-z0-9_]*):/g
    ).sort()

    assert.deepEqual(rendered, registered)
  })

  it('exposes and renders every Preferences tab', () => {
    const registered = enumMembers(
      read('app/src/models/preferences.ts'),
      'PreferencesTab'
    )
    const preferences = read('app/src/ui/preferences/preferences.tsx')

    for (const tab of registered) {
      assert.match(
        preferences,
        new RegExp(
          `(?:getTabId|renderRailTab)\\(\\s*PreferencesTab\\.${tab}\\b`
        ),
        `${tab} is missing its tab control`
      )
      const cases = preferences.match(
        new RegExp(`case PreferencesTab\\.${tab}:`, 'g')
      )
      assert.ok(
        cases !== null && cases.length >= 2,
        `${tab} is missing its title or content renderer`
      )
    }
  })

  it('registers and renders every repository section', () => {
    const registered = enumMembers(
      read('app/src/lib/app-state.ts'),
      'RepositorySectionTab'
    )
    const navigation = read('app/src/ui/repository-sections.ts')
    const repository = read('app/src/ui/repository.tsx')

    for (const section of registered) {
      const expression = new RegExp(`RepositorySectionTab\\.${section}\\b`)
      assert.match(
        navigation,
        expression,
        `${section} is missing from the rail`
      )
      assert.match(
        repository,
        expression,
        `${section} is missing from the repository renderer`
      )
    }
  })

  it('defines and executes every public agent command', () => {
    const contract = read('app/src/lib/agent-commands.ts')
    const executor = read('app/src/lib/agent-command-executor.ts')
    const typeBody = contract.match(
      /export type AgentCommandName\s*=([\s\S]*?)\r?\n\r?\nexport interface/
    )?.[1]
    assert.ok(typeBody, 'Could not find AgentCommandName')

    const registered = uniqueMatches(typeBody, /'([^']+)'/g).sort()
    const tools = uniqueMatches(contract, /\n\s*name: '([^']+)'/g).sort()
    const implemented = uniqueMatches(executor, /case '([^']+)':/g).sort()

    assert.deepEqual(tools, registered)
    assert.deepEqual(implemented, registered)
  })

  it('keeps all M0-M19 implementation paths present in the checkout', () => {
    const plan = read('PLAN.md')
    const milestoneRows = plan
      .split(/\r?\n/)
      .filter(line => /^\| \*\*M(?:[0-9]|1[0-9])\b/.test(line))

    assert.equal(milestoneRows.length, 20)
    for (const [index, row] of milestoneRows.entries()) {
      assert.match(row, /\| \*\*COMPLETE\*\* \|/)
      const cells = row.split('|')
      const implementationCell = cells[cells.length - 2]
      const paths = [...implementationCell.matchAll(/`([^`]+)`/g)].map(
        match => match[1]
      )
      assert.ok(paths.length > 0, `M${index} has no implementation paths`)
      for (const path of paths) {
        assert.ok(existsSync(join(root, path)), `${path} does not exist`)
      }
    }
  })
})
