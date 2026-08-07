import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert'
import {
  ISignInOAuthCallbackServices,
  ISelfHostedOAuthCallbackServices,
  SignInStore,
  SignInStep,
} from '../../src/lib/stores/sign-in-store'
import { AccountsStore } from '../../src/lib/stores'
import { Account } from '../../src/models/account'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'
import { IAppShellOpenExternalOptions, shell } from '../../src/lib/app-shell'

function createAccountsStore(
  accounts: ReadonlyArray<Account> = []
): AccountsStore {
  const dataStore = new InMemoryStore()
  if (accounts.length > 0) {
    const serialized = accounts.map(a => ({
      login: a.login,
      endpoint: a.endpoint,
      token: a.token,
      emails: a.emails,
      avatarURL: a.avatarURL,
      id: a.id,
      name: a.name,
      plan: a.plan,
    }))
    dataStore.setItem('users', JSON.stringify(serialized))
  }
  return new AccountsStore(dataStore, new AsyncInMemoryStore())
}

function createDotComAccount(login = 'octocat'): Account {
  return new Account(
    login,
    getDotComAPIEndpoint(),
    'test-token',
    [],
    'https://avatars.githubusercontent.com/u/1',
    1,
    login,
    'free'
  )
}

function createEnterpriseAccount(
  login = 'enterprise-user',
  endpoint = 'https://github.example.com/api/v3'
): Account {
  return new Account(login, endpoint, 'ent-token', [], '', 2, login, 'free')
}

