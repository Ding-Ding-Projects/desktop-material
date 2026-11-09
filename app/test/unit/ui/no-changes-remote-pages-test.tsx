import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { NoChanges } from '../../../src/ui/changes/no-changes'
import { Repository } from '../../../src/models/repository'
import { IRemote } from '../../../src/models/remote'
import { RepositoryStateCache } from '../../../src/lib/stores/repository-state-cache'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { TestStatsStore } from '../../helpers/test-stats-store'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function renderNoChanges(
  remotes: ReadonlyArray<IRemote>,
  currentRemote: IRemote | null = remotes[0] ?? null
) {
  const repository = new Repository('/repos/app', 1, null, false)
  const state = new RepositoryStateCache(new TestStatsStore()).get(repository)
  const opened = new Array<string>()
  const dispatcher = Object.create(Dispatcher.prototype) as Dispatcher
  Object.assign(dispatcher, {
    openInBrowser: async (url: string) => {
      opened.push(url)
      return true
    },
    incrementMetric: async () => {},
  })

  const view = render(
    <NoChanges
      dispatcher={dispatcher}
      repository={repository}
      appMenu={undefined}
      repositoryState={{ ...state, remotes, remote: currentRemote }}
      isExternalEditorAvailable={false}
    />
  )
  return { view, opened }
}

const origin = { name: 'origin', url: 'git@github.com:me/app.git' }
const upstream = { name: 'upstream', url: 'https://gitlab.com/team/app.git' }

describe('No local changes: view a remote in the browser', () => {
  it('lists every remote in a dropdown and opens the one picked', () => {
    const { opened } = renderNoChanges([origin, upstream])

    const picker = screen.getByRole('combobox', {
      name: 'Remote',
    }) as HTMLSelectElement
    const options = Array.from(picker.options).map(o => o.textContent)
    assert.deepEqual(options, [
      'origin (github.com/me/app)',
      'upstream (gitlab.com/team/app)',
    ])
    assert.equal(picker.value, 'origin')
    screen.getByText('Open the repository page of any remote in your browser')

    fireEvent.click(screen.getByRole('button', { name: 'View on GitHub' }))
    assert.deepEqual(opened, ['https://github.com/me/app'])

    fireEvent.change(picker, { target: { value: 'upstream' } })
    fireEvent.click(screen.getByRole('button', { name: 'View on GitLab' }))
    assert.deepEqual(opened, [
      'https://github.com/me/app',
      'https://gitlab.com/team/app',
    ])
  })

  it('starts on the repository’s current remote', () => {
    renderNoChanges([origin, upstream], upstream)

    const picker = screen.getByRole('combobox', {
      name: 'Remote',
    }) as HTMLSelectElement
    assert.equal(picker.value, 'upstream')
    screen.getByRole('button', { name: 'View on GitLab' })
  })

  it('shows one remote that is not on GitHub without a dropdown', () => {
    const { opened } = renderNoChanges([
      { name: 'origin', url: 'ssh://git@git.example.com:2222/me/notes.git' },
    ])

    assert.equal(screen.queryByRole('combobox', { name: 'Remote' }), null)
    screen.getByText(
      'Open the repository page on git.example.com in your browser'
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'View on git.example.com' })
    )
    assert.deepEqual(opened, ['https://git.example.com/me/notes'])
  })

  it('never shows a user name or token from a remote URL', () => {
    const { view } = renderNoChanges([
      origin,
      { name: 'mirror', url: 'https://me:ghp_secret@github.com/me/app.git' },
    ])

    assert.doesNotMatch(view.container.textContent ?? '', /ghp_secret|me:/)
  })

  it('offers nothing for remotes that have no web page', () => {
    renderNoChanges([{ name: 'backup', url: '/mnt/backup/app.git' }])

    assert.equal(screen.queryByRole('combobox', { name: 'Remote' }), null)
    assert.equal(screen.queryByRole('button', { name: /^View on/ }), null)
  })
})
