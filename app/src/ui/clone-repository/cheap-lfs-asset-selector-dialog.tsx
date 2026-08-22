import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { FilterModeControl } from '../lib/filter-mode-control'
import { FilterMode } from '../../lib/fuzzy-find'
import { filterByMode } from '../lib/filter-string-list'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { MaterialSymbol } from '../lib/material-symbol'
import {
  createCheapLfsCloneSelection,
  ICheapLfsCloneInventory,
} from '../../lib/cheap-lfs/clone-inventory'
import { ICheapLfsCloneSelection } from '../../models/cheap-lfs-clone-selection'
import { t } from '../../lib/i18n'
import {
  buildCheapLfsAssetTree,
  filterCheapLfsAssetTree,
  flattenVisibleCheapLfsAssetTree,
  getCheapLfsAssetNodeCheckboxValue,
  getInitialCheapLfsExpandedPaths,
  ICheapLfsAssetTreeNode,
  toggleCheapLfsAssetNode,
} from './cheap-lfs-asset-tree'

export const CheapLfsCloneAssetSearchSurfaceId = 'clone-cheap-lfs-assets-search'

interface ICheapLfsAssetSelectorDialogProps {
  readonly repositoryName: string
  readonly accountKey: string
  readonly repositoryCloneUrl: string
  readonly defaultBranch: string
  readonly manifestBlobSha: string
  readonly inventory: ICheapLfsCloneInventory
  readonly initialSelection?: ICheapLfsCloneSelection
  readonly onSelectionConfirmed: (selection: ICheapLfsCloneSelection) => void
  readonly onDismissed: () => void
}

interface ICheapLfsAssetSelectorDialogState {
  readonly filterText: string
  readonly filterMode: FilterMode
  readonly filterCaseSensitive: boolean
  readonly selectedPaths: ReadonlySet<string>
  readonly expandedPaths: ReadonlySet<string>
  readonly activePath: string | null
}

interface ICheapLfsAssetTreeRowProps {
  readonly node: ICheapLfsAssetTreeNode
  readonly level: number
  readonly selectedPaths: ReadonlySet<string>
  readonly expandedPaths: ReadonlySet<string>
  readonly activePath: string
  readonly forceExpanded: boolean
  readonly onActivate: (path: string) => void
  readonly onToggleSelection: (node: ICheapLfsAssetTreeNode) => void
  readonly onToggleExpanded: (path: string) => void
}

/**
 * One accessible recursive tree item. Directory disclosure and selection are
 * separate controls, and every checkbox reflects parent/child tri-state.
 */
