export interface IBranchNamePreset {
  readonly name: string
  readonly description: string
}

/** Parses one `name description` preset per output line. */
export function parseBranchNamePresets(
  commandOutput: string
): ReadonlyArray<IBranchNamePreset> {
  return commandOutput
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const match = /^(\S+)(?:\s+(.*))?$/.exec(line)
      const name = match?.[1] ?? line
      return { name, description: match?.[2]?.trim() || name }
    })
}
