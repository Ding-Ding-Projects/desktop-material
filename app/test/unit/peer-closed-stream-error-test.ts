import assert from 'node:assert'
import { EventEmitter } from 'node:events'
import { describe, it } from 'node:test'
import {
  canStillWriteTo,
  classifyPeerClosedStreamError,
  guardStreamAgainstPeerClose,
  isPeerClosedStreamError,
} from '../../src/lib/peer-closed-stream-error'

function errnoError(
  message: string,
  code: string,
  syscall?: string
): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(message)
  error.code = code
  if (syscall !== undefined) {
    error.syscall = syscall
  }
  return error
}

describe('peer-closed stream errors', () => {
  describe('classifyPeerClosedStreamError', () => {
    it('recognizes the crash reported from the field', () => {
      // The exact error a Windows named pipe produces when the peer exits while
      // a write is in flight:
      //   Error: write EOF
      //     at WriteWrap.onWriteComplete (node:internal/stream_base_commons:87)
      const error = errnoError('write EOF', 'EOF', 'write')
      error.errno = -4095

      assert.equal(classifyPeerClosedStreamError(error), 'EOF')
      assert.equal(isPeerClosedStreamError(error), true)
    })

    it('recognizes every peer-closed errno code', () => {
      for (const code of ['EPIPE', 'ECONNRESET', 'ECONNABORTED', 'EOF']) {
        assert.equal(
          classifyPeerClosedStreamError(
            errnoError(`write ${code}`, code, 'write')
          ),
          code,
          `expected ${code} to classify`
        )
      }
    })

    it('recognizes the stream state codes a torn-down write raises', () => {
      for (const code of [
        'ERR_STREAM_DESTROYED',
        'ERR_STREAM_WRITE_AFTER_END',
        'ERR_STREAM_ALREADY_FINISHED',
      ]) {
        assert.equal(
          classifyPeerClosedStreamError(
            errnoError('Cannot call write after a stream was destroyed', code)
          ),
          code
        )
      }
    })

    it('classifies from the message alone once IPC has stripped the code', () => {
      // `getIpcFriendlyError` reduces an error to { name, message, stack }, so
      // a renderer report arrives without code/errno/syscall.
      for (const message of [
        'write EOF',
        'write EPIPE',
        'read ECONNRESET',
        'shutdown ECONNRESET',
        'Cannot call write after a stream was destroyed',
        'write after end',
        'This socket has been ended by the other party',
        'premature close',
      ]) {
        assert.equal(
          classifyPeerClosedStreamError(new Error(message)),
          message,
          `expected "${message}" to classify`
        )
      }
    })

    it('leaves unknown errors alone so they stay fatal', () => {
      const unknown: ReadonlyArray<unknown> = [
        new Error('Cannot read properties of undefined'),
        new TypeError('x is not a function'),
        new RangeError('Maximum call stack size exceeded'),
        errnoError('connect ECONNREFUSED', 'ECONNREFUSED', 'connect'),
        errnoError('connect ETIMEDOUT', 'ETIMEDOUT', 'connect'),
        errnoError('listen EADDRINUSE', 'EADDRINUSE', 'listen'),
        errnoError('open EACCES', 'EACCES', 'open'),
        errnoError('unlink EPERM', 'EPERM', 'unlink'),
        new Error('Authentication failed'),
        undefined,
        null,
        'write EOF',
        42,
      ]

      for (const error of unknown) {
        assert.equal(
          classifyPeerClosedStreamError(error),
          null,
          `expected ${String(error)} to stay fatal`
        )
        assert.equal(isPeerClosedStreamError(error), false)
      }
    })

    it('rejects a peer-closed code attached to a non-I/O syscall', () => {
      // A connect that fails with a familiar code is a real connection failure,
      // not a write to something that already went away.
      assert.equal(
        classifyPeerClosedStreamError(
          errnoError('connect ECONNRESET', 'ECONNRESET', 'connect')
        ),
        null
      )
    })

    it('does not match prose that merely mentions a code', () => {
      for (const message of [
        'The upload failed: write EOF happened somewhere',
        'Please retry, write EPIPE',
        'ECONNRESET',
        'A previous write after end was logged',
      ]) {
        assert.equal(
          classifyPeerClosedStreamError(new Error(message)),
          null,
          `expected "${message}" to stay fatal`
        )
      }
    })
  })

  describe('canStillWriteTo', () => {
    it('refuses a destroyed, ended, or non-writable stream', () => {
      assert.equal(canStillWriteTo(null), false)
      assert.equal(
        canStillWriteTo({ destroyed: true, on: () => undefined }),
        false
      )
      assert.equal(
        canStillWriteTo({ writableEnded: true, on: () => undefined }),
        false
      )
      assert.equal(
        canStillWriteTo({ writable: false, on: () => undefined }),
        false
      )
    })

    it('accepts a live stream', () => {
      assert.equal(
        canStillWriteTo({
          destroyed: false,
          writableEnded: false,
          writable: true,
          on: () => undefined,
        }),
        true
      )
    })
  })

  describe('guardStreamAgainstPeerClose', () => {
    it('swallows a peer-closed error without notifying the owner', () => {
      const stream = new EventEmitter()
      const others = new Array<Error>()
      guardStreamAgainstPeerClose(stream, 'test', error => others.push(error))

      // Would throw if the guard had not attached a listener.
      stream.emit('error', errnoError('write EOF', 'EOF', 'write'))

      assert.deepStrictEqual(others, [])
    })

    it('forwards anything it does not recognize to the owner', () => {
      const stream = new EventEmitter()
      const others = new Array<Error>()
      guardStreamAgainstPeerClose(stream, 'test', error => others.push(error))

      const unexpected = new Error('the disk caught fire')
      stream.emit('error', unexpected)

      assert.deepStrictEqual(others, [unexpected])
    })

    it('still contains the event when no owner callback is supplied', () => {
      const stream = new EventEmitter()
      guardStreamAgainstPeerClose(stream, 'test')

      assert.doesNotThrow(() => stream.emit('error', new Error('unexpected')))
    })
  })
})
