# Opt-in post-clone runner provisioning

Desktop Material can create a repository-scoped GitHub Actions self-hosted
runner immediately after an interactive clone succeeds. The choice is **off by
default**, applies to one selected private GitHub or GitHub Enterprise
repository, and never applies to multi-clone queues or background automatic
cloning.

## Behavior

1. Select one private repository in **Clone repositories**.
2. Expand **Runner provisioning** and opt in.
3. Confirm that the repository's workflow authors are trusted.
4. Choose **Windows** or **Linux via WSL**, then clone.

The app completes the Git clone and registers/selects the repository before it
starts provisioning. Windows uses a current-user background runner. Linux via
WSL automatically creates a dedicated WSL2 distribution from the first
installed distribution, bootstraps its supported dependencies, and starts its
own background runner. No elevated prompt is requested by this workflow.

The runner is persistent until removed from the repository's **Actions** tab.
It is repository-scoped, carries the fixed `self-hosted`, `desktop-material`,
and platform label, and does not configure background clones to make runners.
Before a stopped runner is restarted, Desktop Material rechecks that its
repository is still private. If a running repository becomes public later,
remove its runner immediately from the Actions tab; a background runner cannot
retroactively revoke work it is already eligible to receive.

## Security boundary

Self-hosted runners execute repository workflow code as the current Windows
user. For that reason the clone flow does not offer this feature for public
repositories, and GitHub repository visibility is checked again by the main
process before any runner files, WSL distribution, package download, or runner
registration are created. Fork and pull-request workflow policy remains the
repository owner's responsibility; only trusted workflow authors should be
allowed to target the runner.

The renderer does not receive or store a registration token. The main process
uses the selected account to request a short-lived token, passes it only to the
runner configuration process, and keeps it out of runner state and UI progress.
Runner archives are downloaded from the GitHub Actions release, size-bounded,
and checked against the published SHA-256 digest before extraction. The existing
runner manager also constrains identifiers, derives managed paths internally,
uses hidden non-shell processes, and bounds command output and timeouts.

## Prerequisites and recovery

- The selected account must be authorized to manage Actions runners for the
  private repository.
- Windows setup needs Git; the manager can install it for the current user when
  absent.
- Linux setup needs an installed Debian/Ubuntu-compatible WSL distribution with
  network access. The app derives a dedicated runner distribution from it.
- The runner manager accepts only a Windows desktop host. A non-Windows host,
  an unavailable WSL distribution, failed dependency bootstrap, failed archive
  verification, or refused GitHub registration leaves the clone intact and
  reports a recoverable error.

If provisioning fails, Desktop Material never rolls the clone back. Open the
repository's **Actions** tab to review managed runners and retry setup. Remove
the runner there when it is no longer needed; removing a dedicated WSL runner
also removes its dedicated distribution after GitHub deregistration.

## Verification

Focused clone-option and clone-dialog contract tests cover the default-off
intent, lack of a token field, trust acknowledgement, public-repository block,
canonical-remote recheck, and failure boundary. The main-process runner manager
rechecks repository privacy before provisioning. A full live check still needs
an authorized private repository and a real Windows or WSL runner target; it is
not implied by source or unit-test results.

## Related articles

- [Clone queue settings](clone-queue-settings.md) — background clone policy,
  deliberately excluded from runner provisioning.
- [Local Actions runner](../integrations/local-actions-runner.md) — local `act`
  execution, distinct from a registered GitHub Actions runner.
