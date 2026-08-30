import { describe, it } from 'node:test'
import assert from 'node:assert'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

type EvidenceStatus = 'present' | 'pending' | 'blocked'

const evidenceDimensions = [
  'implementation',
  'documentation',
  'localization',
  'persistence',
  'focusedTest',
  'builtArtifactInteraction',
  'realCapture',
] as const

type EvidenceDimension = typeof evidenceDimensions[number]

interface CanonicalFeature {
  id: string
  name: string
}

interface CanonicalInventory {
  schemaVersion: number
  features: Array<CanonicalFeature>
}

interface EvidenceRecord {
  status: EvidenceStatus
  paths?: Array<string>
  reason?: string
  note?: string
}

interface FeatureEvidence {
  id: string
  evidence: Record<EvidenceDimension, Array<EvidenceRecord>>
}

interface EvidenceManifest {
  schemaVersion: number
  canonicalFeatureDigest: string
  dimensions: Array<string>
  features: Array<FeatureEvidence>
}

function parseFixture<T>(path: string): T {
  return JSON.parse(read(path)) as T
}

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
    errors.push(
      'canonical feature rows were removed, renamed, reordered, or added without review'
    )
  }
  return errors
}

function validateEvidenceManifestShape(
  manifest: EvidenceManifest,
  canonicalFeatures: Array<CanonicalFeature>,
  canonicalDigest: string
): Array<string> {
  const errors: Array<string> = []
  if (manifest.schemaVersion !== 2)
    errors.push('unsupported evidence manifest schema')
  if (manifest.canonicalFeatureDigest !== canonicalDigest) {
    errors.push(
      'evidence manifest canonical feature digest does not match inventory'
    )
  }
  if (
    JSON.stringify(manifest.dimensions) !==
    JSON.stringify([...evidenceDimensions])
  ) {
    errors.push('evidence manifest dimensions are not the exact required set')
  }

  const canonicalIds = canonicalFeatures.map(feature => feature.id)
  if (!Array.isArray(manifest.features)) {
    return [...errors, 'evidence manifest features are not an array']
  }
  const manifestIds = manifest.features.map(feature => feature?.id)
  if (JSON.stringify(manifestIds) !== JSON.stringify(canonicalIds)) {
    errors.push(
      'evidence manifest feature ids do not exactly match canonical inventory order'
    )
  }

  const seen = new Set<string>()
  for (const [index, feature] of manifest.features.entries()) {
    const id = typeof feature?.id === 'string' ? feature.id : `row-${index}`
    if (seen.has(id)) errors.push(`duplicate evidence feature id: ${id}`)
    seen.add(id)

    if (
      !feature ||
      typeof feature.evidence !== 'object' ||
      feature.evidence === null
    ) {
      errors.push(`${id} is missing its evidence record`)
      continue
    }

    const actualDimensions = Object.keys(feature.evidence).sort()
    const expectedDimensions = [...evidenceDimensions].sort()
    if (
      JSON.stringify(actualDimensions) !== JSON.stringify(expectedDimensions)
    ) {
      errors.push(
        `${id} does not enumerate every required evidence dimension exactly once`
      )
    }

    for (const dimension of evidenceDimensions) {
      const records = feature.evidence[dimension]
      if (!Array.isArray(records) || records.length === 0) {
        errors.push(
          `${id}/${dimension} must contain at least one evidence record`
        )
        continue
      }

      records.forEach((record, recordIndex) => {
        if (
          !record ||
          !['present', 'pending', 'blocked'].includes(record.status)
        ) {
          errors.push(
            `${id}/${dimension} record ${recordIndex} has an invalid status`
          )
          return
        }

        if (record.status === 'present') {
          if (
            !Array.isArray(record.paths) ||
            record.paths.length === 0 ||
            record.paths.some(
              path =>
                typeof path !== 'string' ||
                path.length === 0 ||
                path.startsWith('/') ||
                /^[A-Za-z]:[\\/]/.test(path) ||
                path.split('/').includes('..')
            )
          ) {
            errors.push(
              `${id}/${dimension} present record ${recordIndex} must name relative repository paths`
            )
          }
        } else if (
          typeof record.reason !== 'string' ||
          record.reason.trim().length === 0
        ) {
          errors.push(
            `${id}/${dimension} ${record.status} record ${recordIndex} needs a reason`
          )
        }

        if (
          record.paths !== undefined &&
          (!Array.isArray(record.paths) ||
            record.paths.some(path => typeof path !== 'string'))
        ) {
          errors.push(
            `${id}/${dimension} record ${recordIndex} has invalid paths`
          )
        }
      })
    }
  }
  return errors
}

