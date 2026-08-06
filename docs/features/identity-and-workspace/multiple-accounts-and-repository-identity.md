# Multiple accounts and repository identity

Desktop Material can retain multiple GitHub.com identities, multiple accounts
on one Enterprise host, and GitLab or Bitbucket identities. Account metadata is
stored separately from credentials; tokens remain in the operating-system
credential vault.

Repository Settings exposes an exact account binding for provider operations
such as fetch, push, pull requests, issues, Actions, and Releases. The Git tab
independently chooses global or repository-local `user.name` and `user.email`,
so authentication identity and commit authorship are explicit instead of being
silently coupled.

## Organization Git operations

HTTPS Git operations carry the repository's stable `endpoint#id` account key
through normal and scheduled fetch, pull, push, post-push refresh, refspec
fetch, and remote-HEAD discovery. The key selects a credential-vault identity;
it is never a token, command-line argument, or environment variable. This
keeps a personal GitHub.com account from being selected merely because it was
signed in before the organization-authorized account.

Background remote-HEAD lookup first validates the local symbolic ref and reuses
it only when it points below `refs/remotes/<remote>/` and its target exists.
That avoids an online `git remote set-head -a` scan during every scheduled
refresh, which can otherwise scale with the server's complete ref inventory. A
missing, empty, malformed, dangling, or other-remote background ref performs
exactly one discovery with the same selected account. A user-initiated fetch
always refreshes the default with a five-second hard bound, so a generic host's
rename is detected even while the old branch still exists.

An explicit binding is authoritative. If that account is no longer available,
the operation fails with account recovery rather than silently using another
same-host account. For a legacy unbound repository, Desktop Material checks
same-origin signed-in identities against the remote and prefers an account with
push or admin permission before a read-only account. A successful lookup is
then saved as the repository binding, so subsequent operations remain stable.

Changing the binding refreshes repository metadata and permissions under the
new identity. Saving an unrelated repository setting does not accidentally
bind the first same-host account. SAML reauthorization recognizes GitHub's
supported organization-quote formats, including repository-not-found ambiguity
when GitHub intentionally hides a private organization repository.

When a saved binding is missing, stale, lacks permission, or needs organization
SSO, the operation stops with the appropriate account-management or sign-in
recovery. A unique valid account may be suggested; ambiguous same-host matches
require a labelled user choice and never replace a still-valid binding.

The accounts store caps and validates persisted metadata, de-duplicates stable
account keys, and never writes tokens to its metadata file or application log.
Repository bindings use stable account keys rather than array positions.

Sign-in persistence is concurrency-safe. The periodic account refresh re-reads
the account list after its API calls return instead of writing back the
snapshot it started with, so an account signed in while a refresh is running is
never erased and a token re-authorized for wider scopes (for example the
package-registry grant) is never rolled back to the narrower one. Saving
metadata merges with the shared saved list rather than overwriting it, so a
window holding a stale snapshot cannot sign out an account another window
added; identities this store signed out, or rewrote through the Enterprise
endpoint migration, are recorded so the merge neither resurrects nor duplicates
them. That endpoint migration also moves the token to the new endpoint key,
because credentials are addressed by endpoint.

## Active account switching

The navigation rail avatar opens the account switcher. Choosing any signed-in
account makes it the active identity used by the rail indicator and the
positional account fallbacks, including when the chosen account is on GitHub
Enterprise and another GitHub.com account is also signed in. The selected
account remains first in the in-memory and persisted account order; the other
accounts retain the normal GitHub.com-before-Enterprise grouping within their
remaining positions. Reopening the switcher therefore shows the same account as
active after the app has saved or reloaded its metadata.

Choosing the already-active row only closes the switcher. Choosing another row
closes it and promotes the stable `endpoint#id` identity without changing its
credential. Tokens remain exclusively in the operating-system credential vault.
If the account cannot be found in the current signed-in list, promotion is a
no-op and the existing active identity is preserved.

Credential failures are surfaced, never swallowed. An account whose token
cannot be written is not added and the failure names the login. An account
whose stored token is missing or unreadable at startup is reported as needing a
new sign-in instead of being loaded with an empty token — the state that
previously made the app look signed in while every API call failed and the
sign-in prompt kept returning — and its saved metadata is preserved so a
transient credential-store failure does not permanently sign the account out.
A re-authorization that arrives under a renamed login clears the superseded
credential entry rather than leaving a live token behind.

## Invalidated tokens on a shared host

The GitHub API client raises an invalidated-token signal when a request returns
`401` with the `X-GitHub-Request-Id` header and no two-factor challenge. The
signal carries the endpoint and the exact token the failing request was made
with; it carries no login or account id, because the API client is constructed
from an endpoint and a credential.

The token is the identity. Several accounts can be signed in on one host, so
the endpoint alone does not say whose credential died — resolving by endpoint
position picks whichever account sorts first, which used to mean an invalidated
token belonging to any other account signed nobody out at all and the app kept
using the dead credential and re-prompting. `getAccountForEndpointAndToken`
matches the signed-in account on that endpoint whose stored credential is the
failing one, so exactly that account is signed out and every other account on
the host stays signed in. The comparison uses the in-memory account list, which
already carries each token rehydrated from the credential vault, so no extra
vault read is needed.

When no signed-in account on the endpoint holds the token any more, nobody is
signed out. That is the correct outcome for a credential already replaced by a
re-authorization or belonging to an account that is already signed out; acting
on a stale token would sign out a healthy account. The case is logged as a
warning.

The sign-out notice names the affected login and host, states whether other
accounts on the same host are still signed in, and offers to repeat that
sign-in. It is available in English, Hong Kong Cantonese, and bilingual mode
(`accounts.invalidatedToken*`) and stays plain and factual at every funny
level, as authentication errors must.

The main-process same-origin filter keeps the initial origin only for the life
of one Electron request. It deletes the record on completion and on
failure/cancellation, so repeated failed requests cannot retain origin entries
for the app lifetime. Redirected requests still lose authorization-like
headers whenever their current origin differs from the initial origin.

Verification includes `accounts-store-test.ts`,
`accounts-store-persistence-test.ts`,
`get-account-for-repository-test.ts`, `repositories-store-test.ts`,
`push-authenticated-git-test.ts`, `pull-authenticated-git-test.ts`,
`fetch-authenticated-git-test.ts`,
`organization-repository-auth-wiring-test.ts`,
`saml-reauth-error-test.ts`, `same-origin-filter-test.ts`, and the
provider-triage UI/store suites.
