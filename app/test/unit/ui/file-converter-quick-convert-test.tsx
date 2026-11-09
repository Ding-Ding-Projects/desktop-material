import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { IDropPlan } from '../../../src/lib/file-converter-drop'
import { FileConverter } from '../../../src/ui/repository-tools/file-converter'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

describe('file converter quick convert', () => {
  it('converts a dropped folder beside the originals and explains what it skipped', async () => {
    const expanded = new Array<{
      paths: ReadonlyArray<string>
      deep: boolean
    }>()
    const converted = new Array<string>()
    const plan: IDropPlan = {
      files: ['C:\\Photos\\trip\\beach.png', 'C:\\Photos\\trip\\broken.bin'],
      skipped: [
        {
          path: 'C:\\Photos\\trip\\link',
          reason: 'Skipped: not a regular file.',
        },
      ],
      truncated: false,
    }

    render(
      <FileConverter
        pathForFile={file => `C:\\Photos\\${file.name}`}
        expandDrop={async (paths, deep) => {
          expanded.push({ paths, deep })
          return plan
        }}
        convertBinaryEncoding={async sourcePath => {
          converted.push(sourcePath)
          if (sourcePath.endsWith('broken.bin')) {
            throw new Error('The file could not be read.')
          }
          return {
            sourcePath,
            destinationPath: `${sourcePath}.base64.txt`,
            direction: 'encode',
            sourceBytes: 3,
            outputBytes: 4,
            sha256: 'a'.repeat(64),
          }
        }}
      />
    )

    assert.equal(
      (screen.getByLabelText('Include subfolders') as HTMLInputElement).checked,
      true
    )
    const zone = screen
      .getByText('Drop files or folders here')
      .closest('.file-converter-drop')
    assert.ok(zone)
    fireEvent.drop(zone, {
      dataTransfer: { files: [new File(['x'], 'trip')] },
    })

    await waitFor(() => assert.ok(screen.getByText('1 of 2 converted')))
    assert.deepEqual(expanded, [{ paths: ['C:\\Photos\\trip'], deep: true }])
    assert.deepEqual(converted, plan.files)
    assert.ok(
      screen.getByText('Saved beside the original as beach.png.base64.txt')
    )
    assert.ok(screen.getByText('Not converted: The file could not be read.'))
    assert.ok(screen.getByText('Skipped: not a regular file.'))
  })
})
