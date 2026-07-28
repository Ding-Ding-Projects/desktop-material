import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const source = readFileSync(
  join(
    process.cwd(),
    'app',
    'src',
    'ui',
    'changes',
    'commit-message-avatar.tsx'
  ),
  'utf8'
)

describe('commit message avatar lazy Git config contract', () => {
  it('does not launch Git config work from the constructor or mount path', () => {
    const constructorStart = source.indexOf(
      'public constructor(props: ICommitMessageAvatarProps)'
    )
    const updateStart = source.indexOf(
      'public componentDidUpdate',
      constructorStart
    )
    assert.ok(constructorStart >= 0 && updateStart > constructorStart)

    const initialization = source.slice(constructorStart, updateStart)
    assert.doesNotMatch(initialization, /getConfigValue/)
    assert.doesNotMatch(initialization, /determineGitConfigLocation\(\)/)
    assert.match(initialization, /isGitConfigLocal: null/)
  })

  it('starts parallel local lookups only after the ordinary popover opens', () => {
    const openStart = source.indexOf('private openPopover')
    const closeStart = source.indexOf('private closePopover', openStart)
    const open = source.slice(openStart, closeStart)
    assert.match(
      open,
      /isPopoverOpen[\s\S]*?warningType === 'none'[\s\S]*?isGitConfigLocal === null[\s\S]*?determineGitConfigLocation/
    )

    const loaderStart = source.indexOf(
      'private async determineGitConfigLocation'
    )
    const buttonRefStart = source.indexOf('private onButtonRef', loaderStart)
    const loader = source.slice(loaderStart, buttonRefStart)
    assert.match(
      loader,
      /Promise\.all\(\[[\s\S]*?getConfigValue\(repository, 'user\.name', true\)[\s\S]*?getConfigValue\(repository, 'user\.email', true\)/
    )
    assert.match(loader, /gitConfigLocationLoadKey === loadKey/)
  })

  it('fences hidden, unmounted, superseded, and relocated results', () => {
    const loaderStart = source.indexOf(
      'private async determineGitConfigLocation'
    )
    const buttonRefStart = source.indexOf('private onButtonRef', loaderStart)
    const loader = source.slice(loaderStart, buttonRefStart)

    assert.match(
      loader,
      /!this\.isMounted[\s\S]*?!this\.state\.isPopoverOpen[\s\S]*?warningType !== 'none'/
    )
    assert.match(
      loader,
      /sequence !== this\.gitConfigLocationLoadSequence[\s\S]*?repository\.id !== this\.props\.repository\.id[\s\S]*?repository\.path !== this\.props\.repository\.path/
    )
    assert.match(
      source,
      /public componentWillUnmount\(\)[\s\S]*?isMounted = false[\s\S]*?gitConfigLocationLoadSequence \+= 1/
    )
  })

  it('discards the resolved location whenever the popover closes', () => {
    const closeStart = source.indexOf('private closePopover')
    const clickStart = source.indexOf('private onAvatarClick', closeStart)
    const close = source.slice(closeStart, clickStart)
    assert.match(close, /isPopoverOpen: false,\s*isGitConfigLocal: null/)
  })
})