function validateEvidenceCompletion(
  manifest: EvidenceManifest,
  repositoryRoot: string
): Array<string> {
  const errors: Array<string> = []
  for (const feature of manifest.features) {
    for (const dimension of evidenceDimensions) {
      for (const [recordIndex, record] of feature.evidence[
        dimension
      ].entries()) {
        const prefix = `${feature.id}/${dimension} record ${recordIndex}`
        if (record.status === 'pending' || record.status === 'blocked') {
          errors.push(`${prefix} is ${record.status}: ${record.reason}`)
          continue
        }

        for (const path of record.paths ?? []) {
          if (!existsSync(join(repositoryRoot, path))) {
            errors.push(`${prefix} claims missing evidence path: ${path}`)
          }
        }
      }
    }
  }
  return errors
}

function completionVerdict(
  manifest: EvidenceManifest,
  repositoryRoot: string
): { complete: boolean; errors: Array<string> } {
  const errors = validateEvidenceCompletion(manifest, repositoryRoot)
  return { complete: errors.length === 0, errors }
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
  it('validates the explicit evidence manifest and enforces the completion Chut', () => {
    const inventory = parseFixture<CanonicalInventory>(
      'app/test/fixtures/feature-completeness/canonical-features.json'
    )
    const manifest = parseFixture<EvidenceManifest>(
      'app/test/fixtures/feature-completeness/evidence-paths.json'
    )

    assert.deepEqual(
      validateInventoryShape(inventory, manifest.canonicalFeatureDigest),
      []
    )
    assert.deepEqual(
      validateEvidenceManifestShape(
        manifest,
        inventory.features,
        manifest.canonicalFeatureDigest
      ),
      []
    )

    const verdict = completionVerdict(manifest, root)
    assert.equal(
      verdict.complete,
      true,
      [
        'Universal-feature completion Chut is red; every required evidence record must be present and resolved.',
        ...verdict.errors,
      ].join('\\n')
    )
  })

  it('proves every feature row and evidence dimension fails closed under content-aware mutation', () => {
    const inventory = parseFixture<CanonicalInventory>(
      'app/test/fixtures/feature-completeness/canonical-features.json'
    )
    const manifest = parseFixture<EvidenceManifest>(
      'app/test/fixtures/feature-completeness/evidence-paths.json'
    )

    for (const feature of inventory.features) {
      const removed = {
        ...inventory,
        features: inventory.features.filter(
          candidate => candidate.id !== feature.id
        ),
      }
      assert.equal(
        validateInventoryShape(removed, manifest.canonicalFeatureDigest).some(
          error => error.includes('canonical feature rows were removed')
        ),
        true,
        `${feature.id} row-removal mutation did not turn the contract red`
      )

      for (const dimension of evidenceDimensions) {
        const mutated = structuredClone(manifest)
        const row = mutated.features.find(
          candidate => candidate.id === feature.id
        )
        assert.ok(row)
        row.evidence[dimension] = []
        assert.ok(
          validateEvidenceManifestShape(
            mutated,
            inventory.features,
            manifest.canonicalFeatureDigest
          ).some(error =>
            error.includes(
              `${feature.id}/${dimension} must contain at least one`
            )
          ),
          `${feature.id}/${dimension} record removal did not turn the contract red`
        )

        const evidenceMutation = structuredClone(manifest)
        const evidenceRow = evidenceMutation.features.find(
          candidate => candidate.id === feature.id
        )
        assert.ok(evidenceRow)
        const firstRecord = evidenceRow.evidence[dimension][0]
        if (firstRecord.status === 'present') {
          firstRecord.paths = [`missing/${feature.id}/${dimension}.evidence`]
          assert.ok(
            validateEvidenceCompletion(evidenceMutation, root).some(
              error =>
                error.includes(`${feature.id}/${dimension}`) &&
                error.includes('claims missing evidence path')
            ),
            `${feature.id}/${dimension} path mutation did not turn completion red`
          )
        } else {
          delete firstRecord.reason
          assert.ok(
            validateEvidenceManifestShape(
              evidenceMutation,
              inventory.features,
              manifest.canonicalFeatureDigest
            ).some(
              error =>
                error.includes(
                  `${feature.id}/${dimension} ${firstRecord.status}`
                ) && error.includes('needs a reason')
            ),
            `${feature.id}/${dimension} pending-reason mutation did not turn the contract red`
          )
        }
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
