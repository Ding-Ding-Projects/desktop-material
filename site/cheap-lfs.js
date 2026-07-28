;(() => {
  const root = document.documentElement
  const languageButtons = [...document.querySelectorAll('[data-set-language]')]
  const storedLanguage = localStorage.getItem('desktop-material-language')
  const initialLanguage = ['en', 'yue', 'bi'].includes(storedLanguage)
    ? storedLanguage
    : 'bi'

  const applyLanguage = language => {
    root.dataset.language = language
    root.lang = language === 'yue' ? 'zh-HK' : 'en'
    localStorage.setItem('desktop-material-language', language)
    for (const button of languageButtons) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.setLanguage === language)
      )
    }
  }

  for (const button of languageButtons) {
    button.addEventListener('click', () =>
      applyLanguage(button.dataset.setLanguage)
    )
  }
  applyLanguage(initialLanguage)

  const funnyCopy = {
    en: [
      'Large-file storage with verifiable restores.',
      'Large files without a heavyweight Git history.',
      'Big files, tiny commits, fewer clone-time sighs.',
      'Put the heavy bytes in storage; let Git travel light.',
      'Git gets the postcard; the enormous suitcase takes the cargo route.',
    ],
    yue: [
      '大檔儲存與可驗證還原。',
      '大檔唔使塞入 Git 歷史。',
      '大檔搬出 Git，clone 唔使做到氣咳。',
      '大舊 bytes 去倉庫，Git 輕裝上路，行快兩步。',
      'Git 拎張明信片就夠，大喼自己搭貨船，唔好阻住條路呀喂。',
    ],
  }
  const toneButton = document.querySelector('.tone-button')
  const tonePanel = document.querySelector('.tone-panel')
  const toneClose = document.querySelector('.tone-close')
  const funnyInputs = {
    en: document.querySelector('#funny-en'),
    yue: document.querySelector('#funny-yue'),
  }

  const storedLevel = language => {
    const parsed = Number(
      localStorage.getItem(`desktop-material-funny-${language}`)
    )
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5
      ? parsed
      : language === 'en'
      ? 2
      : 4
  }

  const applyFunnyLevel = (language, level) => {
    const safeLevel = Math.min(5, Math.max(1, Number(level)))
    root.dataset[`funny${language === 'en' ? 'En' : 'Yue'}`] = String(safeLevel)
    localStorage.setItem(
      `desktop-material-funny-${language}`,
      String(safeLevel)
    )
    const input = funnyInputs[language]
    if (input) input.value = String(safeLevel)
    const output = document.querySelector(`#funny-${language}-value`)
    if (output) output.value = String(safeLevel)
    const preview = document.querySelector(`.tone-preview-${language}`)
    if (preview) preview.textContent = funnyCopy[language][safeLevel - 1]
    const target = document.querySelector(`[data-tone-target="${language}"]`)
    if (target) target.textContent = funnyCopy[language][safeLevel - 1]
  }

  for (const language of ['en', 'yue']) {
    applyFunnyLevel(language, storedLevel(language))
    funnyInputs[language]?.addEventListener('input', event =>
      applyFunnyLevel(language, event.currentTarget.value)
    )
  }

  const setTonePanelOpen = open => {
    toneButton?.setAttribute('aria-expanded', String(open))
    if (tonePanel) tonePanel.hidden = !open
  }
  toneButton?.addEventListener('click', () =>
    setTonePanelOpen(toneButton.getAttribute('aria-expanded') !== 'true')
  )
  toneClose?.addEventListener('click', () => setTonePanelOpen(false))

  const storedTheme = localStorage.getItem('desktop-material-theme')
  if (storedTheme === 'light' || storedTheme === 'dark') {
    root.dataset.theme = storedTheme
  }

  document.querySelector('.theme-button')?.addEventListener('click', () => {
    const current =
      root.dataset.theme ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    const next = current === 'dark' ? 'light' : 'dark'
    root.dataset.theme = next
    localStorage.setItem('desktop-material-theme', next)
  })

  const comparisonFilters = [
    ...document.querySelectorAll('[data-comparison-filter]'),
  ]
  const comparisonGroups = [
    ...document.querySelectorAll('[data-comparison-group]'),
  ]
  const comparisonCount = document.querySelector('[data-comparison-count]')
  const comparisonNames = new Set([
    'all',
    ...comparisonGroups.map(group => group.dataset.comparisonGroup),
  ])

  const applyComparisonFilter = filter => {
    const safeFilter = comparisonNames.has(filter) ? filter : 'all'
    let visibleRows = 0

    for (const group of comparisonGroups) {
      const visible =
        safeFilter === 'all' || group.dataset.comparisonGroup === safeFilter
      group.hidden = !visible
      if (visible) {
        visibleRows += group.querySelectorAll('.comparison-row').length
      }
    }

    for (const button of comparisonFilters) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.comparisonFilter === safeFilter)
      )
    }

    if (comparisonCount) comparisonCount.textContent = String(visibleRows)
    localStorage.setItem(
      'desktop-material-cheap-lfs-comparison-filter',
      safeFilter
    )
  }

  for (const button of comparisonFilters) {
    button.addEventListener('click', () =>
      applyComparisonFilter(button.dataset.comparisonFilter)
    )
  }

  applyComparisonFilter(
    localStorage.getItem('desktop-material-cheap-lfs-comparison-filter') ||
      'all'
  )

  const menuButton = document.querySelector('.guide-menu-button')
  const nav = document.querySelector('.guide-nav')
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true'
    menuButton.setAttribute('aria-expanded', String(open))
    nav?.classList.toggle('is-open', open)
  })

  nav?.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('a')) {
      return
    }
    menuButton?.setAttribute('aria-expanded', 'false')
    nav.classList.remove('is-open')
  })
})()
