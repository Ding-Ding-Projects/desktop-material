const ReservedWslDistributionNames = new Set([
  'docker-desktop',
  'docker-desktop-data',
])

export function normalizeManageableWslDistribution(
  value: unknown
): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim()
  if (
    normalized.length === 0 ||
    normalized.length > 128 ||
    /[\0-\x1f\x7f]/.test(normalized) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized) ||
    ReservedWslDistributionNames.has(normalized.toLocaleLowerCase())
  ) {
    return null
  }
  return normalized
}

export function parseManageableWslDistributions(
  output: string,
  maximum: number = 32
): ReadonlyArray<string> {
  const seen = new Set<string>()
  const distributions: string[] = []
  for (const line of output.split(/\r?\n/)) {
    const value = normalizeManageableWslDistribution(line)
    if (value === null) {
      continue
    }
    const key = value.toLocaleLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      distributions.push(value)
    }
    if (distributions.length === maximum) {
      break
    }
  }
  return distributions
}
