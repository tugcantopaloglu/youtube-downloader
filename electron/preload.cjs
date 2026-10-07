const { contextBridge, ipcRenderer } = require('electron')

const call = async (channel, ...args) => {
  const result = await ipcRenderer.invoke(channel, ...args)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

contextBridge.exposeInMainWorld('akis', {
  state: () => call('state'),
  analyze: options => call('analyze', options),
  enqueue: options => call('enqueue', options),
  cancel: id => call('cancel', id),
  retry: id => call('retry', id),
  remove: id => call('remove', id),
  pause: paused => call('pause', paused),
  networkRestored: () => call('network-restored'),
  saveSettings: settings => call('save-settings', settings),
  chooseDirectory: () => call('choose-directory'),
  chooseCookies: () => call('choose-cookies'),
  openFile: id => call('open-file', id),
  revealFile: id => call('reveal-file', id),
  openDirectory: () => call('open-directory'),
  checkTools: () => call('check-tools'),
  checkUpdate: () => call('check-update'),
  downloadUpdate: () => call('download-update'),
  installUpdate: () => call('install-update'),
  window: action => call('window', action),
  onState: callback => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('state-changed', listener)
    return () => ipcRenderer.removeListener('state-changed', listener)
  }
})
