import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  DefaultRepositoryAppearanceElementSettings,
  IProfileAppearanceElementSettings,
  IRepositoryAppearanceElementSettings,
  ProfileAppearanceElementId,
  RepositoryAppearanceElementId,
} from '../../../src/models/element-appearance'
import { DefaultAppIdentityCustomization } from '../../../src/models/app-identity'
import { Repository } from '../../../src/models/repository'
import { DefaultRepositoryLogoDesign } from '../../../src/models/repository-logo'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { RepositoryAppearance } from '../../../src/ui/repository-settings/repository-appearance'
import { RepositoryListItem } from '../../../src/ui/repositories-list/repository-list-item'
import { IVersionedStoreHistorySource } from '../../../src/ui/version-history'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../../helpers/ui/render'

const RepositoryPath = '/work/desktop-material'
const RepositoryName = 'desktop-material'
const SettingsPathPrefix = 'C:/profile/appearance-elements/repositories/one/'

const ProfileDefaults: IProfileAppearanceElementSettings = {
  [ProfileAppearanceElementId.AppWorkspace]: {
    accentPalette: 'violet',
    surfacePalette: 'neutral',
    elevation: 'standard',
    uiFont: 'material',
    motion: 'system',
  },
  [ProfileAppearanceElementId.UpdateProgress]: {
    updateProgressPalette: 'accent',
  },
  [ProfileAppearanceElementId.Toolbar]: {
    toolbarLabels: 'labels',
    toolbarDensity: 'compact',
    toolbarTextStyle: null,
  },
  [ProfileAppearanceElementId.RepositoryList]: {
    repositoryListDensity: 'comfortable',
  },
  [ProfileAppearanceElementId.RepositoryTabs]: {
    tabDensity: 'comfortable',
    tabWidth: 'wide',
    tabCloseButtons: 'hover',
  },
  [ProfileAppearanceElementId.CodeDiff]: { monospaceFont: 'platform' },
  [ProfileAppearanceElementId.SubmoduleBackButton]: {
    submoduleBackButtonStyle: 'tonal',
    submoduleBackButtonLabel: 'back-to-parent',
  },
  [ProfileAppearanceElementId.AppIdentity]: DefaultAppIdentityCustomization,
  [ProfileAppearanceElementId.DefaultRepositoryLogo]: {
    ...DefaultRepositoryLogoDesign,
    background: {
      ...DefaultRepositoryLogoDesign.background,
      primaryColor: '#123456',
    },
  },
}

interface IRecordedWrite {
  readonly id: RepositoryAppearanceElementId
  readonly value: unknown
}

function historySource(): IVersionedStoreHistorySource {
  return {
    getHistory: () =>
      Promise.resolve({
        entries: [],
        total: 0,
        hasMore: false,
        canUndo: false,
        canRedo: false,
      }),
    getFiles: () => Promise.resolve(['setting.json']),
    getDiff: () => Promise.resolve(''),
    undoLastChange: () => Promise.resolve(),
    redoLastChange: () => Promise.resolve(),
    restoreTo: () => Promise.resolve(),
  }
}

/**
 * One shared owner store. Both the Repository Settings appearance hub and the
 * anchored direct-owner editor read and write through it, so a test can prove
 * an edit made on one surface is the very same owner the other surface sees.
 */
function createOwnerStore(
  writes: IRecordedWrite[],
  historyRequests: RepositoryAppearanceElementId[] = []
) {
  let elements: IRepositoryAppearanceElementSettings = {
    ...DefaultRepositoryAppearanceElementSettings,
  }

  const dispatcher = {
    isElementAppearanceCoordinatorReady: () => true,
    getRepositoryAppearanceElements: async () => elements,
    getResolvedRepositoryElementAppearance: async () => ({
      logo:
        elements[RepositoryAppearanceElementId.Logo].logo ??
        ProfileDefaults[ProfileAppearanceElementId.DefaultRepositoryLogo],
      listNameStyle: elements[RepositoryAppearanceElementId.ListName].style,
    }),
    getProfileAppearanceElement: (id: ProfileAppearanceElementId) =>
      ProfileDefaults[id],
    getProfileAppearanceHistorySource: () => historySource(),
    getProfileAppearanceRepositoryPath: () =>
      `${SettingsPathPrefix}profile-logo`,
    setProfileAppearanceElement: async () => undefined,
    getRepositoryAppearanceHistorySource: async (
      _repository: Repository,
      id: RepositoryAppearanceElementId
    ) => {
      historyRequests.push(id)
      return historySource()
    },
    getRepositoryAppearanceRepositoryPath: async (
      _repository: Repository,
      id: RepositoryAppearanceElementId
    ) => {
      historyRequests.push(id)
      return `${SettingsPathPrefix}${id}`
    },
    setRepositoryAppearanceElement: async <
      K extends RepositoryAppearanceElementId
    >(
      _repository: Repository,
      id: K,
      value: IRepositoryAppearanceElementSettings[K]
    ) => {
      elements = { ...elements, [id]: value }
      writes.push({ id, value })
    },
  } as unknown as Dispatcher

  return { dispatcher, read: () => elements }
}

