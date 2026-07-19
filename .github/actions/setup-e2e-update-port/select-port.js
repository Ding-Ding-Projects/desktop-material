const fs = require('fs')
const net = require('net')

const githubEnv = process.env.GITHUB_ENV
const githubOutput = process.env.GITHUB_OUTPUT

if (githubEnv === undefined || githubOutput === undefined) {
  throw new Error('GITHUB_ENV and GITHUB_OUTPUT are required')
}

const server = net.createServer()

server.on('error', error => {
  throw error
})

server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Unable to resolve the selected E2E update port')
  }

  const updateURL = `http://127.0.0.1:${address.port}/update`
  fs.appendFileSync(githubEnv, `DESKTOP_E2E_UPDATES_URL=${updateURL}\n`)
  fs.appendFileSync(githubOutput, `port=${address.port}\nurl=${updateURL}\n`)
  process.stdout.write(`Selected E2E update URL ${updateURL}\n`)

  server.close(error => {
    if (error !== undefined) {
      throw error
    }
  })
})
