import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  MaxTabSessionFileLength,
  parseTabSession,
  serializeTabSession,
  TabSessionFormat,
  TabSessionVersion,
} from '../../src/lib/tab-session-file'
import { IProfileTabsState } from '../../src/models/repository-tab'

describe('tab session files', () => {
  it('round-trips current tab state without leaking runtime ids', () => {
    const state: IProfileTabsState = {
      activeTabId: 'runtime-two',
      tabs: [
        {
          id: 'runtime-one',
          repositoryId: 41,
          repositoryPath: 'C:\\work\\alpha',
          customLabel: 'Alpha workspace',
          titleStyle: { bold: true, futureTextEffect: 'rainbow' },
          isPinned: true,
          openedAt: 100,
          futureTabField: 'preserved',
        },
        {
          id: 'runtime-two',
          repositoryId: 42,
          repositoryPath: 'C:\\work\\beta',
          customLabel: null,
          titleStyle: null,
          isFavorite: true,
          openedAt: 200,
        },
      ],
    }

    const serialized = serializeTabSession(
      state,
      new Date('2026-07-16T12:00:00.000Z')
    )
    assert.doesNotMatch(serialized, /runtime-one|runtime-two|repositoryId/)
    const parsed = parseTabSession(serialized)

    assert.ok(parsed)
    assert.equal(parsed.format, TabSessionFormat)
    assert.equal(parsed.version, TabSessionVersion)
    assert.equal(parsed.activeRepositoryPath, 'C:\\work\\beta')
    assert.equal(parsed.tabs[0].isPinned, true)
    assert.equal(parsed.tabs[1].isFavorite, true)
    assert.equal(parsed.tabs[0].futureTabField, 'preserved')
    assert.equal(parsed.tabs[0].titleStyle?.futureTextEffect, 'rainbow')
  })

  it('sanitizes unsafe known fields while preserving future data', () => {
    const parsed = parseTabSession(
      JSON.stringify({
        format: TabSessionFormat,
        version: TabSessionVersion,
        exportedAt: 'not-a-date',
        activeRepositoryPath: 'C:\\WORK\\ALPHA\\',
        futureFileField: 3,
        tabs: [
          {
            id: 'untrusted-runtime-id',
            repositoryId: 999,
            repositoryPath: 'C:\\work\\alpha',
            customLabel: '  Safe alias  ',
            isPinned: 'yes',
            isFavorite: true,
            openedAt: -5,
            futureTabField: { mode: 'newer' },
            titleStyle: {
              color: 'url(javascript:bad)',
              fontSize: 999,
              fontFamily: 'Bad; font',
              futureStyleField: 'kept',
            },
          },
          {
            repositoryPath: 'c:\\work\\alpha\\',
            customLabel: 'Duplicate',
          },
        ],
      })
    )

    assert.ok(parsed)
    assert.equal(parsed.tabs.length, 1)
    assert.equal(parsed.tabs[0].customLabel, 'Safe alias')
    assert.equal(parsed.tabs[0].isPinned, undefined)
    assert.equal(parsed.tabs[0].isFavorite, true)
    assert.equal(parsed.tabs[0].openedAt, undefined)
    assert.equal(parsed.tabs[0].id, undefined)
    assert.equal(parsed.tabs[0].repositoryId, undefined)
    assert.equal(parsed.tabs[0].titleStyle?.fontSize, 32)
    assert.equal(parsed.tabs[0].titleStyle?.color, undefined)
    assert.equal(parsed.tabs[0].titleStyle?.fontFamily, undefined)
    assert.equal(parsed.tabs[0].titleStyle?.futureStyleField, 'kept')
    assert.equal(parsed.futureFileField, 3)
    assert.equal(parsed.exportedAt, new Date(0).toISOString())
    assert.equal(parsed.activeRepositoryPath, 'C:\\WORK\\ALPHA\\')
  })

  it('rejects malformed, empty, relative-only, and oversized sessions', () => {
    assert.equal(parseTabSession('{'), null)
    assert.equal(
      parseTabSession(
        JSON.stringify({
          format: TabSessionFormat,
          version: TabSessionVersion,
          tabs: [],
        })
      ),
      null
    )
    assert.equal(
      parseTabSession(
        JSON.stringify({
          format: TabSessionFormat,
          version: TabSessionVersion,
          tabs: [{ repositoryPath: 'relative/repository' }],
        })
      ),
      null
    )
    assert.equal(parseTabSession('x'.repeat(MaxTabSessionFileLength + 1)), null)
  })
})
