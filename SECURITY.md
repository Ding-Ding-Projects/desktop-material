# Security Policy

Desktop Material is an independent Material Design 3 remake of GitHub Desktop,
maintained in [`Ding-Ding-Projects/desktop-material`](https://github.com/Ding-Ding-Projects/desktop-material).
It is **not** owned, operated, or supported by GitHub, Inc., and it is not in
scope for the GitHub Bug Bounty Program. Reports sent to GitHub about this
repository will not reach the people who maintain it.

## Reporting a vulnerability

Report privately through this repository's own GitHub private vulnerability
reporting form:

**<https://github.com/Ding-Ding-Projects/desktop-material/security/advisories/new>**

Private vulnerability reporting is enabled on this repository, so the form is
open to anyone with a GitHub account. It is the only security reporting channel
this project has: there is no security email address, no PGP key, and no bounty
programme. If you cannot use the form, say so in a normal issue **without
including the vulnerability details**, and a maintainer will follow up privately.

**Please do not report security vulnerabilities through public issues,
discussions, or pull requests.** A public report tells everyone else how to
exploit the problem before a fix exists.

## What to include

The more of this a report carries, the faster it can be reproduced:

- what an attacker can achieve, and what they need in order to do it
- the affected version — the release tag, or the commit SHA if you built from
  source
- your operating system and architecture
- step-by-step reproduction, ideally from a fresh profile
- any proof-of-concept, log excerpt, or screenshot — with your own tokens,
  credentials, repository contents, and other private data removed

## What to expect

Your report will be acknowledged on the advisory thread. This project is
maintained on a best-effort basis and **does not promise a response time, a fix
deadline, or a disclosure window** — no such commitment has been made, so none
is stated here. Progress, decisions, and any fix are recorded on the advisory
thread you reported through, and the fix ships in a normal release with the
changelog entry describing what changed.

## Scope

This policy covers the code in this repository: the Electron desktop
application, the build and release scripts, and the documentation site.

Desktop Material's codebase originated as a fork of
[`desktop/desktop`](https://github.com/desktop/desktop) (MIT). A vulnerability
that exists in upstream GitHub Desktop as well should also be reported to
[upstream's own security policy](https://github.com/desktop/desktop/security/policy),
because a fix here does not fix it for GitHub Desktop users.

Third-party dependencies are handled upstream. Report those to the dependency's
own maintainers; open an issue here if this project needs to pin, patch, or drop
the affected version.
