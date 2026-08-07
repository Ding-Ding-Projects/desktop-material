import productionConfig from '../../../app/webpack.production'

const renderer = productionConfig[1]

for (const compiler of [renderer]) {
  for (const rule of compiler.module?.rules ?? []) {
    const mutableRule = rule as any
    const uses = Array.isArray(mutableRule.use)
      ? mutableRule.use
      : [mutableRule.use]

    for (const use of uses) {
      if (use?.loader === 'ts-loader') {
        use.options = {
          ...use.options,
          onlyCompileBundledFiles: true,
        }
      }
    }
  }
}

renderer.plugins = (renderer.plugins ?? []).filter(
  plugin => plugin?.constructor?.name !== 'BundleAnalyzerPlugin'
)

export default [renderer]
