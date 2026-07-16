import * as React from 'react'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert'
import { IRepositoryTab, ITabTitleStyle } from '../../src/models/repository-tab'
import { TabStyleEditor } from '../../src/ui/repository-tabs/tab-style-editor'
import { fireEvent, render, screen, within } from '../helpers/ui/render'

interface IHarnessProps {
  readonly initialStyle: ITabTitleStyle
  readonly onStyleChange: (style: ITabTitleStyle) => void
  readonly onReset: () => void
}

function TabStyleEditorHarness(props: IHarnessProps) {
  const [style, setStyle] = React.useState<ITabTitleStyle | null>(
    props.initialStyle
  )
  const tab: IRepositoryTab = {
    id: 'styled-tab',
    repositoryId: 1,
    repositoryPath: 'C:\\work\\desktop-material',
    customLabel: 'Styled repo',
    titleStyle: style,
  }

  return (
    <TabStyleEditor
      tab={tab}
      anchor={null}
      onStyleChange={next => {
        props.onStyleChange(next)
        setStyle(next)
      }}
      onReset={() => {
        props.onReset()
        setStyle(null)
      }}
      onClose={() => undefined}
    />
  )
}

describe('TabStyleEditor', () => {
  beforeEach(() => localStorage.clear())

  it('applies the expanded Word-style controls with a live preview', () => {
    let lastStyle: ITabTitleStyle | null = null
    let resetCount = 0
    const initialStyle = {
      bold: true,
      futurePaletteMode: 'theme',
    } as unknown as ITabTitleStyle

    render(
      <TabStyleEditorHarness
        initialStyle={initialStyle}
        onStyleChange={style => (lastStyle = style)}
        onReset={() => resetCount++}
      />
    )

    assert.equal(
      screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed'),
      'true'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Strikethrough' }))
    fireEvent.click(screen.getByRole('button', { name: 'Uppercase' }))
    fireEvent.click(screen.getByRole('button', { name: 'Small caps' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Spacing' }), {
      target: { value: '1.5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Soft text shadow' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Highlight color #ffff00' })
    )

    assert.notEqual(lastStyle, null)
    const expanded = lastStyle as unknown as ITabTitleStyle & {
      readonly futurePaletteMode?: string
    }
    assert.equal(expanded.futurePaletteMode, 'theme')
    assert.equal(expanded.strikeThrough, true)
    assert.equal(expanded.textCase, 'uppercase')
    assert.equal(expanded.smallCaps, true)
    assert.equal(expanded.characterSpacing, 1.5)
    assert.equal(expanded.textEffect, 'soft-shadow')
    assert.equal(expanded.backgroundColor, '#ffff00')

    const preview = screen.getByRole('region', { name: 'Live tab preview' })
    const previewText = within(preview).getByText('Styled repo')
    assert.equal(previewText.style.textTransform, 'uppercase')
    assert.equal(previewText.style.fontVariant, 'small-caps')
    assert.equal(previewText.style.letterSpacing, '1.5px')
    assert.notEqual(previewText.style.textShadow, '')
    assert.notEqual(previewText.style.backgroundColor, '')

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear tab formatting' })
    )
    assert.equal(resetCount, 1)
    assert.equal(
      within(
        screen.getByRole('region', { name: 'Live tab preview' })
      ).getByText('Styled repo').style.textTransform,
      ''
    )
  })

  it('keeps text and highlight recent colors independent', () => {
    render(
      <TabStyleEditorHarness
        initialStyle={{}}
        onStyleChange={() => undefined}
        onReset={() => undefined}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Text color #c00000' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Highlight color #ffff00' })
    )

    assert.deepEqual(
      JSON.parse(localStorage.getItem('tab-style-recent-colors') ?? '[]'),
      ['#c00000']
    )
    assert.deepEqual(
      JSON.parse(
        localStorage.getItem('tab-style-recent-highlight-colors') ?? '[]'
      ),
      ['#ffff00']
    )
  })
})
