const input = document.querySelector('#destination')
const save = document.querySelector('#save')
const status = document.querySelector('#status')

chrome.storage.local.get({ destination: '' }).then(({ destination }) => {
  input.value = typeof destination === 'string' ? destination : ''
})

save.addEventListener('click', () => {
  const value = input.value.trim()
  if (!/^(?:[a-zA-Z]:[\\/]|\\\\[^\\/]+[\\/])/u.test(value)) {
    status.textContent =
      'Enter an absolute Windows folder path, such as C:\\Downloads.'
    return
  }
  chrome.storage.local.set({ destination: value }).then(() => {
    status.textContent = 'Destination saved locally.'
  })
})
