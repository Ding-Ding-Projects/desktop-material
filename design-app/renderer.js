'use strict'
;(async function startDesignReferenceViewer() {
  const elements = {
    referenceSearch: document.getElementById('reference-search'),
    referenceList: document.getElementById('reference-list'),
    stateSearch: document.getElementById('state-search'),
    stateList: document.getElementById('state-list'),
    width: document.getElementById('viewport-width'),
    height: document.getElementById('viewport-height'),
    autoFit: document.getElementById('auto-fit'),
    apply: document.getElementById('apply'),
    identity: document.getElementById('identity'),
    preview: document.getElementById('preview'),
    previewTitle: document.getElementById('preview-title'),
    previewState: document.getElementById('preview-state'),
    status: document.getElementById('status'),
  }
  const [catalog, launch] = await Promise.all([
    window.designReference.catalog(),
    window.designReference.launchConfiguration(),
  ])
  const model = {
    reference: launch.reference,
    state: launch.state,
    theme: launch.theme,
    width: launch.width,
    height: launch.height,
    autoFit: launch.autoFit,
    generation: 0,
  }

  function selectedReference() {
    return catalog.references.find(item => item.id === model.reference)
  }

  function availableRoutes() {
    const registered = catalog.stateRoutes.filter(
      route => route.reference === model.reference
    )
    if (registered.length === 0) {
      return [
        {
          name: 'default',
          theme: model.theme,
          actions: [],
          expectedLabels: [],
          suppliedPng: null,
        },
      ]
    }
    return registered
  }

  function selectedRoute() {
    return availableRoutes().find(item => item.name === model.state) ?? null
  }

  function button(label, selected, onClick, supportingText = '') {
    const control = document.createElement('button')
    control.type = 'button'
    control.setAttribute('role', 'option')
    control.setAttribute('aria-selected', String(selected))
    control.append(document.createTextNode(label))
    if (supportingText) {
      const small = document.createElement('small')
      small.textContent = supportingText
      control.append(small)
    }
    control.addEventListener('click', onClick)
    return control
  }

  function renderReferenceList() {
    const query = elements.referenceSearch.value.trim().toLocaleLowerCase()
    elements.referenceList.replaceChildren()
    for (const reference of catalog.references.filter(item =>
      `${item.id} ${item.title}`.toLocaleLowerCase().includes(query)
    )) {
      elements.referenceList.append(
        button(
          reference.file,
          reference.id === model.reference,
          () => {
            model.reference = reference.id
            model.state =
              catalog.stateRoutes.find(
                route => route.reference === reference.id
              )?.name ?? 'default'
            renderReferenceList()
            renderStateList()
            void renderSelected()
          },
          `${reference.bytes.toLocaleString()} bytes · ${reference.sha256.slice(
            0,
            12
          )}`
        )
      )
    }
  }

  function renderStateList() {
    const query = elements.stateSearch.value.trim().toLocaleLowerCase()
    elements.stateList.replaceChildren()
    for (const route of availableRoutes().filter(item =>
      item.name.toLocaleLowerCase().includes(query)
    )) {
      elements.stateList.append(
        button(
          route.name,
          route.name === model.state,
          () => {
            model.state = route.name
            if (route.name !== 'default') model.theme = route.theme
            syncControls()
            renderStateList()
            void renderSelected()
          },
          route.name === 'default'
            ? 'Source default state'
            : `${route.actions.length} deterministic action${
                route.actions.length === 1 ? '' : 's'
              }`
        )
      )
    }
  }

  function syncControls() {
    elements.width.value = String(model.width)
    elements.height.value = String(model.height)
    elements.autoFit.checked = model.autoFit
    for (const input of document.querySelectorAll('input[name="theme"]')) {
      input.checked = input.value === model.theme
    }
    document.body.dataset.theme = model.theme
  }

  function setIdentity(reference, route, observed) {
    const rows = [
      ['File', reference.identity.id],
      ['Bytes', reference.identity.bytes.toLocaleString()],
      ['SHA-256', reference.identity.sha256],
      ['State', route?.name ?? 'default'],
      ['Theme', model.theme],
      ['Viewport', `${model.width} × ${model.height}`],
      ['Auto-fit', model.autoFit ? 'on' : 'off'],
      ['Visible labels', String(observed.labels.length)],
      ['Font state', observed.fontStatus],
    ]
    elements.identity.replaceChildren()
    for (const [term, value] of rows) {
      const dt = document.createElement('dt')
      dt.textContent = term
      const dd = document.createElement('dd')
      dd.textContent = value
      elements.identity.append(dt, dd)
    }
  }

  function setStatus(text, kind = '') {
    elements.status.textContent = text
    elements.status.dataset.kind = kind
  }

  async function renderSelected() {
    const generation = ++model.generation
    const referenceEntry = selectedReference()
    const route = selectedRoute()
    setStatus('Rendering')
    elements.apply.disabled = true
    elements.preview.style.width = `${model.width}px`
    elements.preview.style.height = `${model.height}px`
    elements.previewTitle.textContent = referenceEntry.file
    elements.previewState.textContent = `${route?.name ?? 'default'} · ${
      model.theme
    } · ${model.width} × ${model.height}`
    try {
      const reference = await window.designReference.read(referenceEntry.id)
      const receipt = await window.DesignReferenceRuntime.render({
        frame: elements.preview,
        reference,
        route,
        theme: model.theme,
        autoFit: model.autoFit,
        disableMotion: false,
      })
      if (generation !== model.generation) return
      setIdentity(reference, route, receipt.observed)
      setStatus('Ready', 'ready')
    } catch (error) {
      if (generation !== model.generation) return
      setStatus(error.message, 'error')
    } finally {
      if (generation === model.generation) elements.apply.disabled = false
    }
  }

  elements.referenceSearch.addEventListener('input', renderReferenceList)
  elements.stateSearch.addEventListener('input', renderStateList)
  elements.apply.addEventListener('click', () => {
    model.width = Number(elements.width.value)
    model.height = Number(elements.height.value)
    model.autoFit = elements.autoFit.checked
    if (
      !Number.isSafeInteger(model.width) ||
      !Number.isSafeInteger(model.height) ||
      model.width < 320 ||
      model.height < 320 ||
      model.width > 4096 ||
      model.height > 4096
    ) {
      setStatus(
        'Viewport dimensions must be integers from 320 through 4096.',
        'error'
      )
      return
    }
    void renderSelected()
  })
  for (const input of document.querySelectorAll('input[name="theme"]')) {
    input.addEventListener('change', () => {
      if (!input.checked) return
      model.theme = input.value
      syncControls()
      void renderSelected()
    })
  }
  for (const preset of document.querySelectorAll('[data-viewport]')) {
    preset.addEventListener('click', () => {
      const [width, height] = preset.dataset.viewport.split('x').map(Number)
      model.width = width
      model.height = height
      syncControls()
      void renderSelected()
    })
  }
  for (const control of document.querySelectorAll('[data-window-action]')) {
    control.addEventListener('click', () =>
      window.designReference.windowAction(control.dataset.windowAction)
    )
  }

  syncControls()
  renderReferenceList()
  renderStateList()
  await renderSelected()
})().catch(error => {
  const status = document.getElementById('status')
  status.textContent = error.message
  status.dataset.kind = 'error'
})
