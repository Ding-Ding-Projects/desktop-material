'use strict'
;(async function prepareCapture() {
  try {
    const [catalog, launch] = await Promise.all([
      window.designReference.catalog(),
      window.designReference.launchConfiguration(),
    ])
    const reference = await window.designReference.read(launch.reference)
    const route =
      launch.state === 'default'
        ? null
        : catalog.stateRoutes.find(item => item.name === launch.state)
    if (launch.state !== 'default' && !route) {
      throw new Error(`Unknown design state: ${launch.state}.`)
    }
    const frame = document.getElementById('capture-frame')
    const rendered = await window.DesignReferenceRuntime.render({
      frame,
      reference,
      route,
      theme: launch.theme,
      autoFit: launch.autoFit,
      disableMotion: true,
    })
    window.__designCaptureReceipt = {
      schemaVersion: 1,
      reference: reference.identity,
      state: {
        name: route?.name ?? 'default',
        theme: launch.theme,
        autoFit: launch.autoFit,
        performedActions: rendered.performedActions,
      },
      observed: rendered.observed,
    }
  } catch (error) {
    window.__designCaptureReceipt = { error: error.message }
  }
})()
