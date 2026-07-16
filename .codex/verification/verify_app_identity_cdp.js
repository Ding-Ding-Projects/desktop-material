#!/usr/bin/env node
'use strict'

/**
 * Isolated renderer verifier for profile-scoped app identity customization.
 * The caller owns Electron, its hidden desktop, loopback CDP port, captures,
 * and cleanup. This script never launches, focuses, resizes, or closes a native
 * window and never opens an external browser.
 */

const { chromium } = require('playwright')
const path = require('path')

function fail(message) {
  throw new Error(message)
}

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith('--') || value === undefined) {
      fail(`Invalid argument near ${name ?? '<end>'}.`)
    }
    values.set(name.slice(2), value)
  }

  const port = Number(values.get('port'))
  const action = values.get('action')
  const capture = values.get('capture')
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    fail('A valid loopback CDP port is required.')
  }
  if (
    ![
      'customize',
      'gate',
      'top',
      'typography',
      'save',
      'reopen',
      'tabs',
      'export',
      'import',
      'drop',
      'workspace',
    ].includes(action)
  ) {
    fail(
      'Action must be customize, gate, top, typography, save, reopen, tabs, export, import, drop, or workspace.'
    )
  }
  if (capture !== undefined && !path.isAbsolute(capture)) {
    fail('Capture paths must be absolute.')
  }
  return { port, action, capture }
}

async function getRenderer(browser) {
  const page = browser
    .contexts()
    .flatMap(context => context.pages())
    .find(candidate => candidate.url().includes('/out/index.html'))
  if (page === undefined) {
    fail('The isolated Desktop Material renderer target was not found.')
  }
  return page
}

async function openAppearance(page) {
  if (!(await page.locator('#preferences').isVisible())) {
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.locator('#preferences').waitFor({ state: 'visible' })
  }
  if (
    !(await page.getByRole('heading', { name: 'App identity' }).isVisible())
  ) {
    await page.getByRole('tab', { name: 'Appearance', exact: true }).click()
  }
  await page.getByRole('heading', { name: 'App identity' }).waitFor()
}

async function openWorkspace(page) {
  if (await page.locator('#preferences').isVisible()) {
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.locator('#preferences').waitFor({ state: 'hidden' })
  }

  for (const selector of ['#export-tab-session', '#import-tab-session']) {
    if (await page.locator(selector).isVisible()) {
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.locator(selector).waitFor({ state: 'hidden' })
    }
  }
}

async function emitMenuEvent(page, name) {
  await page.evaluate(menuEvent => {
    const { ipcRenderer } = require('electron')
    ipcRenderer.emit('menu-event', {}, menuEvent)
  }, name)
}

async function setPressed(page, name, pressed) {
  const button = page.getByRole('button', { name, exact: true })
  const current = (await button.getAttribute('aria-pressed')) === 'true'
  if (current !== pressed) {
    await button.click()
  }
}

