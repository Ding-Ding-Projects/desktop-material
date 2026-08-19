'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('designReference', {
  catalog: () => ipcRenderer.invoke('design-reference:catalog'),
  launchConfiguration: () =>
    ipcRenderer.invoke('design-reference:launch-configuration'),
  read: reference => ipcRenderer.invoke('design-reference:read', reference),
  windowAction: action =>
    ipcRenderer.invoke('design-reference:window-action', action),
})
