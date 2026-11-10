/**
 * Windows virtual disks: checked plans and the exact `diskpart` script for
 * each one.
 *
 * Nothing here touches a disk. A plan is validated and turned into the script
 * a person can read, copy and run from an elevated prompt.
 */

export type VirtualDiskFormat = 'vhd' | 'vhdx'
export type VirtualDiskAllocation = 'expandable' | 'fixed'

export type VirtualDiskOperation =
  | {
      readonly kind: 'create'
      readonly path: string
      readonly sizeMegabytes: number
      readonly allocation: VirtualDiskAllocation
    }
  | {
      readonly kind: 'attach'
      readonly path: string
      readonly readOnly: boolean
    }
  | { readonly kind: 'detach'; readonly path: string }
  | {
      readonly kind: 'expand'
      readonly path: string
      readonly sizeMegabytes: number
    }
  | { readonly kind: 'compact'; readonly path: string }
  | { readonly kind: 'merge'; readonly path: string; readonly depth: number }

export const VirtualDiskOperationKinds = [
  'create',
  'attach',
  'detach',
  'expand',
  'compact',
  'merge',
] as const
export type VirtualDiskOperationKind =
  (typeof VirtualDiskOperationKinds)[number]

export const VirtualDiskOperationLabels: Readonly<
  Record<VirtualDiskOperationKind, string>
> = {
  create: 'Create a virtual disk',
  attach: 'Attach (mount)',
  detach: 'Detach (unmount)',
  expand: 'Grow the maximum size',
  compact: 'Compact an expandable disk',
  merge: 'Merge a differencing disk into its parent',
}

/** The smallest disk Windows will create. */
export const MinVirtualDiskMegabytes = 3
/** VHD stops at 2,040 GB; VHDX at 64 TB. */
export const MaxVhdMegabytes = 2040 * 1024
export const MaxVhdxMegabytes = 64 * 1024 * 1024

export type VirtualDiskPlan =
  | { readonly ok: true; readonly script: string; readonly summary: string }
  | { readonly ok: false; readonly errors: ReadonlyArray<string> }

export function virtualDiskFormat(path: string): VirtualDiskFormat | null {
  const lower = path.trim().toLowerCase()
  if (lower.endsWith('.vhdx')) {
    return 'vhdx'
  }
  return lower.endsWith('.vhd') ? 'vhd' : null
}

function checkPath(path: string, errors: Array<string>) {
  const trimmed = path.trim()
  if (!/^[a-zA-Z]:\\[^<>:"|?*\r\n]+$/.test(trimmed)) {
    errors.push(
      'Use a full Windows path such as D:\\Disks\\data.vhdx, without quotation marks.'
    )
  }
  if (virtualDiskFormat(trimmed) === null) {
    errors.push('The file name must end in .vhd or .vhdx.')
  }
}

function checkSize(path: string, megabytes: number, errors: Array<string>) {
  if (!Number.isInteger(megabytes) || megabytes < MinVirtualDiskMegabytes) {
    errors.push(
      `The size must be a whole number of megabytes, at least ${MinVirtualDiskMegabytes}.`
    )
    return
  }
  const format = virtualDiskFormat(path)
  if (format === 'vhd' && megabytes > MaxVhdMegabytes) {
    errors.push('A .vhd file cannot be larger than 2,040 GB. Use .vhdx.')
  }
  if (format === 'vhdx' && megabytes > MaxVhdxMegabytes) {
    errors.push('A .vhdx file cannot be larger than 64 TB.')
  }
}

const megabytesText = (megabytes: number) =>
  megabytes >= 1024 && megabytes % 1024 === 0
    ? `${megabytes / 1024} GB`
    : `${megabytes} MB`

/** Validate an operation and write its `diskpart` script. */
export function planVirtualDiskOperation(
  operation: VirtualDiskOperation
): VirtualDiskPlan {
  const errors = new Array<string>()
  checkPath(operation.path, errors)
  if (operation.kind === 'create' || operation.kind === 'expand') {
    checkSize(operation.path, operation.sizeMegabytes, errors)
  }
  if (
    operation.kind === 'merge' &&
    (!Number.isInteger(operation.depth) ||
      operation.depth < 1 ||
      operation.depth > 16)
  ) {
    errors.push('The merge depth must be a whole number from 1 to 16.')
  }
  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const file = `"${operation.path.trim()}"`
  const select = `select vdisk file=${file}`
  switch (operation.kind) {
    case 'create':
      return {
        ok: true,
        script: `create vdisk file=${file} maximum=${operation.sizeMegabytes} type=${operation.allocation}`,
        summary: `Creates ${
          operation.allocation === 'fixed' ? 'a fixed-size' : 'an expandable'
        } ${megabytesText(
          operation.sizeMegabytes
        )} disk. diskpart refuses if the file already exists.`,
      }
    case 'attach':
      return {
        ok: true,
        script: `${select}\nattach vdisk${operation.readOnly ? ' readonly' : ''}`,
        summary: operation.readOnly
          ? 'Attaches the disk read-only. Nothing on it can be changed.'
          : 'Attaches the disk so Windows can read and write it.',
      }
    case 'detach':
      return {
        ok: true,
        script: `${select}\ndetach vdisk`,
        summary:
          'Detaches the disk. Close anything using it first, or Windows refuses.',
      }
    case 'expand':
      return {
        ok: true,
        script: `${select}\nexpand vdisk maximum=${operation.sizeMegabytes}`,
        summary: `Raises the maximum size to ${megabytesText(
          operation.sizeMegabytes
        )}. The disk must be detached, and the volume inside still has to be extended afterwards.`,
      }
    case 'compact':
      return {
        ok: true,
        script: `${select}\nattach vdisk readonly\ncompact vdisk\ndetach vdisk`,
        summary:
          'Shrinks the file of an expandable disk to the space in use. The disk is attached read-only for the duration.',
      }
    case 'merge':
      return {
        ok: true,
        script: `${select}\nmerge vdisk depth=${operation.depth}`,
        summary: `Merges this differencing disk into ${
          operation.depth === 1 ? 'its parent' : `${operation.depth} parents`
        }. This changes the parent and cannot be undone: back the parent up first.`,
      }
  }
}

/** The command that runs a saved script. It needs an elevated prompt. */
export function diskpartCommand(scriptPath: string): string {
  return `diskpart /s "${scriptPath}"`
}
