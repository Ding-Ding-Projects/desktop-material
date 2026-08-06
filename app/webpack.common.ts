import * as path from 'path'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import webpack from 'webpack'
import merge from 'webpack-merge'
import { getOAuthReplacements, getReplacements } from './app-info'

export const externals = ['7zip']

const outputDir = 'out'
export const replacements = getReplacements()
const oauthReplacements = getOAuthReplacements()

const commonConfig: webpack.Configuration = {
  optimization: {
    emitOnErrors: false,
  },
  externals: externals,
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, '..', outputDir),
    library: {
      name: '[name]',
      type: 'commonjs2',
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        include: path.resolve(__dirname, 'src'),
        use: [
          {
            loader: 'ts-loader',
          },
        ],
        exclude: /node_modules/,
      },
      {
        // Some modern ESM packages import React's JSX runtime without the
        // .js suffix. Allow webpack to resolve that request in the .mjs graph.
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false,
        },
      },
      {
        test: /\.node$/,
        loader: 'awesome-node-loader',
        options: {
          name: '[name].[ext]',
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
    // The Copilot SDK also publishes an ESM entry that uses `import.meta` to
    // locate its native CLI package. Webpack's Electron renderer runtime
    // cannot provide the generated `__webpack_module__` reference for that
    // entry, so use the SDK's equivalent CommonJS build when bundling the
    // desktop application.
    alias: {
      '@github/copilot-sdk$': path.resolve(
        __dirname,
        'node_modules/@github/copilot-sdk/dist/cjs/index.js'
      ),
    },
  },
  node: {
    __dirname: false,
    __filename: false,
  },
}

export const main = merge({}, commonConfig, {
  entry: { main: path.resolve(__dirname, 'src/main-process/main') },
  target: 'electron-main',
  plugins: [
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('main'),
      })
    ),
  ],
})

export const renderer = merge({}, commonConfig, {
  entry: {
    renderer: path.resolve(__dirname, 'src/ui/index'),
    // Keep the trusted browser chrome isolated as its own entry and HTML
    // document while sharing one renderer compiler. A separate compiler loads
    // and type-checks the full application graph again and pushes the existing
    // production multi-compiler beyond its 12 GiB heap.
    'internal-browser': path.resolve(__dirname, 'src/internal-browser/index'),
  },
  target: 'electron-renderer',
  module: {
    rules: [
      {
        test: /\.(jpe?g|png|gif|ico)$/,
        use: ['file?name=[path][name].[ext]'],
      },
      {
        test: /\.cmd$/,
        type: 'asset/resource',
      },
      {
        test: /\.woff2$/i,
        type: 'asset/resource',
        generator: {
          filename: 'fonts/[name][ext]',
        },
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'static', 'index.html'),
      chunks: ['renderer'],
    }),
    new HtmlWebpackPlugin({
      title: 'GitHub Desktop',
      filename: 'internal-browser.html',
      chunks: ['internal-browser'],
    }),
    new webpack.NormalModuleReplacementPlugin(/^vscode-jsonrpc$/, resource => {
      resource.request = 'vscode-jsonrpc/lib/node/main.js'
    }),
    new webpack.NormalModuleReplacementPlugin(
      /vscode-jsonrpc[\\/]node(\.js)?$/,
      resource => {
        resource.request = 'vscode-jsonrpc/lib/node/main.js'
      }
    ),
    new webpack.DefinePlugin(
      Object.assign({}, replacements, oauthReplacements, {
        __PROCESS_KIND__: JSON.stringify('ui'),
      })
    ),
  ],
  resolve: {
    // Prevent the renderer from using browser-specific versions of modules
    aliasFields: [],
  },
})

export const crash = merge({}, commonConfig, {
  entry: { crash: path.resolve(__dirname, 'src/crash/index') },
  target: 'electron-renderer',
  plugins: [
    new HtmlWebpackPlugin({
      title: 'GitHub Desktop',
      filename: 'crash.html',
      chunks: ['crash'],
    }),
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('crash'),
      })
    ),
  ],
})

/**
 * The quick-action window's renderer. A separate bundle from `renderer` on
 * purpose: the window is opened from an Explorer right-click and is judged on
 * how fast it appears, so it must not pay for the full workspace bundle.
 */
export const quickAction = merge({}, commonConfig, {
  entry: { 'quick-action': path.resolve(__dirname, 'src/quick-action/index') },
  target: 'electron-renderer',
  plugins: [
    new HtmlWebpackPlugin({
      title: 'GitHub Desktop',
      filename: 'quick-action.html',
      chunks: ['quick-action'],
    }),
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('quick-action'),
      })
    ),
  ],
  resolve: {
    // Match the main renderer: prevent browser-specific module variants, which
    // would break the node-side git and keytar usage this window needs.
    aliasFields: [],
  },
})

export const cli = merge({}, commonConfig, {
  entry: { cli: path.resolve(__dirname, 'src/cli/main') },
  target: 'node',
  plugins: [
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('cli'),
      })
    ),
  ],
})

export const highlighter = merge({}, commonConfig, {
  entry: { highlighter: path.resolve(__dirname, 'src/highlighter/index') },
  output: {
    library: {
      name: '[name]',
      type: 'var',
    },
    chunkFilename: 'highlighter/[name].js',
  },
  optimization: {
    chunkIds: 'named',
    splitChunks: {
      cacheGroups: {
        modes: {
          enforce: true,
          name: (mod: any) => {
            const builtInMode =
              /node_modules[\\\/]codemirror[\\\/]mode[\\\/](\w+)[\\\/]/i.exec(
                mod.resource
              )
            if (builtInMode) {
              return `mode/${builtInMode[1]}`
            }
            const external =
              /node_modules[\\\/]codemirror-mode-(\w+)[\\\/]/i.exec(
                mod.resource
              )
            if (external) {
              return `ext/${external[1]}`
            }
            return 'common'
          },
        },
      },
    },
  },
  target: 'webworker',
  plugins: [
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('highlighter'),
      })
    ),
  ],
  resolve: {
    // We don't want to bundle all of CodeMirror in the highlighter. A web
    // worker doesn't have access to the DOM and most of CodeMirror's core
    // code is useless to us in that context. So instead we use this super
    // nifty subset of codemirror that defines the minimal context needed
    // to run a mode inside of node. Now, we're not running in node
    // but CodeMirror doesn't have to know about that.
    alias: {
      codemirror$: 'codemirror/addon/runmode/runmode.node.js',
      '../lib/codemirror$': '../addon/runmode/runmode.node.js',
      '../../lib/codemirror$': '../../addon/runmode/runmode.node.js',
      '../../addon/runmode/runmode$': '../../addon/runmode/runmode.node.js',
    },
  },
})

highlighter.module!.rules = [
  {
    test: /\.ts$/,
    include: path.resolve(__dirname, 'src/highlighter'),
    use: [
      {
        loader: 'ts-loader',
        options: {
          configFile: path.resolve(__dirname, 'src/highlighter/tsconfig.json'),
        },
      },
    ],
    exclude: /node_modules/,
  },
]
