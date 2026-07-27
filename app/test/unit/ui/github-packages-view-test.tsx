import assert from 'node:assert'
import { describe, it } from 'node:test'
import { resolve } from 'node:path'
import * as React from 'react'
import { IAPIFullRepository } from '../../../src/lib/api'
import {
  IGitHubPackage,
  IGitHubPackageVersion,
} from '../../../src/lib/github-packages'
import { Account, getAccountKey } from '../../../src/models/account'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import {
  GitHubPackagesView,
  IGitHubPackageFileDownloadRequest,
  IGitHubPackageFileTransferClient,
  IGitHubPackagesClient,
} from '../../../src/ui/github-packages/github-packages-view'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const repositoryId = 784
const manifestDigest = `sha256:${'a'.repeat(64)}`
const account = new Account(
  'fixture-bot',
  'https://api.github.com',
  'fixture-token',
  [],
  '',
  42,
  'Fixture Bot'
)
const remote = new GitHubRepository(
  'material',
  new Owner('desktop', 'https://api.github.com', 1, 'Organization'),
  1
)
const repository = new Repository(
  resolve('package-fixtures', 'material'),
  1,
  remote,
  false,
  null,
  {},
  false,
  undefined,
  getAccountKey(account)
)
const containerPackage: IGitHubPackage = {
  id: 91,
  name: 'material-files',
  packageType: 'container',
  visibility: 'private',
  versionCount: 1,
  repository: {
    id: repositoryId,
    name: 'material',
    fullName: 'desktop/material',
    private: false,
    htmlURL: 'https://github.com/desktop/material',
  },
  createdAt: new Date('2026-07-26T10:00:00Z'),
  updatedAt: new Date('2026-07-26T11:00:00Z'),
  url: 'https://api.github.com/orgs/desktop/packages/container/material-files',
  htmlURL: 'https://github.com/orgs/desktop/packages/container/material-files',
}
const packageVersion: IGitHubPackageVersion = {
  id: 314,
  name: manifestDigest,
  packageType: 'container',
  createdAt: new Date('2026-07-26T10:00:00Z'),
  updatedAt: new Date('2026-07-26T11:00:00Z'),
  url: 'https://api.github.com/orgs/desktop/packages/container/material-files/versions/314',
  packageHTMLURL:
    'https://github.com/orgs/desktop/packages/container/material-files',
  htmlURL:
    'https://github.com/orgs/desktop/packages/container/material-files/314',
  description: 'Desktop Material file artifact',
  license: null,
  tags: ['desktop-material-file'],
}

const secondContainerPackage: IGitHubPackage = {
  ...containerPackage,
  id: 92,
  name: 'material-files-extra',
  updatedAt: new Date('2026-07-26T10:30:00Z'),
  url: 'https://api.github.com/orgs/desktop/packages/container/material-files-extra',
  htmlURL:
    'https://github.com/orgs/desktop/packages/container/material-files-extra',
}

function clientWithVersions(
  fetchVersions: IGitHubPackagesClient['fetchGitHubPackageVersions'],
  containerPackages: ReadonlyArray<IGitHubPackage> = [containerPackage]
): IGitHubPackagesClient {
  return {
    fetchRepository: async () =>
      ({
        id: repositoryId,
        html_url: 'https://github.com/desktop/material',
      } as IAPIFullRepository),
    fetchGitHubPackages: async (_owner, packageType, page = 1) => ({
      packages: packageType === 'container' ? [...containerPackages] : [],
      page,
      nextPage: null,
      capped: false,
    }),
    fetchGitHubPackageVersions: fetchVersions,
  }
}

function abortableHang(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener(
      'abort',
      () => {
        const error = new Error('Canceled')
        error.name = 'AbortError'
        reject(error)
      },
      { once: true }
    )
  })
}

function selectContainerPackage(): void {
  fireEvent.click(
    screen.getByRole('button', {
      name: /material-files container private 1 version/i,
    })
  )
}