async function customize(page) {
  await openAppearance(page)
  const name = page.getByRole('textbox', { name: 'App name', exact: true })
  await name.fill('Material Workbench')
  await name.blur()
  await page.getByRole('button', { name: 'Sparkle', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Logo shape', exact: true })
    .selectOption('circle')
  await setPressed(page, 'Show logo in title bar', true)
  await page
    .getByRole('combobox', { name: 'Logo border', exact: true })
    .selectOption('strong')
  await page
    .getByRole('combobox', { name: 'Logo shadow', exact: true })
    .selectOption('soft')
  await page.getByLabel('Logo color', { exact: true }).fill('#6750a4')
  await page.getByLabel('Logo border color', { exact: true }).fill('#4c2e7f')
  await page.getByRole('slider', { name: 'Logo size', exact: true }).fill('22')
  await page
    .getByRole('slider', { name: 'Logo icon inset', exact: true })
    .fill('2')
  await page
    .getByRole('slider', { name: 'Logo rotation', exact: true })
    .fill('-8')
  await page
    .getByRole('slider', { name: 'Logo and name gap', exact: true })
    .fill('10')
  await page
    .getByRole('combobox', { name: 'Font', exact: true })
    .selectOption('Calibri')
  await page
    .getByRole('combobox', { name: 'Weight', exact: true })
    .selectOption('700')
  await page
    .getByRole('combobox', { name: 'Font width', exact: true })
    .selectOption('expanded')
  await page
    .getByRole('combobox', { name: 'Letter case', exact: true })
    .selectOption('uppercase')
  await page
    .getByRole('combobox', { name: 'Text effect', exact: true })
    .selectOption('glow')
  await page
    .getByRole('combobox', { name: 'Name highlight', exact: true })
    .selectOption('pill')
  await setPressed(page, 'Bold', true)
  await setPressed(page, 'Italic', true)
  await setPressed(page, 'Underline', true)
  await setPressed(page, 'Strikethrough', false)
  await setPressed(page, 'Small caps', true)
  await page.getByRole('slider', { name: 'Name size', exact: true }).fill('16')
  await page
    .getByRole('slider', { name: 'Character spacing', exact: true })
    .fill('1')
  await page
    .getByRole('slider', { name: 'App name opacity', exact: true })
    .fill('0.95')
  await page.getByLabel('App name color', { exact: true }).fill('#5b3f8c')
  await page
    .getByLabel('App name highlight color', { exact: true })
    .fill('#e8def8')
  // Reapply the two compact selects after the full burst of synthetic input.
  // React users naturally pause between controls; this keeps the verifier from
  // racing a parent-prop refresh and accidentally restoring an older value.
  await page.waitForTimeout(100)
  await page
    .getByRole('combobox', { name: 'Logo border', exact: true })
    .selectOption('strong')
  await page.waitForTimeout(100)
  await page
    .getByRole('combobox', { name: 'Font width', exact: true })
    .selectOption('expanded')
  await page.waitForTimeout(100)
  if (
    (await page
      .getByRole('combobox', { name: 'Logo border', exact: true })
      .inputValue()) !== 'strong' ||
    (await page
      .getByRole('combobox', { name: 'Font width', exact: true })
      .inputValue()) !== 'expanded'
  ) {
    fail('The final logo-border and font-width choices did not settle.')
  }
  await page
    .locator('.app-identity-section')
    .evaluate(element => element.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(350)
}

function requiredControls(page) {
  return [
    ['App name', page.getByRole('textbox', { name: 'App name', exact: true })],
    ['GitHub logo', page.getByRole('button', { name: 'GitHub', exact: true })],
    [
      'Repository logo',
      page.getByRole('button', { name: 'Repository', exact: true }),
    ],
    [
      'Terminal logo',
      page.getByRole('button', { name: 'Terminal', exact: true }),
    ],
    ['Code logo', page.getByRole('button', { name: 'Code', exact: true })],
    [
      'Sparkle logo',
      page.getByRole('button', { name: 'Sparkle', exact: true }),
    ],
    [
      'Monogram logo',
      page.getByRole('button', { name: 'Monogram', exact: true }),
    ],
    [
      'Custom image logo',
      page.getByRole('button', { name: 'Custom image', exact: true }),
    ],
    [
      'Custom logo image',
      page.getByRole('textbox', { name: 'Custom logo image' }),
    ],
    ['Choose image', page.getByRole('button', { name: 'Choose image…' })],
    [
      'Logo shape',
      page.getByRole('combobox', { name: 'Logo shape', exact: true }),
    ],
    [
      'Show logo',
      page.getByRole('button', {
        name: 'Show logo in title bar',
        exact: true,
      }),
    ],
    [
      'Logo border',
      page.getByRole('combobox', { name: 'Logo border', exact: true }),
    ],
    [
      'Logo shadow',
      page.getByRole('combobox', { name: 'Logo shadow', exact: true }),
    ],
    ['Logo color', page.getByLabel('Logo color', { exact: true })],
    [
      'Logo border color',
      page.getByLabel('Logo border color', { exact: true }),
    ],
    ['Logo size', page.getByRole('slider', { name: 'Logo size', exact: true })],
    [
      'Logo icon inset',
      page.getByRole('slider', { name: 'Logo icon inset', exact: true }),
    ],
    [
      'Logo rotation',
      page.getByRole('slider', { name: 'Logo rotation', exact: true }),
    ],
    [
      'Logo and name gap',
      page.getByRole('slider', { name: 'Logo and name gap', exact: true }),
    ],
    ['Font', page.getByRole('combobox', { name: 'Font', exact: true })],
    ['Weight', page.getByRole('combobox', { name: 'Weight', exact: true })],
    [
      'Font width',
      page.getByRole('combobox', { name: 'Font width', exact: true }),
    ],
    [
      'Letter case',
      page.getByRole('combobox', { name: 'Letter case', exact: true }),
    ],
    [
      'Text effect',
      page.getByRole('combobox', { name: 'Text effect', exact: true }),
    ],
    [
      'Name highlight',
      page.getByRole('combobox', { name: 'Name highlight', exact: true }),
    ],
    ['Bold', page.getByRole('button', { name: 'Bold', exact: true })],
    ['Italic', page.getByRole('button', { name: 'Italic', exact: true })],
    ['Underline', page.getByRole('button', { name: 'Underline', exact: true })],
    [
      'Strikethrough',
      page.getByRole('button', { name: 'Strikethrough', exact: true }),
    ],
    [
      'Small caps',
      page.getByRole('button', { name: 'Small caps', exact: true }),
    ],
    ['Name size', page.getByRole('slider', { name: 'Name size', exact: true })],
    [
      'Character spacing',
      page.getByRole('slider', { name: 'Character spacing', exact: true }),
    ],
    [
      'Name opacity',
      page.getByRole('slider', { name: 'App name opacity', exact: true }),
    ],
    ['Name color', page.getByLabel('App name color', { exact: true })],
    [
      'Highlight color',
      page.getByLabel('App name highlight color', { exact: true }),
    ],
    [
      'Clear formatting',
      page.getByRole('button', { name: 'Clear name formatting' }),
    ],
    ['Reset identity', page.getByRole('button', { name: 'Reset identity' })],
  ]
}

async function inspect(page) {
  return page.evaluate(() => {
    const geometry = selector => {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement)) {
        return null
      }
      const rect = element.getBoundingClientRect()
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }
    }
    const appName = document.querySelector('.app-identity-name-input input')
    const preview = document.querySelector('.app-brand-preview .app-brand')
    const titleBrand = document.querySelector(
      '#desktop-app-title-bar > .app-brand-container .app-brand'
    )
    return {
      title: document.title,
      innerWidth,
      innerHeight,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      preferences: geometry('#preferences'),
      pane: geometry('#preferences .tab-container'),
      identity: geometry('.app-identity-section'),
      appName: appName instanceof HTMLInputElement ? appName.value : null,
      previewName: preview?.textContent?.trim() ?? null,
      titleBrand: titleBrand?.textContent?.trim() ?? null,
      titleBrandStyle:
        titleBrand instanceof HTMLElement
          ? {
              color: getComputedStyle(titleBrand).color,
              fontFamily: getComputedStyle(titleBrand).fontFamily,
              fontSize: getComputedStyle(titleBrand).fontSize,
              fontStretch: getComputedStyle(titleBrand).fontStretch,
              opacity: getComputedStyle(titleBrand).opacity,
            }
          : null,
    }
  })
}

