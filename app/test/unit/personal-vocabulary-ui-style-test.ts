import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const app = join(__dirname, '../..')

describe('personal vocabulary control UI contract', () => {
  it('uses the shared button for file selection and owns responsive layout rules', async () => {
    const [control, styles] = await Promise.all([
      readFile(
        join(app, 'src/ui/preferences/personal-vocabulary-control.tsx'),
        'utf8'
      ),
      readFile(join(app, 'styles/ui/_preferences.scss'), 'utf8'),
    ])

    assert.match(control, /import \{ Button \} from '\.\.\/lib\/button'/)
    assert.match(control, /dataVerification="personal-vocabulary-choose-file"/)
    assert.match(control, /className="personal-vocabulary-file-input"/)
    assert.match(control, /aria-hidden=\{true\}/)
    assert.match(control, /tabIndex=\{-1\}/)
    assert.match(control, /this\.fileInputRef\.current\?\.click\(\)/)
    assert.match(control, /dataVerification="personal-vocabulary-clear"/)

    assert.match(
      styles,
      /\.personal-vocabulary-control\s*\{[\s\S]*?min-width:\s*0;/
    )
    assert.match(
      styles,
      /\.personal-vocabulary-actions\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap;/
    )
    assert.match(
      styles,
      /@container preferences-pane \(max-width: 520px\)[\s\S]*?\.personal-vocabulary-actions[\s\S]*?flex-direction:\s*column;/
    )
    assert.match(
      styles,
      /@media \(min-resolution: 192dpi\)[\s\S]*?\.personal-vocabulary-actions[\s\S]*?min-height:\s*44px;/
    )
  })
})