describe('GitHub Packages view', () => {
  it('routes a version download through the rendered custom Button', async () => {
    const client = clientWithVersions(
      async (_owner, packageType, _name, page = 1) => ({
        versions: [packageVersion],
        page,
        nextPage: null,
        capped: false,
      })
    )
    const downloadRequests = new Array<IGitHubPackageFileDownloadRequest>()
    const transferClient: IGitHubPackageFileTransferClient = {
      uploadFile: async () => {
        throw new Error('Unexpected upload')
      },
      downloadFile: async request => {
        downloadRequests.push(request)
        return {
          destinationPath: resolve('package-fixtures', 'material.package'),
          fileName: 'material.package',
          digest: `sha256:${'b'.repeat(64)}`,
          sizeInBytes: 512,
        }
      },
    }
    const view = render(
      <GitHubPackagesView
        repository={repository}
        accounts={[account]}
        clientFactory={() => client}
        transferClient={transferClient}
      />
    )

    try {
      await waitFor(() => selectContainerPackage())
      fireEvent.click(
        await screen.findByRole('button', { name: 'Download file' })
      )
      await waitFor(() => assert.equal(downloadRequests.length, 1))
      assert.equal(downloadRequests[0].packageName, containerPackage.name)
      assert.equal(downloadRequests[0].versionDigest, manifestDigest)
    } finally {
      view.unmount()
    }
  })

  it('aborts and resets an in-flight version load before refreshing packages', async () => {
    let versionRequests = 0
    let firstRequestAborted = false
    const client = clientWithVersions(
      async (_owner, _packageType, _name, page = 1, signal) => {
        versionRequests++
        if (versionRequests > 1) {
          return {
            versions: [packageVersion],
            page,
            nextPage: null,
            capped: false,
          }
        }
        return new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => {
              firstRequestAborted = true
              const error = new Error('Version request canceled')
              error.name = 'AbortError'
              reject(error)
            },
            { once: true }
          )
        })
      }
    )
    const view = render(
      <GitHubPackagesView
        repository={repository}
        accounts={[account]}
        clientFactory={() => client}
      />
    )

    try {
      await waitFor(() => selectContainerPackage())
      await waitFor(() => assert.equal(versionRequests, 1))
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
      await waitFor(() => assert.equal(firstRequestAborted, true))
      await waitFor(() => selectContainerPackage())
      assert.ok(await screen.findByRole('button', { name: 'Download file' }))
      assert.equal(versionRequests, 2)
    } finally {
      view.unmount()
    }
  })

  it('recovers from a canceled download and allows the next transfer', async () => {
    const client = clientWithVersions(
      async (_owner, _type, _name, page = 1) => ({
        versions: [packageVersion],
        page,
        nextPage: null,
        capped: false,
      })
    )
    let downloadRequests = 0
    const transferClient: IGitHubPackageFileTransferClient = {
      uploadFile: async () => {
        throw new Error('Unexpected upload')
      },
      downloadFile: async request => {
        downloadRequests++
        if (downloadRequests === 1) {
          return abortableHang(request.signal)
        }
        return {
          destinationPath: resolve('package-fixtures', 'material.package'),
          fileName: 'material.package',
          digest: `sha256:${'b'.repeat(64)}`,
          sizeInBytes: 512,
        }
      },
    }
    const view = render(
      <GitHubPackagesView
        repository={repository}
        accounts={[account]}
        clientFactory={() => client}
        transferClient={transferClient}
      />
    )

    try {
      await waitFor(() => selectContainerPackage())
      fireEvent.click(
        await screen.findByRole('button', { name: 'Download file' })
      )
      // The in-flight transfer shows the progress banner with its Cancel
      // button; canceling must restore an actionable state, not wedge it.
      fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
      await waitFor(() =>
        assert.equal(
          screen.queryByRole('button', { name: 'Cancel' }),
          null,
          'the transfer progress banner must clear after cancel'
        )
      )
      assert.match(
        (await screen.findByRole('alert')).textContent ?? '',
        /Package download canceled\./
      )
      const downloadButton = await screen.findByRole('button', {
        name: 'Download file',
      })
      assert.equal(
        downloadButton.hasAttribute('disabled'),
        false,
        'transfer controls must be re-enabled after cancel'
      )
      fireEvent.click(downloadButton)
      await waitFor(() => assert.equal(downloadRequests, 2))
      assert.ok(
        await screen.findByText(/Verified and downloaded material\.package\./)
      )
    } finally {
      view.unmount()
    }
  })

  it('loads the newly selected package versions while another load is in flight', async () => {
    let firstRequestAborted = false
    const client = clientWithVersions(
      async (_owner, _type, name, page = 1, signal) => {
        if (name === containerPackage.name) {
          return abortableHang(signal).catch(error => {
            firstRequestAborted = true
            throw error
          })
        }
        return {
          versions: [packageVersion],
          page,
          nextPage: null,
          capped: false,
        }
      },
      [containerPackage, secondContainerPackage]
    )
    const view = render(
      <GitHubPackagesView
        repository={repository}
        accounts={[account]}
        clientFactory={() => client}
      />
    )

    try {
      // Select the package whose version request never settles on its own…
      await waitFor(() => selectContainerPackage())
      // …then switch to another package while that request is in flight. The
      // aborted load must not leak loadingVersions and block this one.
      fireEvent.click(
        await screen.findByRole('button', {
          name: /material-files-extra container private 1 version/i,
        })
      )
      assert.ok(await screen.findByRole('button', { name: 'Download file' }))
      await waitFor(() => assert.equal(firstRequestAborted, true))
    } finally {
      view.unmount()
    }
  })
})