function assertNoHorizontalOverflow(receipt, label) {
  if (
    receipt.documentClientWidth !== receipt.documentScrollWidth ||
    receipt.bodyClientWidth !== receipt.bodyScrollWidth ||
    receipt.pane === null ||
    receipt.pane.scrollWidth > receipt.pane.clientWidth ||
    receipt.identity === null ||
    receipt.identity.scrollWidth > receipt.identity.clientWidth
  ) {
    fail(`${label} horizontal clipping gate failed: ${JSON.stringify(receipt)}`)
  }
}

async function gate(page) {
  await openAppearance(page)
  const required = requiredControls(page)
  for (const [label, locator] of required) {
    if ((await locator.count()) !== 1) {
      fail(`${label} must resolve to exactly one named control.`)
    }
  }

  const normal = await inspect(page)
  assertNoHorizontalOverflow(normal, 'Normal viewport')

  const autoFit = page.getByRole('checkbox', {
    name: 'Automatically shrink the interface to fit small windows',
    exact: true,
  })
  const restoreAutoFit = await autoFit.isChecked()
  if (restoreAutoFit) {
    await autoFit.uncheck()
    await page.waitForTimeout(350)
  }

  const session = await page.context().newCDPSession(page)
  let compact
  const outside = []
  try {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 620,
      height: 620,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 620,
      screenHeight: 620,
    })
    await page.waitForTimeout(500)
    compact = await inspect(page)
    assertNoHorizontalOverflow(compact, 'Compact viewport')
    for (const [label, locator] of required) {
      await locator.scrollIntoViewIfNeeded()
      const box = await locator.boundingBox()
      if (
        box === null ||
        box.x < -1 ||
        box.x + box.width > compact.innerWidth + 1
      ) {
        outside.push({ label, box })
      }
    }
    if (outside.length > 0) {
      fail(
        `Compact named controls clip horizontally: ${JSON.stringify(outside)}`
      )
    }
  } finally {
    await session.send('Emulation.clearDeviceMetricsOverride')
    await page.waitForTimeout(500)
    if (restoreAutoFit) {
      await autoFit.check()
      await page.waitForTimeout(350)
    }
  }

  await page
    .locator('.app-identity-section')
    .evaluate(element => element.scrollIntoView({ block: 'start' }))
  return { requiredControlCount: required.length, outside, normal, compact }
}

