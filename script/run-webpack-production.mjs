import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const environment = { ...process.env }
if (!environment.NODE_OPTIONS?.trim()) {
  environment.NODE_OPTIONS = '--max_old_space_size=12288'
}

const webpackPath = resolve('node_modules', 'webpack', 'bin', 'webpack.js')
const result = spawnSync(
  process.execPath,
  [webpackPath, '--config', 'app/webpack.production.ts'],
  {
    env: environment,
    stdio: 'inherit',
  }
)

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
