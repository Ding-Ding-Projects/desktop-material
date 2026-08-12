import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  INarratorVoice,
  describeVoiceChoice,
  narratorVoiceStatusText,
  onVoicesChanged,
  readInstalledVoices,
  voicesForLanguage,
} from '../../src/lib/audio/narrator-voices'

/**
 * The narrator voice picker.
 *
 * Almost every case here is about a machine that is not the developer's:
 * a machine with no speech synthesis at all, one whose voice list has not
 * arrived yet, one whose Cantonese voice is labelled `zh-HK` rather than
 * `yue`, and one where the voice somebody chose last year is no longer
 * installed. None of those reproduce locally, and every one of them is what a
 * user actually has.
 */

const voice = (
  overrides: Partial<INarratorVoice> & Pick<INarratorVoice, 'uri' | 'lang'>
): INarratorVoice => ({
  name: overrides.uri,
  isDefault: false,
  localService: true,
  ...overrides,
})

describe('reading the installed voices', () => {
  it('is an empty list when the platform has no speech synthesis', () => {
    // Not a throw. A settings screen on a machine without speech synthesis
    // still has to render, and it says so rather than failing.
    assert.deepStrictEqual(readInstalledVoices(undefined), [])
  })

  it('is an empty list when getVoices throws', () => {
    const hostile = {
      getVoices: () => {
        throw new Error('nope')
      },
    } as unknown as SpeechSynthesis
    assert.deepStrictEqual(readInstalledVoices(hostile), [])
  })

  it('carries the stable identity, not just the display name', () => {
    const synthesis = {
      getVoices: () => [
        {
          voiceURI: 'urn:voice:one',
          name: 'Microsoft Zira',
          lang: 'en-US',
          default: true,
          localService: true,
        },
      ],
    } as unknown as SpeechSynthesis
    const [read] = readInstalledVoices(synthesis)
    // Two engines can both ship a "Microsoft Zira", and platforms localize
    // the name. The URI is the only thing safe to persist.
    assert.strictEqual(read.uri, 'urn:voice:one')
    assert.strictEqual(read.name, 'Microsoft Zira')
    assert.strictEqual(read.isDefault, true)
  })
})

describe('which voices each half of the narrator can use', () => {
  const voices = [
    voice({ uri: 'en-gb', lang: 'en-GB' }),
    voice({ uri: 'en-us', lang: 'en-US' }),
    voice({ uri: 'zh-hk', lang: 'zh-HK' }),
    voice({ uri: 'yue', lang: 'yue-Hant-HK' }),
    voice({ uri: 'fr', lang: 'fr-FR' }),
  ]

  it('takes the English family for English', () => {
    const found = voicesForLanguage(voices, 'english').map(v => v.uri)
    assert.deepStrictEqual(found.sort(), ['en-gb', 'en-us'])
  })

  it('accepts a zh-HK voice for Cantonese, not only yue', () => {
    // Most Windows and macOS installs label their Hong Kong voice `zh-HK`. A
    // filter demanding `yue` finds nothing on a machine that plainly has one,
    // and the picker reports "no voice installed" while the voice sits there.
    const found = voicesForLanguage(voices, 'cantonese').map(v => v.uri)
    assert.ok(found.includes('zh-hk'), `got ${found.join(', ')}`)
    assert.ok(found.includes('yue'))
  })

  it('does not offer an unrelated language', () => {
    const every = [
      ...voicesForLanguage(voices, 'english'),
      ...voicesForLanguage(voices, 'cantonese'),
    ].map(v => v.uri)
    assert.ok(!every.includes('fr'))
  })

  it('does not match a language tag that merely starts with the letters', () => {
    // `en` must not swallow `enm` or a hypothetical `english-ish` tag; the
    // boundary is the whole subtag or a hyphen.
    const found = voicesForLanguage(
      [voice({ uri: 'enm', lang: 'enm' })],
      'english'
    )
    assert.strictEqual(found.length, 0)
  })

  it('puts offline voices ahead of network ones', () => {
    // A network voice that stops working on a train is a worse thing to land
    // on by accident than a local one.
    const mixed = [
      voice({ uri: 'cloud', lang: 'en-US', name: 'AAA', localService: false }),
      voice({ uri: 'local', lang: 'en-US', name: 'ZZZ', localService: true }),
    ]
    assert.deepStrictEqual(
      voicesForLanguage(mixed, 'english').map(v => v.uri),
      ['local', 'cloud']
    )
  })
})

describe('what the settings screen says is in effect', () => {
  const available = [voice({ uri: 'en-gb', lang: 'en-GB', name: 'Sonia' })]

  it('reports automatic when nothing has been chosen', () => {
    assert.strictEqual(describeVoiceChoice('', available).kind, 'automatic')
  })

  it('reports that no voice can read the language at all', () => {
    // Distinct from "automatic": automatic means the app will pick one, and
    // there is nothing to pick from here. Saying "chosen automatically" on a
    // machine that will stay silent is a lie the user cannot check.
    assert.strictEqual(describeVoiceChoice('', []).kind, 'none-available')
  })

  it('reports the chosen voice when it is installed', () => {
    const status = describeVoiceChoice('en-gb', available)
    assert.strictEqual(status.kind, 'chosen')
  })

  it('reports a chosen voice that is no longer installed', () => {
    // And the important half: the choice is reported as missing rather than
    // silently reset, because the machine may get the voice back and a
    // deliberate decision should survive that.
    const status = describeVoiceChoice('gone', available)
    assert.strictEqual(status.kind, 'missing')
  })

  it('warns that a network voice will not speak offline', () => {
    const network = [
      voice({
        uri: 'cloud',
        lang: 'en-US',
        name: 'Cloud',
        localService: false,
      }),
    ]
    const text = narratorVoiceStatusText(describeVoiceChoice('cloud', network))
    assert.match(text, /offline/)
  })

  it('says something for every status', () => {
    for (const status of [
      describeVoiceChoice('', available),
      describeVoiceChoice('', []),
      describeVoiceChoice('en-gb', available),
      describeVoiceChoice('gone', available),
    ]) {
      assert.ok(
        narratorVoiceStatusText(status).length > 0,
        `${status.kind} has no text`
      )
    }
  })
})

describe('the voice list arriving late', () => {
  it('subscribes and unsubscribes cleanly', () => {
    // The failure this exists to catch: getVoices() commonly returns nothing
    // on the first call and fills in behind this event. A picker that reads
    // once reports "no voices" on a machine with forty.
    const listeners: Array<() => void> = []
    const synthesis = {
      addEventListener: (_: string, listener: () => void) =>
        listeners.push(listener),
      removeEventListener: (_: string, listener: () => void) => {
        const at = listeners.indexOf(listener)
        if (at !== -1) {
          listeners.splice(at, 1)
        }
      },
    } as unknown as SpeechSynthesis

    const stop = onVoicesChanged(() => undefined, synthesis)
    assert.strictEqual(listeners.length, 1)
    stop()
    assert.strictEqual(listeners.length, 0)
  })

  it('returns a usable unsubscribe when there is no synthesis to subscribe to', () => {
    assert.doesNotThrow(() => onVoicesChanged(() => undefined, undefined)())
  })
})
