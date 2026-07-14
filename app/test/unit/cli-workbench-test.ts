import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  ICLIWorkbenchOperationRequest,
  ICLIWorkbenchRuntime,
} from '../../src/lib/cli-workbench'

describe('CLI workbench semantic contract', () => {
  it('carries a named operation without executable or argv fields', () => {
    const request: ICLIWorkbenchOperationRequest = {
      id: 'run-1',
      operation: { id: 'history-deepen', remote: 'origin', deepenBy: 50 },
      repositoryPath: 'C:/repository',
      confirmed: true,
    }
    assert.equal('tool' in request, false)
    assert.equal('args' in request, false)
    assert.equal(request.operation.id, 'history-deepen')
  })

  it('exposes runtime availability without command catalog entries', () => {
    const runtime: ICLIWorkbenchRuntime = {
      tools: [
        {
          tool: 'git',
          available: true,
          version: 'git version 2.55.0',
          error: null,
        },
      ],
    }
    assert.equal('entries' in runtime, false)
    assert.equal('entries' in runtime.tools[0], false)
  })
})
