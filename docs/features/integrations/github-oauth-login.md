# GitHub OAuth login

Desktop Material uses the same GitHub OAuth request shape as the upstream
GitHub Desktop client. The authorization request supplies the registered client
ID, bounded feature scopes, and a state value, but deliberately omits
`redirect_uri`. GitHub then uses the callback registered on that OAuth
application. Sending a custom-scheme callback that is not registered produces
GitHub's `redirect_uri is not associated with this application` error.

## Behaviour and configuration

- The browser authorization URL is built with `URL` and `searchParams`, so the
  client ID, scopes, and state are encoded exactly once.
- The token exchange sends the authorization code, client ID, and client secret
  without adding a second redirect value that could disagree with the
  authorization request.
- The OAuth state remains the correlation value for the in-app callback flow;
  omitting `redirect_uri` does not weaken state validation.
- Enterprise OAuth setup remains separately configurable. Its registered
  callback must match the provider's OAuth application configuration.

## Failure modes and recovery

| Failure | Result and recovery |
| --- | --- |
| GitHub reports an unassociated `redirect_uri` | Update to this upstream-compatible request shape and verify the OAuth application's registered callback; do not invent a second callback URL in the client. |
| Authorization state is missing or does not match | Reject the callback and keep the sign-in attempt pending for a safe retry. |
| Token exchange is refused | Surface the provider response without storing a partial credential; retry the sign-in flow after correcting the OAuth application or requested scopes. |

## Security considerations

The client secret is never rendered or placed in a URL. Authorization state is
single-use and bound to the active sign-in flow. The callback is controlled by
the OAuth application's registration rather than an arbitrary redirect supplied
by the renderer.

## Verification

`app/test/unit/api-test.ts` proves the authorization URL points at GitHub's
authorization endpoint, carries the exact feature scopes and state, and has no
`redirect_uri` query parameter. The production build and hidden-desktop OAuth
acceptance remain external evidence and must be reported separately from this
unit contract.

## Suggested articles

- [Repository-bound GitHub API functions](github-api-functions.md)
- [App-hosted browser](app-hosted-browser.md)