function repository(): Repository {
  return new Repository(RepositoryPath, 1, null, false)
}

/**
 * The hub hosts several editors that share control names (both the list-name
 * and the toolbar typography surfaces expose a Bold toggle, exactly as they do
 * when opened from their own elements). Scope a query to one owner's section.
 */
async function section(heading: string): Promise<HTMLElement> {
  const owner = (
    await screen.findByRole('heading', {
      name: heading,
      level: 3,
    })
  ).closest<HTMLElement>('.repository-appearance-section')
  assert.ok(owner, `Missing ${heading} section`)
  return owner
}

function AnchoredRow(props: { readonly dispatcher: Dispatcher }) {
  return (
    <div id="foldout-container">
      <div className="foldout">
        <RepositoryListItem
          repository={repository()}
          needsDisambiguation={false}
          matches={{ title: [], subtitle: [] }}
          aheadBehind={null}
          changedFilesCount={0}
          branchName={null}
          dispatcher={props.dispatcher}
        />
      </div>
    </div>
  )
}

describe('Repository Settings appearance hub', () => {
  it('renders every repository-scoped owner with its inherited state', async () => {
    const writes: IRecordedWrite[] = []
    const { dispatcher } = createOwnerStore(writes)
    render(
      <RepositoryAppearance dispatcher={dispatcher} repository={repository()} />
    )

    // One section per repository-scoped appearance owner, no invented axes.
    // Nothing is overridden yet, so every section reports inheritance and its
    // Reset action stays disabled rather than writing a redundant commit.
    for (const heading of [
      'Name in the repository list',
      'Repository logo',
      'Repository tabs',
      'Toolbar',
      'Workspace colors',
    ]) {
      const owner = await section(heading)
      assert.ok(
        within(owner).getByText('Inherits the profile default'),
        `${heading} must report its inherited state`
      )
      assert.equal(
        within(owner)
          .getByRole('button', {
            name: `Reset ${heading} to the inherited default`,
          })
          .getAttribute('aria-disabled'),
        'true'
      )
    }

    // Inherited values are named from the profile owners, never guessed.
    assert.ok(screen.getByText(/Accent: Violet \(inherited\)/))
    assert.ok(screen.getByText(/Surface: Neutral \(inherited\)/))
    assert.ok(screen.getByText(/Width: Wide \(inherited\)/))
    assert.ok(screen.getByText('Inheriting row typography'))

    // Discoverability points back at the element itself.
    assert.ok(screen.getByText(/Shift\+right-click the repository row/))
    assert.equal(writes.length, 0)
  })

  it('commits a hub edit and a reset through the same owner the anchored editor uses', async () => {
    const writes: IRecordedWrite[] = []
    const { dispatcher, read } = createOwnerStore(writes)
    render(
      <RepositoryAppearance dispatcher={dispatcher} repository={repository()} />
    )

    const listName = await section('Name in the repository list')
    fireEvent.click(within(listName).getByRole('button', { name: 'Bold' }))
    await waitFor(() =>
      assert.deepEqual(writes.at(-1), {
        id: RepositoryAppearanceElementId.ListName,
        value: { style: { bold: true } },
      })
    )
    assert.deepEqual(read()[RepositoryAppearanceElementId.ListName], {
      style: { bold: true },
    })

    // The section now reports the override and offers the reset.
    const reset = within(listName).getByRole('button', {
      name: 'Reset Name in the repository list to the inherited default',
    })
    await waitFor(() => assert.equal(reset.getAttribute('aria-disabled'), null))
    assert.ok(within(listName).getByText('Overridden for this repository'))

    fireEvent.click(reset)
    await waitFor(() =>
      assert.deepEqual(writes.at(-1), {
        id: RepositoryAppearanceElementId.ListName,
        value: { style: null },
      })
    )
  })

  it('round-trips an edit made in the hub to the anchored keyboard editor', async () => {
    const writes: IRecordedWrite[] = []
    const { dispatcher } = createOwnerStore(writes)

    const hub = render(
      <RepositoryAppearance dispatcher={dispatcher} repository={repository()} />
    )
    const listName = await section('Name in the repository list')
    fireEvent.click(within(listName).getByRole('button', { name: 'Bold' }))
    await waitFor(() =>
      assert.equal(writes.at(-1)?.id, RepositoryAppearanceElementId.ListName)
    )
    hub.unmount()

    // The very same owner now backs the editor opened beside the actual row.
    render(<AnchoredRow dispatcher={dispatcher} />)
    const name = await screen.findByRole('button', {
      name: `Customize ${RepositoryName} list-name appearance`,
    })
    await waitFor(() => assert.equal(name.style.fontWeight, 'bold'))

    name.focus()
    fireEvent.keyDown(name, { key: 'F10', shiftKey: true })
    await screen.findByRole('dialog', {
      name: `${RepositoryName} list-name appearance`,
    })
    await waitFor(() =>
      assert.equal(
        screen
          .getByRole('button', { name: 'Bold' })
          .getAttribute('aria-pressed'),
        'true'
      )
    )
  })

  it('writes a repository-tab override without touching the profile owner', async () => {
    const writes: IRecordedWrite[] = []
    const { dispatcher, read } = createOwnerStore(writes)
    render(
      <RepositoryAppearance dispatcher={dispatcher} repository={repository()} />
    )

    const width = await screen.findByLabelText('Repository tab width')
    fireEvent.change(width, { target: { value: 'compact' } })

    await waitFor(() =>
      assert.deepEqual(writes.at(-1), {
        id: RepositoryAppearanceElementId.Tabs,
        value: { tabDensity: null, tabWidth: 'compact' },
      })
    )
    assert.deepEqual(
      writes.map(write => write.id),
      [RepositoryAppearanceElementId.Tabs],
      'The repository hub must write only the repository-scoped tab owner'
    )
    assert.deepEqual(read()[RepositoryAppearanceElementId.Tabs], {
      tabDensity: null,
      tabWidth: 'compact',
    })
    assert.ok(await screen.findByText(/Width: Compact \(this repository\)/))
    // The untouched density still names the value inherited from the profile.
    assert.ok(screen.getByText(/Density: Comfortable \(inherited\)/))
  })

  it('opens the owner-local history outside the Repository Settings form', async () => {
    const writes: IRecordedWrite[] = []
    const historyRequests: RepositoryAppearanceElementId[] = []
    const { dispatcher } = createOwnerStore(writes, historyRequests)
    // Reproduce the dialog shell: the tab body really is inside a <form>, and
    // a Dialog renders its own <form>, so the history manager must portal out.
    let submits = 0
    render(
      <form onSubmit={() => submits++}>
        <RepositoryAppearance
          dispatcher={dispatcher}
          repository={repository()}
        />
      </form>
    )

    const logo = await section('Repository logo')
    fireEvent.click(
      within(logo).getByRole('button', { name: 'Open Repository logo history' })
    )

    const history = await screen.findByRole('dialog', {
      name: 'Repository logo history',
    })
    assert.equal(
      history.closest('form'),
      null,
      'The history dialog must not nest inside the Repository Settings form'
    )
    // History resolves through the same repository-scoped owner the anchored
    // editor resolves, never a hub-local copy.
    assert.deepEqual(
      new Set(historyRequests),
      new Set([RepositoryAppearanceElementId.Logo])
    )
    assert.equal(submits, 0)
    assert.equal(writes.length, 0)
  })

  it('reports a still-starting coordinator instead of painting a guessed value', async () => {
    const dispatcher = {
      isElementAppearanceCoordinatorReady: () => false,
    } as unknown as Dispatcher

    render(
      <RepositoryAppearance dispatcher={dispatcher} repository={repository()} />
    )

    assert.ok(
      await screen.findByText(/Appearance owners are still starting up/)
    )
    assert.equal(
      screen.queryByRole('heading', { name: 'Repository logo' }),
      null
    )
  })
})

