import './profile-history-test-env'

import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { describe, it, TestContext } from 'node:test'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { ChatSessionsStore } from '../../src/lib/stores/chat-sessions-store'
import { DedicatedSettingFileName } from '../../src/lib/stores/dedicated-setting-store'
import {
  createChatSessionDocument,
  IChatSessionDocument,
  MaxChatSessionMessages,
  normalizeChatSessionDocument,
} from '../../src/models/chat-session'
import { createTempDirectory } from '../helpers/temp'

async function createStore(t: TestContext) {
  const root = join(await createTempDirectory(t), 'chats')
  const store = new ChatSessionsStore()
  await store.initialize(root)
  return { root, store }
}

async function readSession(
  root: string,
  id: string
): Promise<IChatSessionDocument> {
  return JSON.parse(
    await readFile(join(root, id, DedicatedSettingFileName), 'utf8')
  ) as IChatSessionDocument
}

describe('ChatSessionsStore', () => {
  it('creates independent Git repositories and rediscovers their summaries', async t => {
    const { root, store } = await createStore(t)
    const alpha = await store.create({ model: 'llama3', title: 'Alpha' })
    const beta = await store.create({ model: 'gemma3', title: 'Beta' })

    await store.appendMessage(alpha.getState().session.id, {
      role: 'user',
      content: 'one',
    })
    await store.appendMessage(beta.getState().session.id, {
      role: 'user',
      content: 'two',
    })

    for (const id of [
      alpha.getState().session.id,
      beta.getState().session.id,
    ]) {
      assert.equal((await stat(join(root, id, '.git'))).isDirectory(), true)
    }

    const reopened = new ChatSessionsStore()
    await reopened.initialize(root)
    const summaries = await reopened.list()
    assert.equal(summaries.length, 2)
    assert.deepEqual(
      new Set(summaries.map(summary => summary.title)),
      new Set(['Alpha', 'Beta'])
    )
  })

  it('commits messages, bounded images, appearance, and fonts', async t => {
    const { root, store } = await createStore(t)
    const session = await store.create({ model: 'vision/llava:latest' })
    const id = session.getState().session.id

    await store.appendMessage(id, {
      role: 'user',
      content: 'what is this?',
      images: [{ mediaType: 'image/png', data: 'iVBORw0KGgo=' }],
    })
    await Promise.all([
      store.setAccentPalette(id, 'rose'),
      store.setSurfacePalette(id, 'neutral'),
      store.setFontStyle(id, 'messageStyle', {
        fontFamily: 'Consolas',
        fontSize: 18,
        bold: true,
      }),
      store.setFontStyle(id, 'inputStyle', { fontSize: 15 }),
    ])

    const document = await readSession(root, id)
    assert.equal(document.model, 'vision/llava:latest')
    assert.equal(document.messages[0].images?.[0].mediaType, 'image/png')
    assert.equal(document.appearance.accentPalette, 'rose')
    assert.equal(document.appearance.surfacePalette, 'neutral')
    assert.equal(document.fontSettings.messageStyle?.fontSize, 18)

    const history = await session.getHistory()
    assert.equal(history.total, 6)
    assert.equal(history.canUndo, true)
  })

  it('undoes, redoes, and restores without rewriting history', async t => {
    const { store } = await createStore(t)
    const session = await store.create()
    const id = session.getState().session.id
    await store.appendMessage(id, { role: 'user', content: 'one' })
    const oneMessageSha = (await session.getHistory()).entries[0].sha
    await store.appendMessage(id, { role: 'assistant', content: 'two' })

    await store.undo(id)
    assert.deepEqual(
      (await session.get()).messages.map(message => message.content),
      ['one']
    )
    await store.redo(id)
    assert.deepEqual(
      (await session.get()).messages.map(message => message.content),
      ['one', 'two']
    )
    await store.restoreTo(id, oneMessageSha)
    assert.deepEqual(
      (await session.get()).messages.map(message => message.content),
      ['one']
    )
    assert.ok((await session.getHistory()).total >= 5)
  })

  it('rejects malformed image data before it reaches disk', async t => {
    const { store } = await createStore(t)
    const session = await store.create()

    await assert.rejects(
      () =>
        store.appendMessage(session.getState().session.id, {
          role: 'user',
          content: 'unsafe',
          images: [
            {
              mediaType: 'image/png',
              data: 'not base64 or an image URL',
            },
          ],
        }),
      /Invalid chat message/
    )
    assert.deepEqual((await session.get()).messages, [])

    await assert.rejects(
      () =>
        store.appendMessage(session.getState().session.id, {
          role: 'user',
          content: 'spoofed',
          images: [
            {
              mediaType: 'image/png',
              data: Buffer.from('<svg></svg>').toString('base64'),
            },
          ],
        }),
      /Invalid chat message/
    )
  })

  it('does not create a repository while loading an unknown session id', async t => {
    const { root, store } = await createStore(t)
    const missingId = randomUUID()

    await assert.rejects(() => store.getSession(missingId), /does not exist/)
    await assert.rejects(() => stat(join(root, missingId)), {
      code: 'ENOENT',
    })
  })

  it('retains system context and evicts whole oldest turns at the cap', () => {
    const seed = createChatSessionDocument({ id: randomUUID(), now: 1 })
    const messages = [
      {
        id: randomUUID(),
        role: 'system' as const,
        content: 'system context',
        createdAt: 1,
      },
      ...Array.from({ length: 128 }, (_, index) => [
        {
          id: randomUUID(),
          role: 'user' as const,
          content: `user ${index}`,
          createdAt: index + 2,
        },
        {
          id: randomUUID(),
          role: 'assistant' as const,
          content: `assistant ${index}`,
          createdAt: index + 2,
        },
      ]).flat(),
    ]
    const normalized = normalizeChatSessionDocument({ ...seed, messages })

    assert.ok(normalized.messages.length <= MaxChatSessionMessages)
    assert.equal(normalized.messages[0].role, 'system')
    assert.equal(normalized.messages[1].role, 'user')
    assert.equal(normalized.messages.at(-1)?.content, 'assistant 127')
  })
})