async function inspectTabs(page) {
  await openWorkspace(page)
  const favoriteButton = page.locator('.repository-tab-favorite').first()
  if ((await favoriteButton.count()) !== 1) {
    fail('The active repository tab must expose one favorite control.')
  }
  if ((await favoriteButton.getAttribute('aria-pressed')) !== 'true') {
    await favoriteButton.click()
  }

  const arrangeButton = page.getByRole('button', {
    name: 'Arrange tabs',
    exact: true,
  })
  await arrangeButton.click()
  const popover = page.locator('.arrange-tabs')
  await popover.waitFor({ state: 'visible' })

  const requiredSorts = [
    'Label A → Z',
    'Label Z → A',
    'Newest opened',
    'Oldest opened',
    'Needs attention first',
    'Clean first',
    'Favorites first',
    'Favorites last',
  ]
  for (const label of requiredSorts) {
    if (
      (await page.getByRole('button', { name: label, exact: true }).count()) !==
      1
    ) {
      fail(`Arrange tabs is missing the named ${label} action.`)
    }
  }

  return page.evaluate(labels => {
    const element = document.querySelector('.arrange-tabs')
    if (!(element instanceof HTMLElement)) {
      return null
    }
    const rect = element.getBoundingClientRect()
    return {
      favoriteTabs: document.querySelectorAll('.repository-tab.favorite')
        .length,
      requiredSorts: labels.length,
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
      },
      innerWidth,
      innerHeight,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }
  }, requiredSorts)
}

async function inspectTransferDialog(page, kind) {
  await openWorkspace(page)
  const eventName =
    kind === 'export' ? 'export-tab-session' : 'import-tab-session'
  const selector =
    kind === 'export' ? '#export-tab-session' : '#import-tab-session'
  const title =
    kind === 'export' ? 'Export current tabs' : 'Import current tabs'
  await emitMenuEvent(page, eventName)
  const dialog = page.locator(selector)
  await dialog.waitFor({ state: 'visible' })
  if (
    (await page.getByRole('heading', { name: title, exact: true }).count()) !==
    1
  ) {
    fail(`${title} must expose one named heading.`)
  }
  if (kind === 'export') {
    if (
      (await page
        .getByRole('button', { name: /^Export \d+ Tabs?$/ })
        .count()) !== 1
    ) {
      fail('Export current tabs must expose a count-labelled export action.')
    }
  } else if (
    (await page
      .getByRole('button', { name: 'Choose File…', exact: true })
      .count()) < 1
  ) {
    fail('Import current tabs must expose a named file picker action.')
  }
  return dialog.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return {
      id: element.id,
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      innerWidth,
      innerHeight,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }
  })
}

async function inspectDropOverlay(page) {
  await openWorkspace(page)
  await page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['fixture'], 'fixture-folder'))
    document.dispatchEvent(
      new DragEvent('dragenter', { bubbles: true, dataTransfer: transfer })
    )
  })
  const overlay = page.locator('.repository-drop-overlay')
  await overlay.waitFor({ state: 'visible' })
  const receipt = await overlay.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return {
      label: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      role: element.getAttribute('role'),
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      innerWidth,
      innerHeight,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
    }
  })
  return receipt
}

