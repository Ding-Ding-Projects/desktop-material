# Automatic remote URL refresh

Desktop Material repairs a checkout's configured GitHub remote when the
provider reports that the repository was renamed or transferred. The repair is
a preflight for network work, so the first fetch, pull, or push after a transfer
can use the repository's current canonical location without asking the user to
edit `.git/config`.

## Behavior and configuration

The app resolves the repository through its selected account and updates the
exact default remote that produced that match; it does not assume the remote is
named `origin` and does not rewrite unrelated remotes. Canonicalization runs
when a repository is opened and before fetch, pull, push, refspec fetches,
repository-indicator fetches, and scheduled automation.

Transport remains stable. An SSH remote follows the provider's SSH clone URL,
while an HTTP or HTTPS remote follows the web clone URL only when the exact URL
origin (scheme, host, and port) is unchanged. A protocol switch, another host,
an invalid URL, or a hand-authored value that normalization would alter is
refused. This includes web URLs containing embedded credentials.

If the remote has an explicit `pushurl`, Desktop Material migrates it only when
it exactly matches the old fetch URL. A deliberately different write-only
target, deployment mirror, or other split fetch/push configuration is
preserved. If the matching `pushurl` update fails after the fetch URL changed,
the app attempts to restore the old fetch URL so the pair does not remain
silently split.

There is no user setting to enable this repair. Provider metadata and the
existing remote are its complete input. Explicit network actions revalidate on
every run. Successful background checks share in-flight work and use a
five-minute cache keyed by repository identity, checkout path, remote name, and
remote URL; changing the configured remote therefore creates a new key.

## Stale state, failures, and retries

The provider request and local config write are separated by network latency.
Immediately before writing, the updater reads the exact fetch URL directly
from Git and then uses an exact-old-value conditional update under Git's config
lock. A concurrent user or tool edit wins: the stale provider result cannot
overwrite it.

Only non-mutating background discovery is fail-soft. A provider lookup or safe
config repair that cannot be proved stops an explicit fetch and every mutating
pull or push instead of letting a possibly stale destination run. A matching
fetch/push pair is accepted only after both final values are read back; if the
second write or rollback cannot be proved, the result remains `unproven` and
the operation aborts. Desktop Material never guesses a new owner or repository
name. Failed or unproven work is not cached as success, so a later provider
refresh can retry. Successful background discovery may wait up to five minutes
before checking again.

Submodule viewer repositories are not rewritten. A separate explicit
`pushurl` that differs from the old fetch URL is also intentionally outside the
repair boundary and must be maintained by its owner.

## Scheduled non-interactive Git

Scheduled commit/push and pull runs use only credentials already available from
the selected account or credential vault. When none are available, the run
fails and reports a non-blocking notification instead of opening a GitHub,
generic credential, Git Credential Manager, SSH host-key, password, or
passphrase prompt.

Unattended automation also routes commit and pull through a transient empty
`core.hooksPath`, skips push hooks, and disables commit/merge signing so even
non-`--no-verify` hooks or GPG pinentry cannot open their own UI.
Post-push SSH deployments use OpenSSH batch mode and disable AskPass. This
policy applies only to scheduled/app-owned work: a user-initiated commit, pull,
push, or SSH deployment remains interactive and continues to honor the user's
normal hook and signing choices.

Skipping hooks and signatures is a deliberate unattended-safety tradeoff. A
repository that requires local hooks or signed commits should use a reviewed
manual operation or enforce the requirement remotely with branch protection
and required checks.

## Security considerations

- Only the exact matched default remote is eligible for mutation.
- Protocol and authority checks prevent provider metadata from redirecting a
  checkout to a different transport or web origin.
- Concurrent remote edits win; stale provider responses never overwrite them.
- Divergent write targets remain untouched, while only an exact old-URL
  `pushurl` follows the transfer.
- Account selection uses stable repository binding, and credentials are never
  written into remote URLs, logs, or Git configuration.
- Background authentication fails closed without choosing another identity or
  presenting unattended login UI.

## Verification

Unit coverage in
`app/test/unit/stores/updates/update-remote-url-test.ts` exercises HTTPS and SSH
migration, stale snapshots and real concurrent config edits, cross-authority
and scheme refusal, non-`origin` remotes, matching `pushurl` migration, proven
rollback/final state, and preservation of divergent write targets. The
authenticated fetch, pull, push, commit, local batching, and SSH deployment
tests verify propagation of the background boundary, real prepare/post-commit
hook suppression, signing suppression, and batch-mode SSH arguments.

For an integration check, rename or transfer a disposable GitHub repository,
open its existing checkout, and run Fetch. Verify `git remote get-url <name>`
uses the new canonical owner/name, an exact matching `--push` URL moved with it,
and every unrelated or deliberately divergent remote value remained unchanged.
Then remove usable credentials and trigger scheduled automation: it must fail
through notification/history without opening a login or pinentry window.