function CheapLfsAssetTreeRow(props: ICheapLfsAssetTreeRowProps) {
  const {
    node,
    level,
    selectedPaths,
    expandedPaths,
    activePath,
    forceExpanded,
    onActivate,
    onToggleSelection,
    onToggleExpanded,
  } = props
  const folder = node.kind === 'folder'
  const expanded = folder && (forceExpanded || expandedPaths.has(node.path))
  const onCheckboxChange = React.useCallback(
    () => onToggleSelection(node),
    [node, onToggleSelection]
  )
  const onDisclosureClick = React.useCallback(
    () => onToggleExpanded(node.path),
    [node.path, onToggleExpanded]
  )
  const onRowClick = React.useCallback(
    () => onActivate(node.path),
    [node.path, onActivate]
  )
  const onRowKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLLIElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        onActivate(node.path)
      }
    },
    [node.path, onActivate]
  )
  const checkboxValue = getCheapLfsAssetNodeCheckboxValue(node, selectedPaths)
  const selectedCount = node.descendantPaths.filter(path =>
    selectedPaths.has(path)
  ).length
  const checkboxLabel = folder
    ? t('clone.cheapLfs.selectorFolderAria', {
        selected: String(selectedCount),
        count: String(node.descendantPaths.length),
        path: node.path,
      })
    : t('clone.cheapLfs.selectorFileAria', { path: node.path })
  const active = activePath === node.path

  return (
    <li
      id={`cheap-lfs-asset-tree-item-${encodeURIComponent(node.path)}`}
      className={`cheap-lfs-asset-tree-item ${node.kind}${
        active ? ' active' : ''
      }`}
      role="treeitem"
      aria-level={level}
      aria-expanded={folder ? expanded : undefined}
      aria-selected={checkboxValue === CheckboxValue.On}
      onClick={onRowClick}
      onKeyDown={onRowKeyDown}
    >
      <div className="cheap-lfs-asset-tree-row">
        {folder ? (
          <Button
            type="button"
            className="cheap-lfs-folder-disclosure"
            ariaLabel={t(
              expanded
                ? 'clone.cheapLfs.selectorCollapse'
                : 'clone.cheapLfs.selectorExpand',
              { path: node.path }
            )}
            ariaExpanded={expanded}
            onClick={onDisclosureClick}
            tabIndex={-1}
          >
            <MaterialSymbol
              name={expanded ? 'keyboard_arrow_down' : 'expand_more'}
              size={18}
            />
          </Button>
        ) : (
          <span className="cheap-lfs-file-indent" aria-hidden={true} />
        )}
        <Checkbox
          value={checkboxValue}
          onChange={onCheckboxChange}
          ariaLabel={checkboxLabel}
          tabIndex={-1}
        />
        <MaterialSymbol
          className="cheap-lfs-asset-kind"
          name={folder ? 'stacks' : 'package_2'}
          size={18}
        />
        <span className="cheap-lfs-asset-name">{node.name}</span>
        {node.kind === 'file' && (
          <span className="cheap-lfs-asset-size">
            {node.asset.size.toLocaleString()} B
          </span>
        )}
      </div>
      {node.kind === 'folder' && expanded && (
        <ul role="group">
          {node.children.map(child => (
            <CheapLfsAssetTreeRow
              key={`${child.kind}:${child.path}`}
              node={child}
              level={level + 1}
              selectedPaths={selectedPaths}
              expandedPaths={expandedPaths}
              activePath={activePath}
              forceExpanded={forceExpanded}
              onActivate={onActivate}
              onToggleSelection={onToggleSelection}
              onToggleExpanded={onToggleExpanded}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * Pre-clone Cheap LFS picker. It starts with every inventory asset checked;
 * Cancel discards edits, while Confirm returns one immutable manifest-bound
 * selection to the still-open clone dialog underneath it.
 */
export class CheapLfsAssetSelectorDialog extends React.Component<
  ICheapLfsAssetSelectorDialogProps,
  ICheapLfsAssetSelectorDialogState
> {
  private readonly tree: ReadonlyArray<ICheapLfsAssetTreeNode>
  private treeElement: HTMLUListElement | null = null

  public constructor(props: ICheapLfsAssetSelectorDialogProps) {
    super(props)
    this.tree = buildCheapLfsAssetTree(props.inventory.assets)
    const initialPaths =
      props.initialSelection?.paths ??
      props.inventory.assets.map(asset => asset.path)
    this.state = {
      filterText: '',
      filterMode: FilterMode.Substring,
      filterCaseSensitive: false,
      selectedPaths: new Set(initialPaths),
      expandedPaths: getInitialCheapLfsExpandedPaths(this.tree),
      activePath: this.tree[0]?.path ?? null,
    }
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onFilterModeChanged = (filterMode: FilterMode) => {
    this.setState({ filterMode })
  }

  private onFilterCaseSensitiveChanged = (filterCaseSensitive: boolean) => {
    this.setState({ filterCaseSensitive })
  }

  private onRegexPatternApply = (
    filterText: string,
    filterCaseSensitive: boolean
  ) => {
    this.setState({
      filterText,
      filterMode: FilterMode.Regex,
      filterCaseSensitive,
    })
  }

  private getSampleItems = () =>
    this.props.inventory.assets.slice(0, 50).map(asset => asset.path)

  private getFilteredAssets() {
    return filterByMode(
      this.props.inventory.assets,
      asset => [asset.path, asset.path.slice(asset.path.lastIndexOf('/') + 1)],
      this.state.filterText,
      this.state.filterMode,
      this.state.filterCaseSensitive
    )
  }

  private onToggleSelection = (node: ICheapLfsAssetTreeNode) => {
    this.setState(state => ({
      selectedPaths: toggleCheapLfsAssetNode(node, state.selectedPaths),
      activePath: node.path,
    }))
    this.treeElement?.focus()
  }

  private onToggleExpanded = (path: string) => {
    this.setState(state => {
      const expandedPaths = new Set(state.expandedPaths)
      if (expandedPaths.has(path)) {
        expandedPaths.delete(path)
      } else {
        expandedPaths.add(path)
      }
      return { expandedPaths, activePath: path }
    })
    this.treeElement?.focus()
  }

  private onActivate = (path: string) => {
    this.setState({ activePath: path })
    this.treeElement?.focus()
  }

  private onTreeRef = (element: HTMLUListElement | null) => {
    this.treeElement = element
  }

  private getVisibleTreeRows() {
    const filtered = this.getFilteredAssets()
    const visiblePaths = new Set(filtered.items.map(asset => asset.path))
    const tree = filterCheapLfsAssetTree(this.tree, visiblePaths)
    return flattenVisibleCheapLfsAssetTree(
      tree,
      this.state.expandedPaths,
      this.state.filterText.trim().length > 0
    )
  }

  private onTreeKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const rows = this.getVisibleTreeRows()
    if (rows.length === 0) {
      return
    }
    let index = rows.findIndex(row => row.node.path === this.state.activePath)
    if (index < 0) {
      index = 0
    }
    const current = rows[index]
    const forceExpanded = this.state.filterText.trim().length > 0
    let nextPath: string | null = null
    let handled = true

    switch (event.key) {
      case 'ArrowDown':
        nextPath = rows[Math.min(index + 1, rows.length - 1)].node.path
        break
      case 'ArrowUp':
        nextPath = rows[Math.max(index - 1, 0)].node.path
        break
      case 'Home':
        nextPath = rows[0].node.path
        break
      case 'End':
        nextPath = rows[rows.length - 1].node.path
        break
      case 'ArrowRight':
        if (current.node.kind !== 'folder') {
          handled = false
          break
        }
        if (
          !forceExpanded &&
          !this.state.expandedPaths.has(current.node.path)
        ) {
          this.onToggleExpanded(current.node.path)
        } else if (rows[index + 1]?.parentPath === current.node.path) {
          nextPath = rows[index + 1].node.path
        }
        break
      case 'ArrowLeft':
        if (
          current.node.kind === 'folder' &&
          !forceExpanded &&
          this.state.expandedPaths.has(current.node.path)
        ) {
          this.onToggleExpanded(current.node.path)
        } else if (current.parentPath !== null) {
          nextPath = current.parentPath
        }
        break
      case ' ':
      case 'Spacebar':
        this.onToggleSelection(current.node)
        break
      case 'Enter':
        if (current.node.kind === 'folder' && !forceExpanded) {
          this.onToggleExpanded(current.node.path)
        } else {
          this.onToggleSelection(current.node)
        }
        break
      default:
        handled = false
        break
    }

    if (!handled) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (nextPath !== null && nextPath !== this.state.activePath) {
      this.setState({ activePath: nextPath })
    }
  }

  private onSelectAll = () => {
    this.setState({
      selectedPaths: new Set(
        this.props.inventory.assets.map(asset => asset.path)
      ),
    })
  }

  private onSelectNone = () => {
    this.setState({ selectedPaths: new Set<string>() })
  }

  private onConfirm = () => {
    const selection = createCheapLfsCloneSelection(
      this.props.accountKey,
      this.props.repositoryCloneUrl,
      this.props.defaultBranch,
      this.props.manifestBlobSha,
      this.props.inventory,
      this.state.selectedPaths
    )
    this.props.onSelectionConfirmed(selection)
    this.props.onDismissed()
  }

  private onSubmit = () => this.onConfirm()

  private onConfirmButtonClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault()
    this.onConfirm()
  }

  private onCancelButtonClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault()
    this.props.onDismissed()
  }

  public render() {
    const filtered = this.getFilteredAssets()
    const visiblePaths = new Set(filtered.items.map(asset => asset.path))
    const tree = filterCheapLfsAssetTree(this.tree, visiblePaths)
    const selectedCount = this.state.selectedPaths.size
    const count = this.props.inventory.assets.length
    const forceExpanded = this.state.filterText.trim().length > 0
    const visibleRows = flattenVisibleCheapLfsAssetTree(
      tree,
      this.state.expandedPaths,
      forceExpanded
    )
    const activePath =
      visibleRows.find(row => row.node.path === this.state.activePath)?.node
        .path ??
      visibleRows[0]?.node.path ??
      null
    const filterErrorId =
      filtered.regexError === null ? undefined : 'cheap-lfs-asset-filter-error'

    return (
      <Dialog
        id="cheap-lfs-clone-assets"
        title={t('clone.cheapLfs.selectorTitle')}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p className="cheap-lfs-asset-summary">
            {t(
              count === 1
                ? 'clone.cheapLfs.selectorSummaryOne'
                : 'clone.cheapLfs.selectorSummaryMany',
              {
                count: String(count),
                repository: this.props.repositoryName,
              }
            )}
          </p>
          <div className="cheap-lfs-asset-selection-toolbar">
            <div className="cheap-lfs-asset-search">
              <TextBox
                searchSurfaceId={CheapLfsCloneAssetSearchSurfaceId}
                displayClearButton={true}
                value={this.state.filterText}
                onValueChanged={this.onFilterTextChanged}
                placeholder={t('clone.cheapLfs.selectorSearchPlaceholder')}
                ariaLabel={t('clone.cheapLfs.selectorSearchAria')}
                ariaInvalid={filtered.regexError !== null}
                ariaDescribedBy={filterErrorId}
              />
              <FilterModeControl
                searchSurfaceId={CheapLfsCloneAssetSearchSurfaceId}
                mode={this.state.filterMode}
                caseSensitive={this.state.filterCaseSensitive}
                onModeChange={this.onFilterModeChanged}
                onCaseSensitiveChange={this.onFilterCaseSensitiveChanged}
                regexBuilderTarget={t('clone.cheapLfs.selectorRegexTarget')}
                getSampleItems={this.getSampleItems}
                filterText={this.state.filterText}
                onRegexPatternApply={this.onRegexPatternApply}
              />
            </div>
            {filtered.regexError !== null && (
              <div
                id="cheap-lfs-asset-filter-error"
                className="cheap-lfs-asset-filter-error"
                role="alert"
              >
                {filtered.regexError}
              </div>
            )}
            <div className="cheap-lfs-asset-bulk-actions">
              <span role="status">
                {t('clone.cheapLfs.selectorSelectedCount', {
                  selected: String(selectedCount),
                  count: String(count),
                })}
              </span>
              <Button type="button" onClick={this.onSelectAll}>
                {t('clone.cheapLfs.selectorSelectAll')}
              </Button>
              <Button type="button" onClick={this.onSelectNone}>
                {t('clone.cheapLfs.selectorSelectNone')}
              </Button>
            </div>
          </div>
          <div className="cheap-lfs-asset-tree-scroll">
            {tree.length === 0 ? (
              <div className="cheap-lfs-asset-empty" role="status">
                {t('clone.cheapLfs.selectorNoMatches')}
              </div>
            ) : (
              <ul
                className="cheap-lfs-asset-tree"
                role="tree"
                aria-label={t('clone.cheapLfs.selectorTreeAria')}
                aria-multiselectable={true}
                aria-activedescendant={
                  activePath === null
                    ? undefined
                    : `cheap-lfs-asset-tree-item-${encodeURIComponent(
                        activePath
                      )}`
                }
                tabIndex={0}
                ref={this.onTreeRef}
                onKeyDown={this.onTreeKeyDown}
              >
                {tree.map(node => (
                  <CheapLfsAssetTreeRow
                    key={`${node.kind}:${node.path}`}
                    node={node}
                    level={1}
                    selectedPaths={this.state.selectedPaths}
                    expandedPaths={this.state.expandedPaths}
                    activePath={activePath ?? ''}
                    forceExpanded={forceExpanded}
                    onActivate={this.onActivate}
                    onToggleSelection={this.onToggleSelection}
                    onToggleExpanded={this.onToggleExpanded}
                  />
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={t(
              selectedCount === 1
                ? 'clone.cheapLfs.selectorIncludeOne'
                : 'clone.cheapLfs.selectorIncludeMany',
              { count: String(selectedCount) }
            )}
            cancelButtonText={t('cheapLfs.cancel')}
            onOkButtonClick={this.onConfirmButtonClick}
            onCancelButtonClick={this.onCancelButtonClick}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