async function clearDropOverlay(page) {
  await page.evaluate(() => {
    document.body.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      })
    )
  })
}

async function captureAction(page, action, outputPath) {
  const targets = {
    top: page.locator('.app-identity-section'),
    typography: page.locator('.app-identity-fieldset').nth(1),
    tabs: page.locator('.popover-component:has(.arrange-tabs)'),
    export: page.locator('#export-tab-session'),
    import: page.locator('#import-tab-session'),
    drop: page.locator('.repository-drop-overlay'),
  }
  const target = targets[action]
  if (target !== undefined && (await target.isVisible())) {
    await target.screenshot({ path: outputPath })
    return
  }
  await page.screenshot({ path: outputPath })
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const browser = await chromium.connectOverCDP(
    `http://127.0.0.1:${options.port}`
  )
  const page = await getRenderer(browser)

  let receipt
  if (options.action === 'customize') {
    await customize(page)
    receipt = await inspect(page)
  } else if (options.action === 'gate') {
    receipt = await gate(page)
  } else if (options.action === 'top') {
    await openAppearance(page)
    await page
      .locator('.app-identity-section')
      .evaluate(element => element.scrollIntoView({ block: 'start' }))
    receipt = await inspect(page)
  } else if (options.action === 'typography') {
    await openAppearance(page)
    await page
      .locator('.app-identity-fieldset')
      .nth(1)
      .evaluate(element => element.scrollIntoView({ block: 'start' }))
    receipt = await inspect(page)
  } else if (options.action === 'save') {
    await openAppearance(page)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.locator('#preferences').waitFor({ state: 'hidden' })
    receipt = await inspect(page)
  } else if (options.action === 'reopen') {
    await openAppearance(page)
    receipt = await inspect(page)
    const savedValues = {
      logoBorder: await page
        .getByRole('combobox', { name: 'Logo border', exact: true })
        .inputValue(),
      logoShadow: await page
        .getByRole('combobox', { name: 'Logo shadow', exact: true })
        .inputValue(),
      logoSize: await page
        .getByRole('slider', { name: 'Logo size', exact: true })
        .inputValue(),
      fontWidth: await page
        .getByRole('combobox', { name: 'Font width', exact: true })
        .inputValue(),
      textEffect: await page
        .getByRole('combobox', { name: 'Text effect', exact: true })
        .inputValue(),
      highlight: await page
        .getByRole('combobox', { name: 'Name highlight', exact: true })
        .inputValue(),
      opacity: await page
        .getByRole('slider', { name: 'App name opacity', exact: true })
        .inputValue(),
    }
    if (
      receipt.appName !== 'Material Workbench' ||
      receipt.previewName !== 'Material Workbench' ||
      receipt.titleBrand !== 'Material Workbench' ||
      receipt.titleBrandStyle?.fontStretch !== '125%' ||
      savedValues.logoBorder !== 'strong' ||
      savedValues.logoShadow !== 'soft' ||
      savedValues.logoSize !== '22' ||
      savedValues.fontWidth !== 'expanded' ||
      savedValues.textEffect !== 'glow' ||
      savedValues.highlight !== 'pill' ||
      savedValues.opacity !== '0.95'
    ) {
      fail(
        `Saved identity did not reopen consistently: ${JSON.stringify({
          receipt,
          savedValues,
        })}`
      )
    }
    receipt.savedValues = savedValues
  } else if (options.action === 'tabs') {
    receipt = await inspectTabs(page)
  } else if (options.action === 'export') {
    receipt = await inspectTransferDialog(page, 'export')
  } else if (options.action === 'import') {
    receipt = await inspectTransferDialog(page, 'import')
  } else if (options.action === 'drop') {
    receipt = await inspectDropOverlay(page)
  } else {
    await openWorkspace(page)
    receipt = await inspect(page)
  }

  if (options.capture !== undefined) {
    await captureAction(page, options.action, options.capture)
  }
  if (options.action === 'drop') {
    await clearDropOverlay(page)
  }

  process.stdout.write(`${JSON.stringify(receipt)}\n`)
  process.exit(0)
}

main().catch(error => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exit(1)
})
