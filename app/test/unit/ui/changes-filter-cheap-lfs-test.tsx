import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'

import { CheapLfsPinThresholdBytes } from '../../../src/lib/large-files'
import { DiffSelection, DiffSelectionType } from '../../../src/models/diff'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
  WorkingDirectoryStatus,
} from '../../../src/models/status'
import { ChangesFilterChipRow } from '../../../src/ui/changes/changes-list-filter-options'
import { IChangesListItem } from '../../../src/ui/changes/filter-changes-list'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function changedFile(path: string): WorkingDirectoryFileChange {
  return new WorkingDirectoryFileChange(
    path,
    { kind: AppFileStatusKind.Modified },
    DiffSelection.fromInitialSelection(DiffSelectionType.All)
  )
}

describe('Cheap LFS Changes filter chip', () => {
  it('shows the exact candidate count and wraps its bilingual label', () => {
    const previousLanguageMode = localStorage.getItem('language-mode-v1')
    localStorage.setItem('language-mode-v1', 'bilingual')

    try {
      const candidate = changedFile('candidate.bin')
      const boundary = changedFile('boundary.bin')
      const workingDirectory = WorkingDirectoryStatus.fromFiles([
        candidate,
        boundary,
      ])
      const items = new Map<string, IChangesListItem>([
        [
          candidate.id,
          {
            id: candidate.id,
            text: [candidate.path],
            change: candidate,
            sizeInBytes: CheapLfsPinThresholdBytes + 1,
          },
        ],
        [
          boundary.id,
          {
            id: boundary.id,
            text: [boundary.path],
            change: boundary,
            sizeInBytes: CheapLfsPinThresholdBytes,
          },
        ],
      ])
      let toggles = 0

      render(
        <ChangesFilterChipRow
          fileListFilter={{
            filterText: '',
            isIncludedInCommit: false,
            isExcludedFromCommit: false,
            isNewFile: false,
            isModifiedFile: false,
            isDeletedFile: false,
            isCheapLfsCandidate: true,
          }}
          filteredItems={items}
          workingDirectory={workingDirectory}
          onFilterToIncludedInCommit={() => {}}
          onFilterExcludedFiles={() => {}}
          onFilterDeletedFiles={() => {}}
          onFilterModifiedFiles={() => {}}
          onFilterNewFiles={() => {}}
          onFilterCheapLfsCandidates={() => toggles++}
          onOpenRegexBuilder={() => {}}
        />
      )

      const chip = screen.getByRole('button', {
        name: /Cheap LFS candidates.*Cheap LFS 候選檔案.*1/,
      })
      const group = screen.getByRole('group', {
        name: /Change filters.*變更篩選器/,
      })
      assert.equal(chip.getAttribute('aria-pressed'), 'true')
      assert.equal(chip.classList.contains('cheap-lfs-candidate'), true)
      assert.equal(group.contains(chip), true)
      assert.ok(
        screen.getByRole('button', { name: 'Open regex builder' }) !== null
      )
      fireEvent.click(chip)
      assert.equal(toggles, 1)
    } finally {
      if (previousLanguageMode === null) {
        localStorage.removeItem('language-mode-v1')
      } else {
        localStorage.setItem('language-mode-v1', previousLanguageMode)
      }
    }
  })

  it('keeps wrapped chips and the hidden-change warning in document flow', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/src/ui/changes/filter-changes-list.tsx'),
      'utf8'
    )
    const styles = readFileSync(
      join(process.cwd(), 'app/styles/ui/changes/_changes-list.scss'),
      'utf8'
    )

    assert.match(
      source,
      /showChangesFilter && this\.state\.showFilterChips[\s\S]*?' has-inline-filter-chips'/
    )
    assert.match(source, /className="hidden-changes-warning-message"/)
    assert.doesNotMatch(styles, /&:has\(\.changes-filter-chips\)/)
    assert.match(
      styles,
      /&\.has-inline-filter-chips\s*\{[\s\S]*?flex: 0 0 auto;[\s\S]*?> \.filter-list\s*\{[\s\S]*?flex: 0 0 auto;[\s\S]*?> \.filter-list-container\s*\{[\s\S]*?flex: 0 0 34px;[\s\S]*?height: 34px;/
    )
    assert.match(
      styles,
      /\.changes-filter-chips\s*\{[\s\S]*?flex-wrap: wrap;[\s\S]*?width: 100%;[\s\S]*?min-width: 0;/
    )
    assert.match(
      styles,
      /\.changes-filter-chip,[\s\S]*?\.changes-regex-builder-chip\s*\{[\s\S]*?max-width: 100%;[\s\S]*?min-width: 0;[\s\S]*?height: auto;[\s\S]*?white-space: normal;[\s\S]*?\.chip-label\s*\{[\s\S]*?overflow-wrap: anywhere;/
    )
    assert.match(
      styles,
      /\.hidden-changes-warning\s*\{[\s\S]*?display: flex;[\s\S]*?flex: 0 0 auto;[\s\S]*?\.hidden-changes-warning-message\s*\{[\s\S]*?min-width: 0;[\s\S]*?overflow-wrap: anywhere;/
    )
    assert.doesNotMatch(
      styles,
      /\.hidden-changes-warning\s*\{[\s\S]*?margin-bottom: -1px;/
    )
  })
})
