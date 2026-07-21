import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { DefaultAppIdentityCustomization } from '../../../src/models/app-identity'
import { DefaultRepositoryLogoDesign } from '../../../src/models/repository-logo'
import {
  AppearanceEditorElementId,
  AppIdentityAppearanceEditor,
  AppWorkspaceAppearanceEditor,
  CodeDiffAppearanceEditor,
  DefaultRepositoryLogoAppearanceEditor,
  FeatureHighlightingAppearanceEditor,
  RepositoryListAppearanceEditor,
  RepositoryToolbarAppearanceEditor,
  RepositoryTabsAppearanceEditor,
  ToolbarAppearanceEditor,
  UpdateProgressAppearanceEditor,
} from '../../../src/ui/appearance'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('element appearance editor content', () => {
  it('edits only its narrow value and exposes its own history action', () => {
    const changes = new Array<{
      accentPalette: 'blue' | 'violet' | 'teal' | 'green' | 'amber' | 'rose'
      surfacePalette: 'tonal' | 'neutral'
      elevation: 'standard' | 'subtle' | 'flat'
      uiFont: 'material' | 'system'
      motion: 'system' | 'reduced'
    }>()
    let historyRequests = 0

    render(
      <AppWorkspaceAppearanceEditor
        value={{
          accentPalette: 'blue',
          surfacePalette: 'tonal',
          elevation: 'standard',
          uiFont: 'material',
          motion: 'system',
        }}
        onChange={value => changes.push(value)}
        onShowHistory={() => historyRequests++}
      />
    )

    const editor = screen.getByRole('region', {
      name: 'App workspace appearance',
    })
    assert.equal(
      editor.getAttribute('data-appearance-element-id'),
      AppearanceEditorElementId.AppWorkspace
    )

    fireEvent.change(screen.getByLabelText('Accent color'), {
      target: { value: 'rose' },
    })
    assert.deepEqual(changes, [
      {
        accentPalette: 'rose',
        surfacePalette: 'tonal',
        elevation: 'standard',
        uiFont: 'material',
        motion: 'system',
      },
    ])

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open app workspace appearance history',
      })
    )
    assert.equal(historyRequests, 1)
  })

  it('renders each focused editor and keeps repository-only tab fields narrow', () => {
    const onChange = () => undefined
    const onShowHistory = () => undefined

    const view = render(
      <>
        <UpdateProgressAppearanceEditor
          value={{ updateProgressPalette: 'accent' }}
          onChange={onChange}
          onShowHistory={onShowHistory}
        />
        <CodeDiffAppearanceEditor
          value={{ monospaceFont: 'platform' }}
          onChange={onChange}
          onShowHistory={onShowHistory}
        />
        <ToolbarAppearanceEditor
          value={{ toolbarLabels: 'auto', toolbarDensity: 'comfortable' }}
          onChange={onChange}
          onShowHistory={onShowHistory}
        />
        <RepositoryListAppearanceEditor
          value={{ repositoryListDensity: 'comfortable' }}
          onChange={onChange}
          onShowHistory={onShowHistory}
        />
        <FeatureHighlightingAppearanceEditor
          value={{ highlightDesktopMaterialFeatures: false }}
          onChange={onChange}
          onShowHistory={onShowHistory}
        />
      </>
    )

    for (const title of [
      'Update progress appearance',
      'Code and diff appearance',
      'Toolbar appearance',
      'Repository list appearance',
      'Feature highlighting appearance',
    ]) {
      assert.ok(screen.getByRole('region', { name: title }))
    }

    const tabChanges = new Array<Record<string, unknown>>()
    view.rerender(
      <RepositoryTabsAppearanceEditor
        value={{ tabDensity: 'comfortable', tabWidth: 'standard' }}
        onChange={value => tabChanges.push(value)}
        onShowHistory={onShowHistory}
      />
    )
    assert.equal(screen.queryByLabelText('Tab close buttons'), null)
    fireEvent.change(screen.getByLabelText('Tab density'), {
      target: { value: 'compact' },
    })
    assert.deepEqual(tabChanges, [
      { tabDensity: 'compact', tabWidth: 'standard' },
    ])

    view.rerender(
      <RepositoryTabsAppearanceEditor
        value={{
          tabDensity: 'comfortable',
          tabWidth: 'standard',
          tabCloseButtons: 'hover',
        }}
        onChange={onChange}
        onShowHistory={onShowHistory}
      />
    )
    assert.ok(screen.getByLabelText('Tab close buttons'))
  })

  it('hosts the existing identity and logo studios in bounded element panels', () => {
    const view = render(
      <AppIdentityAppearanceEditor
        value={DefaultAppIdentityCustomization}
        onChange={() => undefined}
        onShowHistory={() => undefined}
      />
    )
    assert.ok(screen.getByRole('region', { name: 'App identity appearance' }))
    assert.ok(screen.getByLabelText('App name'))

    view.rerender(
      <DefaultRepositoryLogoAppearanceEditor
        value={DefaultRepositoryLogoDesign}
        repositoryName="Example repository"
        onChange={() => undefined}
        onShowHistory={() => undefined}
      />
    )
    assert.ok(
      screen.getByRole('region', {
        name: 'Default repository logo appearance',
      })
    )
    assert.ok(screen.getByRole('heading', { name: 'Custom repository logo' }))
  })

  it('edits complete toolbar typography and clears repository overrides back to the profile', () => {
    let profileValue: React.ComponentProps<
      typeof ToolbarAppearanceEditor
    >['value'] = {
      toolbarLabels: 'auto' as const,
      toolbarDensity: 'comfortable' as const,
      toolbarTextStyle: null,
    }

    function ProfileHarness() {
      const [value, setValue] = React.useState(profileValue)
      return (
        <ToolbarAppearanceEditor
          value={value}
          onChange={next => {
            profileValue = next
            setValue(next)
          }}
          onShowHistory={() => undefined}
        />
      )
    }

    const view = render(<ProfileHarness />)
    fireEvent.change(screen.getByLabelText('Font family'), {
      target: { value: 'Georgia' },
    })
    fireEvent.change(screen.getByLabelText('Font size'), {
      target: { value: '20' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
    fireEvent.click(screen.getByRole('button', { name: 'Align center' }))
    fireEvent.change(screen.getByLabelText('Custom text color'), {
      target: { value: '#a93a5b' },
    })

    assert.deepEqual(profileValue.toolbarTextStyle, {
      fontFamily: 'Georgia',
      fontSize: 20,
      bold: true,
      textAlign: 'center',
      color: '#a93a5b',
    })

    let repositoryValue: React.ComponentProps<
      typeof RepositoryToolbarAppearanceEditor
    >['value'] = {
      toolbarLabels: null,
      toolbarDensity: null,
      toolbarTextStyle: null,
    }
    function RepositoryHarness() {
      const [value, setValue] = React.useState(repositoryValue)
      return (
        <RepositoryToolbarAppearanceEditor
          value={value}
          inherited={profileValue}
          onChange={next => {
            repositoryValue = next
            setValue(next)
          }}
          onEditProfileDefault={() => undefined}
          onShowHistory={() => undefined}
        />
      )
    }

    view.rerender(<RepositoryHarness />)
    assert.ok(screen.getByText('Inheriting profile typography'))
    fireEvent.click(screen.getByRole('button', { name: 'Italic' }))
    assert.deepEqual(repositoryValue.toolbarTextStyle, { italic: true })
    fireEvent.click(
      screen.getByRole('button', { name: 'Inherit profile', exact: true })
    )
    assert.equal(repositoryValue.toolbarTextStyle, null)
  })
})
