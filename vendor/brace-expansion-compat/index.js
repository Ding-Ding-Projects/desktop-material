// minimatch 3.x and 5.x call the brace-expansion CommonJS export directly.
// brace-expansion 5.x exposes the same operation as the named `expand` export,
// so retain the legacy callable shape while delegating expansion to the
// security-maintained implementation.
const modern = require('brace-expansion-modern')
const expand = modern.expand

module.exports = expand
module.exports.expand = expand
module.exports.EXPANSION_MAX = modern.EXPANSION_MAX
module.exports.EXPANSION_MAX_LENGTH = modern.EXPANSION_MAX_LENGTH
