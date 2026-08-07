'use strict'

const { createHash } = require('node:crypto')
const {
  createReadStream,
  readFileSync,
  realpathSync,
  statSync,
} = require('node:fs')
const { resolve, sep } = require('node:path')

const releaseEntryPattern = /^([0-9a-fA-F]{40})\s+(\S+)\s+(\d+)$/
const releaseEntryCommentPattern = /\s*#.*$/

function hashFileSha1(filePath) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha1')
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolveHash(hash.digest('hex')))
  })
}

async function verifyReleasesManifest(manifest, directory) {
  if (typeof manifest !== 'string') {
    throw new Error('Squirrel RELEASES manifest must be a string.')
  }

  const root = realpathSync(resolve(directory))
  let verified = 0
  for (const rawLine of manifest.split(/\r?\n/)) {
    const line = rawLine.replace(releaseEntryCommentPattern, '').trim()
    if (line.length === 0) {
      continue
    }

    const entry = releaseEntryPattern.exec(line)
    if (entry === null) {
      throw new Error(`Unreadable Squirrel RELEASES entry '${line}'.`)
    }

    const [, expectedSha, fileName, expectedSize] = entry
    if (fileName === '.' || fileName === '..' || /[\\/]/.test(fileName)) {
      throw new Error(`Unsafe Squirrel package path '${fileName}'.`)
    }

    const filePath = realpathSync(resolve(root, fileName))
    if (!filePath.startsWith(`${root}${sep}`)) {
      throw new Error(
        `Squirrel package escapes the release directory: ${fileName}.`
      )
    }

    const actualSize = statSync(filePath).size.toString()
    if (actualSize !== expectedSize) {
      throw new Error(
        `Squirrel package size mismatch for ${fileName}: expected ${expectedSize}, got ${actualSize}.`
      )
    }

    const actualSha = await hashFileSha1(filePath)
    if (actualSha.toLowerCase() !== expectedSha.toLowerCase()) {
      throw new Error(
        `Squirrel package SHA-1 mismatch for ${fileName}: expected ${expectedSha}, got ${actualSha}.`
      )
    }

    verified += 1
  }

  if (verified === 0) {
    throw new Error('Squirrel RELEASES manifest contains no package entries.')
  }

  return verified
}

async function runCli(argv) {
  if (argv.length !== 2) {
    throw new Error(
      'Usage: verify-releases-manifest.js <RELEASES> <package-directory>'
    )
  }

  const [manifestPath, directory] = argv
  const count = await verifyReleasesManifest(
    readFileSync(manifestPath, 'utf8'),
    directory
  )
  process.stdout.write(
    `Verified ${count} Squirrel package hash and size entr${
      count === 1 ? 'y' : 'ies'
    }.\n`
  )
}

if (require.main === module) {
  runCli(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`)
    process.exitCode = 1
  })
}

module.exports = { verifyReleasesManifest }
