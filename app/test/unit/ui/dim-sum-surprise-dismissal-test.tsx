import * as React from 'react'
import { describe, it } from 'node:test'
import assert from 'node:assert'

import { fireEvent, render, waitFor } from '../../helpers/ui/render'
import { DimSumSurprise } from '../../../src/ui/dim-sum/dim-sum-surprise'
import { getDimSumDishes } from '../../../src/lib/dim-sum-assets'

const dish = getDimSumDishes()[0]

/**
 * The card promises, in both languages, that it clears itself. These cover the
 * one way it could stop doing that: the countdown is cancelled while somebody
 * is reading, and something has to start it again once they are not.
 */
describe('the dim sum surprise dismissal countdown', () => {
  function mount() {
    const dismissals: Array<true> = []
    const view = render(
      <DimSumSurprise
        dish={dish}
        languageMode="english"
        funnyLevels={{ english: 3, cantonese: 3 }}
        durationMs={20}
        onDismissed={() => dismissals.push(true)}
      />
    )
    const card = view.container.querySelector('aside')
    assert.notEqual(card, null)
    return { view, card: card as HTMLElement, dismissals }
  }

  it('clears itself when nobody has touched it', async () => {
    const { dismissals } = mount()
    await waitFor(() => assert.equal(dismissals.length, 1))
  })

  it('holds still while it has focus, and leaves once focus moves on', async () => {
    const { card, dismissals } = mount()

    fireEvent.focusIn(card)
    await new Promise(resolve => setTimeout(resolve, 60))
    assert.equal(
      dismissals.length,
      0,
      'a card being read must not vanish mid-sentence'
    )

    // `focusin` bubbles, so merely tabbing through the app lands on the dismiss
    // button for an instant. Without a restart that instant made the card
    // permanent for the rest of the session.
    fireEvent.focusOut(card, { relatedTarget: document.body })
    await waitFor(() => assert.equal(dismissals.length, 1))
  })

  it('keeps holding while focus moves between its own controls', async () => {
    const { card, dismissals } = mount()
    const button = card.querySelector('button')
    assert.notEqual(button, null)

    fireEvent.focusIn(card)
    fireEvent.focusOut(card, { relatedTarget: button })
    await new Promise(resolve => setTimeout(resolve, 60))
    assert.equal(dismissals.length, 0)
  })
})
