/**
 * The `server.properties` keys the panel may change, and the checks on each.
 *
 * Only this short list can be written. Keys that weaken a server's security
 * (such as `online-mode`) or point it at other files (such as `level-name`)
 * are deliberately not on it.
 */

export type MinecraftPropertyKind =
  | { readonly kind: 'boolean' }
  | { readonly kind: 'integer'; readonly min: number; readonly max: number }
  | { readonly kind: 'choice'; readonly choices: ReadonlyArray<string> }
  | { readonly kind: 'text'; readonly maxLength: number }

export interface IMinecraftPropertySpec {
  readonly key: string
  readonly label: string
  readonly type: MinecraftPropertyKind
  readonly fallback: string
}

export const EditableMinecraftProperties: ReadonlyArray<IMinecraftPropertySpec> =
  [
    {
      key: 'motd',
      label: 'Message of the day',
      type: { kind: 'text', maxLength: 59 },
      fallback: 'A Minecraft Server',
    },
    {
      key: 'max-players',
      label: 'Maximum players',
      type: { kind: 'integer', min: 1, max: 1000 },
      fallback: '20',
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: { kind: 'choice', choices: ['peaceful', 'easy', 'normal', 'hard'] },
      fallback: 'easy',
    },
    {
      key: 'gamemode',
      label: 'Default game mode',
      type: {
        kind: 'choice',
        choices: ['survival', 'creative', 'adventure', 'spectator'],
      },
      fallback: 'survival',
    },
    {
      key: 'pvp',
      label: 'Players can hurt each other',
      type: { kind: 'boolean' },
      fallback: 'true',
    },
    {
      key: 'white-list',
      label: 'Only allow listed players',
      type: { kind: 'boolean' },
      fallback: 'false',
    },
    {
      key: 'hardcore',
      label: 'Hardcore',
      type: { kind: 'boolean' },
      fallback: 'false',
    },
    {
      key: 'allow-flight',
      label: 'Allow flight',
      type: { kind: 'boolean' },
      fallback: 'false',
    },
    {
      key: 'view-distance',
      label: 'View distance in chunks',
      type: { kind: 'integer', min: 2, max: 32 },
      fallback: '10',
    },
    {
      key: 'spawn-protection',
      label: 'Spawn protection in blocks',
      type: { kind: 'integer', min: 0, max: 64 },
      fallback: '16',
    },
  ]

export const MaxMinecraftPropertiesBytes = 64 * 1024

/** Read `key=value` lines. Comments and malformed lines are skipped. */
export function parseMinecraftProperties(
  text: string
): ReadonlyMap<string, string> {
  const values = new Map<string, string>()
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const match = /^\s*([A-Za-z0-9.-]+)\s*=(.*)$/.exec(line)
    if (match !== null && !line.trimStart().startsWith('#')) {
      values.set(match[1], match[2].trim())
    }
  }
  return values
}

/** The value to write, or why it cannot be written. */
export function checkMinecraftProperty(
  key: string,
  value: string
):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: string } {
  const spec = EditableMinecraftProperties.find(s => s.key === key)
  if (spec === undefined) {
    return { ok: false, error: 'That setting cannot be changed here.' }
  }
  const text = value.trim()
  switch (spec.type.kind) {
    case 'boolean':
      return text === 'true' || text === 'false'
        ? { ok: true, value: text }
        : { ok: false, error: `${spec.label} must be on or off.` }
    case 'integer': {
      const parsed = Number(text)
      return /^\d+$/.test(text) &&
        parsed >= spec.type.min &&
        parsed <= spec.type.max
        ? { ok: true, value: String(parsed) }
        : {
            ok: false,
            error: `${spec.label} must be a whole parsed from ${spec.type.min} to ${spec.type.max}.`,
          }
    }
    case 'choice':
      return spec.type.choices.includes(text)
        ? { ok: true, value: text }
        : {
            ok: false,
            error: `${spec.label} must be one of: ${spec.type.choices.join(
              ', '
            )}.`,
          }
    case 'text':
      return text.length <= spec.type.maxLength &&
        /^[\x20-\x7e]*$/.test(text) &&
        !text.includes('\\')
        ? { ok: true, value: text }
        : {
            ok: false,
            error: `${spec.label} must be at most ${spec.type.maxLength} plain characters.`,
          }
  }
}

/** The editable settings with their current values. */
export function editableMinecraftProperties(text: string): ReadonlyArray<{
  readonly spec: IMinecraftPropertySpec
  readonly value: string
}> {
  const values = parseMinecraftProperties(text)
  return EditableMinecraftProperties.map(spec => ({
    spec,
    value: values.get(spec.key) ?? spec.fallback,
  }))
}

/**
 * The world folder name from `level-name`, or null when it is not a plain
 * folder name inside the server folder.
 */
export function minecraftWorldFolder(text: string): string | null {
  const name = parseMinecraftProperties(text).get('level-name') ?? 'world'
  return /^[A-Za-z0-9 _.-]{1,64}$/.test(name) &&
    name !== '.' &&
    name !== '..' &&
    !name.endsWith('.') &&
    !name.endsWith(' ')
    ? name
    : null
}

/** A backup folder name: the world, then a sortable UTC time. */
export function minecraftBackupName(world: string, now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replace(/:/g, '')
  return `${world}-${stamp}`
}