describe('Repository Settings appearance tab registration', () => {
  it('keeps the enum, tab rail, and pane in the same order', async () => {
    const { readFile } = await import('node:fs/promises')
    const [source, modelSource] = await Promise.all([
      readFile(
        'app/src/ui/repository-settings/repository-settings.tsx',
        'utf8'
      ),
      readFile('app/src/models/repository-settings.ts', 'utf8'),
    ])

    // The enum no longer has to equal a position — the descriptors carry each
    // tab's identity and the strip navigates by it — but the declared order is
    // still the order the strip shows, and the conditionally appended fork tab
    // must stay last.
    assert.match(
      modelSource,
      /Automation,\s*Metadata,\s*Appearance,\s*ForkSettings,/
    )
    assert.match(
      source,
      /tab: RepositorySettingsTab\.Appearance,[\s\S]*?icon: octicons\.paintbrush,[\s\S]*?translationKey="repositorySettings\.appearanceTab"/
    )
    assert.match(
      source,
      /if \(showForkSettings\) \{[\s\S]*?RepositorySettingsTab\.ForkSettings/
    )
    assert.match(
      source,
      /case RepositorySettingsTab\.Appearance:[\s\S]*?<RepositoryAppearance[\s\S]*?repository=\{this\.props\.repository\}[\s\S]*?dispatcher=\{this\.props\.dispatcher\}/
    )
  })
})
