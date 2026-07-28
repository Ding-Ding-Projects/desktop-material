import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
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
}

interface ICheapLfsAssetTreeRowProps {
  readonly node: ICheapLfsAssetTreeNode
  readonly level: number
  readonly selectedPaths: ReadonlySet<string>
  readonly expandedPaths: ReadonlySet<string>
  readonly forceExpanded: boolean
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
    forceExpanded,
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

  return (
    <li
      className={`cheap-lfs-asset-tree-item ${node.kind}`}
      role="treeitem"
      aria-level={level}
      aria-expanded={folder ? expanded : undefined}
      aria-selected={checkboxValue === CheckboxValue.On}
    >
      <div className="cheap-lfs-asset-tree-row">
        {folder ? (
          <button
            type="button"
            className="cheap-lfs-folder-disclosure"
            aria-label={t(
              expanded
                ? 'clone.cheapLfs.selectorCollapse'
                : 'clone.cheapLfs.selectorExpand',
              { path: node.path }
            )}
            aria-expanded={expanded}
            onClick={onDisclosureClick}
          >
            <MaterialSymbol
              name={expanded ? 'keyboard_arrow_down' : 'expand_more'}
              size={18}
            />
          </button>
        ) : (
          <span className="cheap-lfs-file-indent" aria-hidden={true} />
        )}
        <Checkbox
          value={checkboxValue}
          onChange={onCheckboxChange}
          ariaLabel={checkboxLabel}
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
              forceExpanded={forceExpanded}
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
    }))
  }

  private onToggleExpanded = (path: string) => {
    this.setState(state => {
      const expandedPaths = new Set(state.expandedPaths)
      if (expandedPaths.has(path)) {
        expandedPaths.delete(path)
      } else {
        expandedPaths.add(path)
      }
      return { expandedPaths }
    })
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
              <button type="button" onClick={this.onSelectAll}>
                {t('clone.cheapLfs.selectorSelectAll')}
              </button>
              <button type="button" onClick={this.onSelectNone}>
                {t('clone.cheapLfs.selectorSelectNone')}
              </button>
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
              >
                {tree.map(node => (
                  <CheapLfsAssetTreeRow
                    key={`${node.kind}:${node.path}`}
                    node={node}
                    level={1}
                    selectedPaths={this.state.selectedPaths}
                    expandedPaths={this.state.expandedPaths}
                    forceExpanded={forceExpanded}
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
