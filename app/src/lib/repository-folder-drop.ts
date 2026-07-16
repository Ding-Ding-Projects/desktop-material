/** True only for operating-system file/folder drags, not internal tab drags. */
export function isRepositoryFileDrag(types: Iterable<string>): boolean {
  return Array.from(types).some(type => type === 'Files')
}

/** Drop empty renderer paths and preserve the user's first-seen folder order. */
export function uniqueDroppedRepositoryPaths(
  paths: ReadonlyArray<string>
): ReadonlyArray<string> {
  const unique: string[] = []
  const seen = new Set<string>()
  for (const path of paths) {
    if (path.length === 0) {
      continue
    }
    const normalized = path.replace(/[\\/]+$/, '').replace(/\\/g, '/')
    const comparable =
      /^[a-z]:\//i.test(normalized) || normalized.startsWith('//')
        ? normalized.toLowerCase()
        : normalized
    if (!seen.has(comparable)) {
      seen.add(comparable)
      unique.push(path)
    }
  }
  return unique
}
