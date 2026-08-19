import {
  IMd3TerminalLine,
  IMd3TerminalSession,
  createMd3TerminalLines,
} from './md3-terminal-view'

/**
 * PREVIEW AND TEST DATA ONLY.
 *
 * Nothing here ships in a running build. `Md3TerminalView` renders a real
 * shell — its sessions, its status and its output all arrive as props from
 * whatever is actually running the process. These fixtures exist so a unit
 * test or a screenshot harness has something deterministic to render, and so
 * `createMd3TerminalLines` has a worked example beside it.
 *
 * Do not import this module from application code.
 */

/** A short, ordinary session: a couple of commands and their output. */
export const md3TerminalSampleChunks: ReadonlyArray<string> = [
  'sample@host ~/code/sample (main)\r\n',
  '$ git status --short\r\n',
  ' M app/styles/ui/_md3-terminal.scss\r\n',
  ' A app/src/ui/md3/md3-terminal-view.tsx\r\n',
  '$ npm run lint:styles\r\n',
  'sass  0 problems in 216 files\r\n',
]

export const md3TerminalSampleLines: ReadonlyArray<IMd3TerminalLine> =
  createMd3TerminalLines(md3TerminalSampleChunks, 'sample')

export const md3TerminalSampleSessions: ReadonlyArray<IMd3TerminalSession> = [
  {
    id: 'sample-1',
    label: 'bash — sample',
    status: 'ready',
    prompt: '~/code/sample $',
    workingDirectory: '/home/sample/code/sample',
    lines: md3TerminalSampleLines,
  },
  {
    id: 'sample-2',
    label: 'pwsh — sample-tools',
    status: 'running',
    prompt: '~/code/sample-tools $',
    workingDirectory: '/home/sample/code/sample-tools',
    statusDetail: 'Running npm run build',
    lines: createMd3TerminalLines(
      ['$ npm run build\r\n', 'building…\r\n'],
      'sample-2'
    ),
  },
  {
    id: 'sample-3',
    label: 'zsh — sample-docs',
    status: 'exited',
    prompt: '~/code/sample-docs $',
    workingDirectory: '/home/sample/code/sample-docs',
    statusDetail: 'Exited with code 1',
    lines: createMd3TerminalLines(
      ['$ npm test\r\n', '1 failing\r\n'],
      'sample-3'
    ),
  },
]

/** A long session, for exercising the scrollback cap and its notice. */
export function md3TerminalLongSession(lineCount: number): IMd3TerminalSession {
  const chunks = new Array<string>()
  chunks.push('$ seq 1 ' + String(lineCount) + '\r\n')
  for (let index = 1; index <= lineCount; index++) {
    chunks.push(String(index) + '\r\n')
  }

  return {
    id: 'sample-long',
    label: 'bash — sample-long',
    status: 'ready',
    prompt: '~/code/sample $',
    lines: createMd3TerminalLines(chunks, 'sample-long'),
  }
}
