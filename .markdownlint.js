const markdownlintGitHub = require('@github/markdownlint-github')
module.exports = markdownlintGitHub.init({
  // Preserve the rule surface from markdownlint 0.26.x while updating the CLI.
  MD054: false,
  MD055: false,
  MD056: false,
  MD058: false,
  MD059: false,
  MD060: false,
})
