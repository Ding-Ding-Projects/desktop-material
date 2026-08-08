import markdownIt from 'markdown-it'
import { init } from '@github/markdownlint-github'

const markdownItFactory = () => markdownIt({ html: true })

export default {
  config: init({
    MD054: false,
    MD055: false,
    MD056: false,
    MD058: false,
    MD059: false,
    MD060: false,
  }),
  customRules: ['@github/markdownlint-github'],
  markdownItFactory,
}