describe('SignInStore', () => {
  let accountsStore: AccountsStore
  let signInStore: SignInStore

  beforeEach(() => {
    accountsStore = createAccountsStore()
    signInStore = new SignInStore()
  })

  describe('initial state', () => {
    it('starts with null state', () => {
      assert.equal(signInStore.getState(), null)
    })
  })

  describe('beginDotComSignIn', () => {
    it('transitions to Authentication step when no existing account', async () => {
      signInStore.beginDotComSignIn()
      const state = signInStore.getState()
      assert.notEqual(state, null)
      assert.equal(state?.kind, SignInStep.Authentication)
      if (state?.kind === SignInStep.Authentication) {
        assert.equal(state.endpoint, getDotComAPIEndpoint())
        assert.equal(state.error, null)
        assert.equal(state.loading, false)
      }
    })

    it('allows adding another dotcom account when one exists', async () => {
      const existingAccount = createDotComAccount()
      accountsStore = createAccountsStore()
      signInStore = new SignInStore()

      await accountsStore.addAccount(existingAccount)

      signInStore.beginDotComSignIn()
      const state = signInStore.getState()
      assert.notEqual(state, null)
      assert.equal(state?.kind, SignInStep.Authentication)
    })

    it('calls resultCallback when provided', async () => {
      let callbackCalled = false
      signInStore.beginDotComSignIn(() => {
        callbackCalled = true
      })

      // Reset triggers the callback with 'cancelled'
      signInStore.reset()
      assert.equal(callbackCalled, true)
    })
  })

  describe('beginEnterpriseSignIn', () => {
    it('transitions to EndpointEntry step', () => {
      signInStore.beginEnterpriseSignIn()
      const state = signInStore.getState()
      assert.notEqual(state, null)
      assert.equal(state?.kind, SignInStep.EndpointEntry)
    })

    it('sets initial state correctly', () => {
      signInStore.beginEnterpriseSignIn()
      const state = signInStore.getState()
      if (state?.kind === SignInStep.EndpointEntry) {
        assert.equal(state.error, null)
        assert.equal(state.loading, false)
      }
    })

    it('resets previous state before starting', () => {
      // Start a dotcom sign-in first
      signInStore.beginDotComSignIn()
      assert.equal(signInStore.getState()?.kind, SignInStep.Authentication)

      // Starting enterprise sign-in should replace that state
      signInStore.beginEnterpriseSignIn()
      assert.equal(signInStore.getState()?.kind, SignInStep.EndpointEntry)
    })
  })

  describe('setEndpoint', () => {
    it('transitions to Authentication step for valid enterprise URL', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://github.example.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.Authentication)
    })

    it('redirects to dotcom flow for github.com URLs', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://github.com')

      const state = signInStore.getState()
      // Should redirect to the Authentication step with the dotcom endpoint
      assert.equal(state?.kind, SignInStep.Authentication)
      if (state?.kind === SignInStep.Authentication) {
        assert.equal(state.endpoint, getDotComAPIEndpoint())
      }
    })

    it('redirects to dotcom flow for api.github.com URLs', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://api.github.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.Authentication)
      if (state?.kind === SignInStep.Authentication) {
        assert.equal(state.endpoint, getDotComAPIEndpoint())
      }
    })

    it('sets error for non-HTTPS URL', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('http://github.example.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.EndpointEntry)
      if (state?.kind === SignInStep.EndpointEntry) {
        assert.notEqual(state.error, null)
        assert.equal(state.loading, false)
      }
    })

    it('allows adding another account on an existing enterprise host', async () => {
      const endpoint = 'https://github.example.com/api/v3'
      const existingAccount = createEnterpriseAccount('user', endpoint)
      accountsStore = createAccountsStore()
      signInStore = new SignInStore()

      await accountsStore.addAccount(existingAccount)

      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://github.example.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.Authentication)
    })
  })

  describe('reset', () => {
    it('clears the state back to null', () => {
      signInStore.beginDotComSignIn()
      assert.notEqual(signInStore.getState(), null)

      signInStore.reset()
      assert.equal(signInStore.getState(), null)
    })

    it('calls resultCallback with cancelled', async () => {
      let result: any = null
      signInStore.beginDotComSignIn(r => {
        result = r
      })

      signInStore.reset()
      assert.notEqual(result, null)
      assert.equal(result.kind, 'cancelled')
    })
  })

  describe('authenticateWithBrowser', () => {
    it('classifies the OAuth launch as authentication', async () => {
      let capturedOptions: IAppShellOpenExternalOptions | undefined
      const openExternal = mock.method(
        shell,
        'openExternal',
        async (_path: string, options?: IAppShellOpenExternalOptions) => {
          capturedOptions = options
          return true
        }
      )

      try {
        signInStore.beginDotComSignIn()
        await signInStore.authenticateWithBrowser()

        assert.deepEqual(capturedOptions, { intent: 'authentication' })
      } finally {
        signInStore.reset()
        openExternal.mock.restore()
      }
    })
  })

  describe('resolveOAuthRequest', () => {
    it('rejects a callback with the wrong state without exchanging it', async () => {
      let exchangeCount = 0
      const services: ISignInOAuthCallbackServices = {
        requestOAuthToken: async () => {
          exchangeCount++
          return 'unused'
        },
        fetchUser: async () => createDotComAccount(),
      }
      const callbackStore = new SignInStore(services)
      const openExternal = mock.method(shell, 'openExternal', async () => true)

      try {
        callbackStore.beginDotComSignIn()
        await callbackStore.authenticateWithBrowser()

        const result = await callbackStore.resolveOAuthRequest({
          name: 'oauth',
          code: 'ignored-code',
          state: 'wrong-state',
        })

        assert.equal(result, 'rejected')
        assert.equal(exchangeCount, 0)
        const retainedState = callbackStore.getState()
        assert.equal(retainedState?.kind, SignInStep.Authentication)
        if (retainedState?.kind !== SignInStep.Authentication) {
          throw new Error(
            'Expected the rejected OAuth session to remain active'
          )
        }
        assert.equal(retainedState.loading, true)
      } finally {
        callbackStore.reset()
        openExternal.mock.restore()
      }
    })

    it('retains the sign-in flow with an error when token exchange fails', async () => {
      let fetchCount = 0
      const services: ISignInOAuthCallbackServices = {
        requestOAuthToken: async () => null,
        fetchUser: async () => {
          fetchCount++
          return createDotComAccount()
        },
      }
      const callbackStore = new SignInStore(services)
      const openExternal = mock.method(shell, 'openExternal', async () => true)

      try {
        callbackStore.beginDotComSignIn()
        await callbackStore.authenticateWithBrowser()
        const state = callbackStore.getState()
        if (
          state?.kind !== SignInStep.Authentication ||
          state.oauthState === undefined
        ) {
          throw new Error('Expected an active OAuth session')
        }

        const result = await callbackStore.resolveOAuthRequest({
          name: 'oauth',
          code: 'failed-code',
          state: state.oauthState.state,
        })
        await new Promise<void>(resolve => setImmediate(resolve))

        assert.equal(result, 'failed')
        assert.equal(fetchCount, 0)
        const failedState = callbackStore.getState()
        assert.equal(failedState?.kind, SignInStep.Authentication)
        if (failedState?.kind !== SignInStep.Authentication) {
          throw new Error('Expected the failed OAuth session to remain active')
        }
        assert.equal(failedState.loading, false)
        assert.notEqual(failedState.error, null)
      } finally {
        callbackStore.reset()
        openExternal.mock.restore()
      }
    })

    it('acknowledges success only after token and account validation', async () => {
      const account = createDotComAccount('confirmed-user')
      const services: ISignInOAuthCallbackServices = {
        requestOAuthToken: async () => 'confirmed-token',
        fetchUser: async (_endpoint, token) => {
          assert.equal(token, 'confirmed-token')
          return account
        },
      }
      const callbackStore = new SignInStore(services)
      const openExternal = mock.method(shell, 'openExternal', async () => true)

      try {
        callbackStore.beginDotComSignIn()
        await callbackStore.authenticateWithBrowser()
        const state = callbackStore.getState()
        if (
          state?.kind !== SignInStep.Authentication ||
          state.oauthState === undefined
        ) {
          throw new Error('Expected an active OAuth session')
        }

        const result = await callbackStore.resolveOAuthRequest({
          name: 'oauth',
          code: 'confirmed-code',
          state: state.oauthState.state,
        })

        assert.equal(result, 'succeeded')
        assert.equal(callbackStore.getState()?.kind, SignInStep.Success)
      } finally {
        callbackStore.reset()
        openExternal.mock.restore()
      }
    })
  })

  describe('self-hosted OAuth', () => {
    it('keeps PKCE state in memory and lands a verified account', async () => {
      const services: ISelfHostedOAuthCallbackServices = {
        exchangeCode: async (endpoint, code, verifier) => {
          assert.equal(endpoint, 'https://tenant.example')
          assert.equal(code, 'authorization-code')
          assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/)
          return {
            accessToken: 'a'.repeat(43),
            refreshToken: 'r'.repeat(43),
            expiresIn: 900,
            idToken: null,
          }
        },
        fetchUserInfo: async (endpoint, token) => {
          assert.equal(endpoint, 'https://tenant.example')
          assert.equal(token, 'a'.repeat(43))
          return { sub: 'admin', scope: 'collaboration openid profile' }
        },
      }
      const callbackStore = new SignInStore(undefined, services)
      const authenticated: { current: Account | null } = { current: null }
      callbackStore.onDidAuthenticate(account => {
        authenticated.current = account
      })
      const openExternal = mock.method(shell, 'openExternal', async () => true)

      try {
        callbackStore.beginSelfHostedSignIn('https://tenant.example')
        const state = callbackStore.getState()
        assert.equal(state?.kind, SignInStep.Authentication)
        if (
          state?.kind !== SignInStep.Authentication ||
          state.oauthState === undefined
        ) {
          throw new Error('Expected an active self-hosted OAuth session')
        }
        assert.equal(state.oauthState.kind, 'self-hosted')
        const result = await callbackStore.resolveSelfHostedOAuthRequest({
          name: 'self-hosted-oauth',
          code: 'authorization-code',
          state: state.oauthState.state,
        })
        assert.equal(result, 'succeeded')
        assert.equal(callbackStore.getState()?.kind, SignInStep.Success)
        assert.notEqual(authenticated.current, null)
        assert.equal(authenticated.current?.provider, 'self-hosted')
        assert.equal(authenticated.current?.endpoint, 'https://tenant.example')
        assert.equal(authenticated.current?.login, 'admin')
      } finally {
        callbackStore.reset()
        openExternal.mock.restore()
      }
    })

    it('rejects a stale callback before exchanging its code', async () => {
      let exchangeCount = 0
      const services: ISelfHostedOAuthCallbackServices = {
        exchangeCode: async () => {
          exchangeCount++
          throw new Error('must not run')
        },
        fetchUserInfo: async () => ({
          sub: 'admin',
          scope: 'collaboration openid profile',
        }),
      }
      const callbackStore = new SignInStore(undefined, services)
      const openExternal = mock.method(shell, 'openExternal', async () => true)
      try {
        callbackStore.beginSelfHostedSignIn('https://tenant.example')
        const result = await callbackStore.resolveSelfHostedOAuthRequest({
          name: 'self-hosted-oauth',
          code: 'ignored',
          state: 'wrong-state',
        })
        assert.equal(result, 'rejected')
        assert.equal(exchangeCount, 0)
      } finally {
        callbackStore.reset()
        openExternal.mock.restore()
      }
    })
  })

  describe('successful authentication cleanup', () => {
    it('releases the completed callback before a later reset', async () => {
      const results = new Array<string>()
      const openExternal = mock.method(shell, 'openExternal', async () => true)

      try {
        signInStore.beginDotComSignIn(result => results.push(result.kind))
        await signInStore.authenticateWithBrowser()

        const state = signInStore.getState()
        if (
          state?.kind !== SignInStep.Authentication ||
          state.oauthState === undefined
        ) {
          throw new Error('Expected an active OAuth session')
        }

        state.oauthState.onAuthCompleted(createDotComAccount())
        await new Promise<void>(resolve => setImmediate(resolve))

        assert.equal(signInStore.getState()?.kind, SignInStep.Success)
        signInStore.reset()
        assert.deepEqual(results, ['success'])
      } finally {
        openExternal.mock.restore()
      }
    })

    it('does not overwrite a replacement flow started by the callback', async () => {
      const firstResults = new Array<string>()
      const replacementResults = new Array<string>()
      const openExternal = mock.method(shell, 'openExternal', async () => true)

      try {
        signInStore.beginDotComSignIn(result => {
          firstResults.push(result.kind)
          if (result.kind === 'success') {
            signInStore.beginEnterpriseSignIn(replacementResult =>
              replacementResults.push(replacementResult.kind)
            )
          }
        })
        await signInStore.authenticateWithBrowser()

        const state = signInStore.getState()
        if (
          state?.kind !== SignInStep.Authentication ||
          state.oauthState === undefined
        ) {
          throw new Error('Expected an active OAuth session')
        }

        state.oauthState.onAuthCompleted(createDotComAccount())
        await new Promise<void>(resolve => setImmediate(resolve))

        assert.deepEqual(firstResults, ['success'])
        assert.equal(signInStore.getState()?.kind, SignInStep.EndpointEntry)
        signInStore.reset()
        assert.deepEqual(replacementResults, ['cancelled'])
      } finally {
        openExternal.mock.restore()
      }
    })
  })

  describe('onDidUpdate', () => {
    it('emits updates when state changes', async () => {
      const states: Array<any> = []
      signInStore.onDidUpdate(state => {
        states.push(state)
      })

      signInStore.beginDotComSignIn()
      assert.equal(states.length, 1)
      assert.equal(states[0]?.kind, SignInStep.Authentication)
    })

    it('emits null when reset', () => {
      const states: Array<any> = []
      signInStore.onDidUpdate(state => {
        states.push(state)
      })

      signInStore.beginDotComSignIn()
      signInStore.reset()

      // Should have: cancelled callback + null state + possibly more
      const lastState = states[states.length - 1]
      assert.equal(lastState, null)
    })
  })
})
