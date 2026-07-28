import { ICheapLfsCloneInventoryAsset } from '../../lib/cheap-lfs/clone-inventory'
import { isSafeCheapLfsClonePath } from '../../models/cheap-lfs-clone-selection'
import { CheckboxValue } from '../lib/checkbox'

export interface ICheapLfsAssetFileNode {
  readonly kind: 'file'
  readonly name: string
  readonly path: string
  readonly asset: ICheapLfsCloneInventoryAsset
  readonly descendantPaths: ReadonlyArray<string>
}

export interface ICheapLfsAssetFolderNode {
  readonly kind: 'folder'
  readonly name: string
  readonly path: string
  readonly children: ReadonlyArray<ICheapLfsAssetTreeNode>
  readonly descendantPaths: ReadonlyArray<string>
}

export type ICheapLfsAssetTreeNode =
  | ICheapLfsAssetFileNode
  | ICheapLfsAssetFolderNode

interface IMutableFolderNode {
  readonly name: string
  readonly path: string
  readonly folders: Map<string, IMutableFolderNode>
  readonly files: ICheapLfsCloneInventoryAsset[]
}

function mutableFolder(name: string, path: string): IMutableFolderNode {
  return { name, path, folders: new Map(), files: [] }
}

function finalizeFolder(folder: IMutableFolderNode): ICheapLfsAssetFolderNode {
  const folders = [...folder.folders.values()]
    .sort((left, right) => (left.name < right.name ? -1 : 1))
    .map(finalizeFolder)
  const files: ReadonlyArray<ICheapLfsAssetFileNode> = folder.files
    .sort((left, right) => (left.path < right.path ? -1 : 1))
    .map(asset => ({
      kind: 'file',
      name: asset.path.slice(asset.path.lastIndexOf('/') + 1),
      path: asset.path,
      asset,
      descendantPaths: [asset.path],
    }))
  const children = [...folders, ...files]
  return {
    kind: 'folder',
    name: folder.name,
    path: folder.path,
    children,
    descendantPaths: children.flatMap(child => child.descendantPaths),
  }
}

/**
 * Build a stable directory-first tree from already validated manifest assets.
 * The safety checks are repeated here so this UI model is safe in isolation
 * when exercised by tests or future callers.
 */
export function buildCheapLfsAssetTree(
  assets: ReadonlyArray<ICheapLfsCloneInventoryAsset>
): ReadonlyArray<ICheapLfsAssetTreeNode> {
  const root = mutableFolder('', '')
  const foldedPaths = new Set<string>()

  for (const asset of assets) {
    if (!isSafeCheapLfsClonePath(asset.path)) {
      throw new Error('Cheap LFS asset tree received an unsafe path.')
    }
    const folded = asset.path.toLocaleLowerCase('en-US')
    if (foldedPaths.has(folded)) {
      throw new Error('Cheap LFS asset tree received an aliased path.')
    }
    foldedPaths.add(folded)

    const segments = asset.path.split('/')
    let current = root
    for (let index = 0; index < segments.length - 1; index++) {
      const name = segments[index]
      const path = current.path.length === 0 ? name : `${current.path}/${name}`
      let child = current.folders.get(name)
      if (child === undefined) {
        child = mutableFolder(name, path)
        current.folders.set(name, child)
      }
      current = child
    }
    current.files.push(asset)
  }

  return finalizeFolder(root).children
}

/** Derive the tri-state checkbox value for any file/folder node. */
export function getCheapLfsAssetNodeCheckboxValue(
  node: ICheapLfsAssetTreeNode,
  selectedPaths: ReadonlySet<string>
): CheckboxValue {
  const selected = node.descendantPaths.reduce(
    (count, path) => count + (selectedPaths.has(path) ? 1 : 0),
    0
  )
  return selected === 0
    ? CheckboxValue.Off
    : selected === node.descendantPaths.length
    ? CheckboxValue.On
    : CheckboxValue.Mixed
}

/**
 * Toggle a node as one transaction: any incomplete node becomes fully
 * selected, while a fully selected node becomes fully deselected.
 */
export function toggleCheapLfsAssetNode(
  node: ICheapLfsAssetTreeNode,
  selectedPaths: ReadonlySet<string>
): ReadonlySet<string> {
  const next = new Set(selectedPaths)
  const fullySelected = node.descendantPaths.every(path => next.has(path))
  for (const path of node.descendantPaths) {
    if (fullySelected) {
      next.delete(path)
    } else {
      next.add(path)
    }
  }
  return next
}

/**
 * Keep matching files and their ancestor folders. Folder descendant lists are
 * narrowed to the visible matches so a checkbox used while searching affects
 * exactly what the user can currently see.
 */
export function filterCheapLfsAssetTree(
  nodes: ReadonlyArray<ICheapLfsAssetTreeNode>,
  visiblePaths: ReadonlySet<string>
): ReadonlyArray<ICheapLfsAssetTreeNode> {
  const result = new Array<ICheapLfsAssetTreeNode>()
  for (const node of nodes) {
    if (node.kind === 'file') {
      if (visiblePaths.has(node.path)) {
        result.push(node)
      }
      continue
    }

    const children = filterCheapLfsAssetTree(node.children, visiblePaths)
    if (children.length > 0) {
      result.push({
        ...node,
        children,
        descendantPaths: children.flatMap(child => child.descendantPaths),
      })
    }
  }
  return result
}

/** Folder paths at the first level, expanded on initial presentation. */
export function getInitialCheapLfsExpandedPaths(
  nodes: ReadonlyArray<ICheapLfsAssetTreeNode>
): ReadonlySet<string> {
  return new Set(
    nodes.flatMap(node => (node.kind === 'folder' ? [node.path] : []))
  )
}
