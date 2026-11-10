import * as React from 'react'

import {
  VirtualDiskAllocation,
  VirtualDiskOperation,
  VirtualDiskOperationKind,
  VirtualDiskOperationKinds,
  VirtualDiskOperationLabels,
  planVirtualDiskOperation,
} from '../../lib/virtual-disks'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'

interface IVirtualDiskPlannerProps {
  /** Injectable so tests do not need a clipboard. */
  readonly copyText?: (text: string) => void
}

interface IVirtualDiskPlannerState {
  readonly kind: VirtualDiskOperationKind
  readonly path: string
  readonly sizeGigabytes: string
  readonly allocation: VirtualDiskAllocation
  readonly readOnly: boolean
  readonly depth: string
  readonly copied: boolean
}

const defaultCopyText = (text: string) => {
  void navigator.clipboard.writeText(text)
}

/**
 * Plans a Windows virtual disk operation and shows the exact diskpart script.
 * It does not run anything: the script is copied and run by the person from an
 * elevated prompt, so nothing here can change a disk by itself.
 */
export class VirtualDiskPlanner extends React.Component<
  IVirtualDiskPlannerProps,
  IVirtualDiskPlannerState
> {
  public constructor(props: IVirtualDiskPlannerProps) {
    super(props)
    this.state = {
      kind: 'create',
      path: '',
      sizeGigabytes: '20',
      allocation: 'expandable',
      readOnly: true,
      depth: '1',
      copied: false,
    }
  }

  private get operation(): VirtualDiskOperation {
    const { kind, path, allocation, readOnly } = this.state
    const sizeMegabytes = Math.round(Number(this.state.sizeGigabytes) * 1024)
    switch (kind) {
      case 'create':
        return { kind, path, sizeMegabytes, allocation }
      case 'expand':
        return { kind, path, sizeMegabytes }
      case 'attach':
        return { kind, path, readOnly }
      case 'merge':
        return { kind, path, depth: Number(this.state.depth) }
      default:
        return { kind, path }
    }
  }

  private onKindChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.setState({
      kind: event.currentTarget.value as VirtualDiskOperationKind,
      copied: false,
    })
  }

  private onAllocationChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.setState({
      allocation: event.currentTarget.value as VirtualDiskAllocation,
      copied: false,
    })
  }

  private onPathChanged = (path: string) =>
    this.setState({ path, copied: false })

  private onSizeChanged = (sizeGigabytes: string) =>
    this.setState({ sizeGigabytes, copied: false })

  private onDepthChanged = (depth: string) =>
    this.setState({ depth, copied: false })

  private onReadOnlyChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ readOnly: event.currentTarget.checked, copied: false })
  }

  private onCopy = () => {
    const plan = planVirtualDiskOperation(this.operation)
    if (plan.ok) {
      ;(this.props.copyText ?? defaultCopyText)(plan.script)
      this.setState({ copied: true })
    }
  }

  public render() {
    const { kind, path, copied } = this.state
    const plan = planVirtualDiskOperation(this.operation)
    const untouched = path.trim().length === 0
    return (
      <section
        className="virtual-disk-planner"
        aria-labelledby="virtual-disk-planner-title"
      >
        <div className="file-converter-section-heading">
          <h3 id="virtual-disk-planner-title">Virtual disks</h3>
          <span>Plans only. Nothing is run for you.</span>
        </div>
        <div className="virtual-disk-planner-form">
          <Select label="What to do" value={kind} onChange={this.onKindChanged}>
            {VirtualDiskOperationKinds.map(value => (
              <option key={value} value={value}>
                {VirtualDiskOperationLabels[value]}
              </option>
            ))}
          </Select>
          <TextBox
            label="Virtual disk file"
            placeholder="D:\Disks\data.vhdx"
            value={path}
            onValueChanged={this.onPathChanged}
          />
          {(kind === 'create' || kind === 'expand') && (
            <TextBox
              label="Maximum size in GB"
              value={this.state.sizeGigabytes}
              onValueChanged={this.onSizeChanged}
            />
          )}
          {kind === 'create' && (
            <Select
              label="Space on the host"
              value={this.state.allocation}
              onChange={this.onAllocationChanged}
            >
              <option value="expandable">Grows as it fills (expandable)</option>
              <option value="fixed">Reserved up front (fixed)</option>
            </Select>
          )}
          {kind === 'attach' && (
            <Checkbox
              label="Attach read-only"
              value={this.state.readOnly ? CheckboxValue.On : CheckboxValue.Off}
              onChange={this.onReadOnlyChanged}
            />
          )}
          {kind === 'merge' && (
            <TextBox
              label="How many parents to merge into"
              value={this.state.depth}
              onValueChanged={this.onDepthChanged}
            />
          )}
        </div>
        {plan.ok ? (
          <div className="virtual-disk-planner-plan">
            <p>{plan.summary}</p>
            <label htmlFor="virtual-disk-planner-script">diskpart script</label>
            <pre id="virtual-disk-planner-script">{plan.script}</pre>
            <div className="file-converter-actions">
              <Button onClick={this.onCopy}>Copy script</Button>
              <span role="status">{copied ? 'Copied.' : ''}</span>
            </div>
            <p className="virtual-disk-planner-note">
              To run it: save the script as a text file, open a terminal as
              administrator, and run diskpart /s with the file's path. Windows
              asks for your approval first.
            </p>
          </div>
        ) : (
          !untouched && (
            <ul className="file-converter-error" role="alert">
              {plan.errors.map(error => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )
        )}
        {untouched && (
          <p className="virtual-disk-planner-note">
            Type the full path of a .vhd or .vhdx file to see the script.
          </p>
        )}
      </section>
    )
  }
}
