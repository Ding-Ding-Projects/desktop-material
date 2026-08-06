import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const source = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), 'utf8')

describe('issue #134 workflow invocation paths', () => {
  it('mounts Gitflow and interactive rebase in the Repository Tools hub', () => {
    const tools = source('app/src/ui/repository-tools/repository-tools.tsx')
    assert.match(tools, /id: 'gitflow'/)
    assert.match(tools, /id: 'interactive-rebase'/)
    assert.match(tools, /GitflowManager/)
    assert.match(tools, /RepositoryCommitRewrite/)
    assert.match(tools, /selected === 'interactive-rebase'/)
  })

  it('keeps history cherry-pick connected to the guarded visual operation dialog', () => {
    const menu = source('app/src/ui/history/commit-context-menu.ts')
    const app = source('app/src/ui/app.tsx')
    const operation = source(
      'app/src/ui/multi-commit-operation/cherry-pick.tsx'
    )
    assert.match(menu, /onCherryPick\?\.\(\[commit\]\)/)
    assert.match(app, /startCherryPickWithoutBranch/)
    assert.match(app, /PopupType\.MultiCommitOperation/)
    assert.match(operation, /ChooseTargetBranchDialog/)
    assert.match(operation, /onCreateNewBranch/)
  })

  it('uses CodeMirror for the editable conflict result while retaining a fallback', () => {
    const editor = source('app/src/ui/lib/codemirror-editor.tsx')
    const merge = source('app/src/ui/merge-conflicts/ai-merge-editor.tsx')
    assert.match(editor, /CodeMirror\.fromTextArea/)
    assert.match(editor, /code-mirror-editor-fallback/)
    assert.match(merge, /<CodeMirrorEditor/)
    assert.doesNotMatch(merge, /<textarea[\s\S]*isResult/)
  })
})
