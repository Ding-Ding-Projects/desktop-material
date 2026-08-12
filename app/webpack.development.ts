import * as common from './webpack.common'

import * as webpack from 'webpack'
import merge from 'webpack-merge'

const config: webpack.Configuration = {
  mode: 'development',
  /**
   * `source-map` builds a full, separate, column-accurate map for the whole
   * renderer bundle and holds all of it in memory at once. That bundle is now
   * 34 MB — the MD3 shell, a 1 MB translation catalogue and 1.3 MB of inlined
   * documentation — and the compile exhausted a four-gigabyte heap, then a
   * twelve-gigabyte one.
   *
   * `eval-cheap-module-source-map` keeps original sources and line numbers,
   * which is what a stack trace is read for, and gives up per-column accuracy
   * inside a line. That is the cheapest thing to give up and by far the most
   * expensive to keep.
   *
   * Production is deliberately left on `source-map`: a released build's maps
   * are read by crash reports rather than by a person with the file open, and
   * an approximate column there costs someone a real investigation.
   */
  devtool: 'eval-cheap-module-source-map',
}

const mainConfig = merge({}, common.main, config)
const cliConfig = merge({}, common.cli, config)
const highlighterConfig = merge({}, common.highlighter, config)

const getRendererEntryPoint = () => {
  const entry = common.renderer.entry as webpack.EntryObject
  if (entry == null) {
    throw new Error(
      `Unable to resolve entry point. Check webpack.common.ts and try again`
    )
  }

  return entry.renderer as string
}

const getPortOrDefault = () => {
  const port = process.env.PORT
  if (port != null) {
    const result = parseInt(port)
    if (isNaN(result)) {
      throw new Error(`Unable to parse '${port}' into valid number`)
    }
    return result
  }

  return 3000
}

const port = getPortOrDefault()
const webpackHotModuleReloadUrl = `webpack-hot-middleware/client?path=http://localhost:${port}/__webpack_hmr`
const publicPath = `http://localhost:${port}/build/`

const rendererConfig = merge({}, common.renderer, config, {
  entry: {
    renderer: [webpackHotModuleReloadUrl, getRendererEntryPoint()],
  },
  output: {
    publicPath,
  },
  module: {
    rules: [
      // This will cause the compiled CSS (and sourceMap) to be
      // embedded within the compiled javascript bundle and added
      // as a blob:// uri at runtime.
      {
        test: /\.(scss|css)$/,
        use: [
          'style-loader',
          { loader: 'css-loader', options: { sourceMap: true } },
          { loader: 'sass-loader', options: { sourceMap: true } },
        ],
      },
    ],
  },
  infrastructureLogging: {
    level: 'error',
  },
  plugins: [new webpack.HotModuleReplacementPlugin()],
})

const crashConfig = merge({}, common.crash, config, {
  module: {
    rules: [
      // This will cause the compiled CSS (and sourceMap) to be
      // embedded within the compiled javascript bundle and added
      // as a blob:// uri at runtime.
      {
        test: /\.(scss|css)$/,
        use: [
          'style-loader',
          { loader: 'css-loader', options: { sourceMap: true } },
          { loader: 'sass-loader', options: { sourceMap: true } },
        ],
      },
    ],
  },
})

const quickActionConfig = merge({}, common.quickAction, config, {
  module: {
    rules: [
      {
        test: /\.(scss|css)$/,
        use: [
          'style-loader',
          { loader: 'css-loader', options: { sourceMap: true } },
          { loader: 'sass-loader', options: { sourceMap: true } },
        ],
      },
    ],
  },
})

// eslint-disable-next-line no-restricted-syntax
export default [
  mainConfig,
  rendererConfig,
  crashConfig,
  quickActionConfig,
  cliConfig,
  highlighterConfig,
]
