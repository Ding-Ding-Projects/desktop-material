import assert from 'node:assert'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, it } from 'node:test'

const root = join(__dirname, '..', '..', '..')

interface CanonicalFeatureInventory {
  readonly features: ReadonlyArray<{ readonly id: string }>
}

interface SurfaceRecord {
  readonly id: 'windows-desktop' | 'linux-terminal' | 'documentation-pages'
  readonly kind: 'desktop' | 'terminal' | 'site'
  readonly featureIds: ReadonlyArray<string>
  readonly routeInventory: ReadonlyArray<string>
  readonly sourceInventories: ReadonlyArray<string>
}

interface SurfaceInventory {
  readonly schemaVersion: number
  readonly surfaces: ReadonlyArray<SurfaceRecord>
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(root, path), 'utf8')) as T
}

function enumMembers(source: string, name: string): ReadonlyArray<string> {
  const body = source.match(
    new RegExp(`export enum ${name}\\s*\\{([\\s\\S]*?)\\n\\}`)
  )?.[1]
  assert.ok(body, `Could not find enum ${name}`)
  return [...body.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:=.*)?,$/gm)].map(
    match => match[1]
  )
}

function desktopRoutes(): ReadonlyArray<string> {
  const popup = enumMembers(
    readFileSync(join(root, 'app/src/models/popup.ts'), 'utf8'),
    'PopupType'
  ).map(id => `popup:${id}`)
  const teleportSource = readFileSync(
    join(root, 'app/src/lib/teleport-targets.ts'),
    'utf8'
  )
  const body = teleportSource.match(
    /export const TeleportTargetSelectors = \{([\s\S]*?)\n\} as const/
  )?.[1]
  assert.ok(body, 'Could not find TeleportTargetSelectors')
  const teleport = [
    ...body.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*)\s*:/gm),
  ].map(match => `teleport:${match[1]}`)
  return [...popup, ...teleport].sort()
}

function terminalRoutes(): ReadonlyArray<string> {
  return readdirSync(join(root, 'tui/src/desktop_material_tui/ui/screens'))
    .filter(name => name.endsWith('.py') && name !== '__init__.py')
    .map(name => `screen:${name.slice(0, -3)}`)
    .sort()
}

function htmlPages(directory: string): ReadonlyArray<string> {
  const pages = new Array<string>()
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        visit(path)
      } else if (entry.name.endsWith('.html')) {
        pages.push(relative(root, path).split(sep).join('/'))
      }
    }
  }
  visit(join(root, directory))
  return pages.sort()
}

function errorsFor(
  inventory: SurfaceInventory,
  canonicalFeatures: ReadonlyArray<string>
): ReadonlyArray<string> {
  const errors = new Array<string>()
  const expectedRoutes = new Map<string, ReadonlyArray<string>>([
    ['windows-desktop', desktopRoutes()],
    ['linux-terminal', terminalRoutes()],
    ['documentation-pages', htmlPages('docs')],
  ])
  const expectedIds = [
    'windows-desktop',
    'linux-terminal',
    'documentation-pages',
  ].sort()

  if (inventory.schemaVersion !== 1) {
    errors.push('unsupported schema version')
  }
  if (
    JSON.stringify(inventory.surfaces.map(surface => surface.id).sort()) !==
    JSON.stringify(expectedIds)
  ) {
    errors.push('surface families differ from the hand-written contract')
  }

  for (const surface of inventory.surfaces) {
    if (
      JSON.stringify(surface.featureIds) !== JSON.stringify(canonicalFeatures)
    ) {
      errors.push(`${surface.id} does not enumerate every canonical feature`)
    }
    if (
      JSON.stringify([...surface.routeInventory].sort()) !==
      JSON.stringify([...(expectedRoutes.get(surface.id) ?? [])].sort())
    ) {
      errors.push(`${surface.id} route inventory is stale or incomplete`)
    }
    if (
      surface.sourceInventories.length === 0 ||
      surface.sourceInventories.some(path => !existsSync(join(root, path)))
    ) {
      errors.push(`${surface.id} has a missing source inventory`)
    }
  }
  return errors
}

describe('canonical feature surface inventory', () => {
  const canonical = readJson<CanonicalFeatureInventory>(
    'app/test/fixtures/feature-completeness/canonical-features.json'
  ).features.map(feature => feature.id)
  const inventory = readJson<SurfaceInventory>(
    'app/test/fixtures/feature-completeness/canonical-surfaces.json'
  )

  it('enumerates every feature and current route on all three surface families', () => {
    assert.deepEqual(errorsFor(inventory, canonical), [])
  })

  it('turns red when any feature, route, or source inventory disappears', () => {
    for (const surface of inventory.surfaces) {
      const withoutFeature = structuredClone(inventory)
      const featureRow = withoutFeature.surfaces.find(
        row => row.id === surface.id
      )
      assert.ok(featureRow)
      ;(featureRow.featureIds as Array<string>).pop()
      assert.ok(
        errorsFor(withoutFeature, canonical).some(error =>
          error.includes(
            `${surface.id} does not enumerate every canonical feature`
          )
        )
      )

      const withoutRoute = structuredClone(inventory)
      const routeRow = withoutRoute.surfaces.find(row => row.id === surface.id)
      assert.ok(routeRow)
      ;(routeRow.routeInventory as Array<string>).pop()
      assert.ok(
        errorsFor(withoutRoute, canonical).some(error =>
          error.includes(`${surface.id} route inventory is stale or incomplete`)
        )
      )

      const withoutSource = structuredClone(inventory)
      const sourceRow = withoutSource.surfaces.find(
        row => row.id === surface.id
      )
      assert.ok(sourceRow)
      ;(
        sourceRow.sourceInventories as Array<string>
      )[0] = `missing/${surface.id}/inventory`
      assert.ok(
        errorsFor(withoutSource, canonical).some(error =>
          error.includes(`${surface.id} has a missing source inventory`)
        )
      )
    }
  })
})
