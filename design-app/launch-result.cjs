'use strict'

const fs = require('node:fs')

const PngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function assertLaunchResult(options, result, fileSystem = fs) {
  if (result.error) throw result.error
  const status = result.status ?? 1
  if (status !== 0) return status
  if (!options.capture) return 0
  if (!fileSystem.existsSync(options.capture)) {
    throw new Error(
      'Electron exited successfully without producing the requested PNG.'
    )
  }
  const handle = fileSystem.openSync(options.capture, 'r')
  try {
    const signature = Buffer.alloc(PngSignature.length)
    const bytesRead = fileSystem.readSync(
      handle,
      signature,
      0,
      signature.length,
      0
    )
    if (bytesRead !== signature.length || !signature.equals(PngSignature)) {
      throw new Error('Electron reported success but the capture is not a PNG.')
    }
  } finally {
    fileSystem.closeSync(handle)
  }
  return 0
}

module.exports = { PngSignature, assertLaunchResult }
