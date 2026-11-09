import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { Base64Toolkit } from '../../../src/ui/repository-tools/base64-toolkit'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('Base64 text toolkit', () => {
  it('encodes as you type, swaps to decoding and copies the result', () => {
    const copied = new Array<string>()
    render(<Base64Toolkit copyText={text => copied.push(text)} />)

    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'ABC' },
    })
    assert.equal(
      (screen.getByLabelText('Base64') as HTMLTextAreaElement).value,
      'QUJD'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy result' }))
    assert.deepEqual(copied, ['QUJD'])
    assert.ok(screen.getByText('Copied.'))

    fireEvent.click(screen.getByRole('button', { name: 'Switch to decoding' }))
    assert.equal(
      (screen.getByLabelText('Base64') as HTMLTextAreaElement).value,
      'QUJD'
    )
    assert.equal(
      (screen.getByLabelText('Text') as HTMLTextAreaElement).value,
      'ABC'
    )
  })

  it('shows a decoding problem with its offset and offers nothing to copy', () => {
    render(<Base64Toolkit copyText={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to decoding' }))
    fireEvent.change(screen.getByLabelText('Base64'), {
      target: { value: 'QUJ*' },
    })

    assert.match(
      screen.getByRole('alert').textContent ?? '',
      /Character "\*" at offset 3 is not Base64/
    )
    assert.equal(
      screen
        .getByRole('button', { name: 'Copy result' })
        .getAttribute('aria-disabled'),
      'true'
    )
  })

  it('accepts missing padding once strict decoding is switched off', () => {
    render(<Base64Toolkit copyText={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to decoding' }))
    fireEvent.change(screen.getByLabelText('Base64'), {
      target: { value: 'QUI' },
    })
    assert.ok(screen.getByRole('alert'))

    fireEvent.click(screen.getByLabelText('Strict decoding'))
    assert.equal(screen.queryByRole('alert'), null)
    assert.equal(
      (screen.getByLabelText('Text') as HTMLTextAreaElement).value,
      'AB'
    )
  })
})
