# SSH working copies and remote clone

Repository Settings → Remote includes an SSH Working Copy manager for a
canonical checkout on a chosen host. After saving and testing non-secret host
metadata, a user can clone the repository, inspect status, fetch, pull
fast-forward-only, push, or explicitly deploy Docker Compose. The paired remote
site can list redacted saved hosts and request a clone when the connected agent
advertises both SSH commands.

## Behavior and configuration

A saved definition contains a display label, hostname or OpenSSH config alias,
optional user and port, optional absolute identity-file reference, remote POSIX
destination, source remote name, and optional deploy-after-push choice. Clone
and deploy accept only a current source remote whose resolved URL has no
embedded credentials. Clone refuses an existing destination and can select one
validated branch.

Status and network actions run through the configured OpenSSH client. Automatic
or manual deployment verifies the checked-out branch and source URL, fetches
that one branch, refuses checkout-only commits outside the fetched branch,
fast-forwards to the exact fetched head, and only then runs
`docker compose up --detach --build`. It never resets or force-checks out the
host.

The agent exposes `list-ssh-hosts` and `clone-to-ssh` to authorized clients.
The list contains only a bounded ID, label, address, and availability flag.
Clone re-resolves the selected definition from repositories available to the
active profile, then accepts a credential-free Git URL, an absolute or `~/`
POSIX destination, and an optional branch. The remote site cannot create or
edit host definitions.

## Persistence

Up to 16 versioned definitions are stored in local UI storage under a SHA-256
key derived from the local repository path. The document is capped at 32 KiB,
rejects unknown fields and duplicate IDs, and fails closed if malformed.
Removing a definition deletes only this metadata.

Passwords and key passphrases are absent from the document. When a user chooses
to remember authentication, Desktop Material's askpass trampoline stores it in
the operating-system credential vault under a scope derived from user, host,
and effective port. The source URL is resolved only for the operation and is
not saved with the host.

## Failure modes and recovery

Invalid host, port, user, identity path, source URL, branch, or destination
input is rejected before OpenSSH starts. Unavailable and duplicate saved-host
IDs are not exposed to remote clients. Connection and status actions time out
after 30 seconds, ordinary clone/fetch/pull/push actions after 180 seconds, and
deploy after 600 seconds; the in-app manager can cancel its owned operation.

Clone reports an occupied destination instead of overwriting it. Pull rejects
non-fast-forward work. Deployment refuses branch or source mismatches and a
remote checkout containing commits outside the fetched branch. Fix the saved
metadata or host state, test the connection again, and retry the explicit
action; no failed operation silently resets the remote checkout.

## Security considerations

OpenSSH receives dynamic connection values as argv with `shell: false`.
Dynamic remote-command values are validated and POSIX-quoted. Agent forwarding,
connection multiplexing, and forwarding rules are disabled; host-key policy
remains with the user's OpenSSH configuration and `known_hosts`. The remote
host must authenticate to the Git source itself because Desktop Material does
not forward the local SSH agent.

Source URLs reject local/file paths, leading options, unsupported schemes,
embedded credentials, query strings, and fragments. Output is bounded and
redacts private keys, credential-bearing URLs, bearer tokens, passwords,
passphrases, and common token forms before display or agent delivery. Remote
host listing never returns the SSH user, identity-file path, saved destination,
source remote, deployment setting, password, passphrase, or key.

## Verification

`ssh-working-copy-test.ts` covers strict metadata persistence, endpoint-scoped
credential keys, path/URL/branch validation, quoted commands, forwarding
controls, redaction, timeouts, cancellation, cloning, and fast-forward-only
deployment. `ssh-working-copy-test.tsx` covers the Repository Settings manager,
credential-free source selection, action progress, cancellation, and metadata
removal. `agent-command-executor-test.ts` and `agent-commands-test.ts` verify
bounded redacted discovery, duplicate-ID omission, advertised schemas, saved
host resolution, clone routing, branch forwarding, and failure redaction.
