# Windows-only product support

Desktop Material is a Windows-only application. Windows is its only supported
runtime, build, packaging, installer, release, and end-to-end acceptance
environment. Source inherited from upstream may still contain non-Windows
adapters, but those paths are compatibility history rather than supported
product surfaces.

The retained [Linux TUI prototype](../linux-tui/README.md), its Python/Textual
source, package/CI notes, parity ledger, and five Xvfb captures preserve a
July 27 experiment for historical audit. It is not a supported product edition
or release target. Its package, compatibility, or acceptance gaps do not block
the Windows application.

## Behavior and configuration

- CI builds Windows x64 and Windows arm64 and runs the full unit suite on
  Windows x64.
- Packaged end-to-end smoke testing installs and exercises Windows x64.
- Local packaging and automated releases produce the Windows x64 portable ZIP,
  Squirrel feed, EXE, and MSI.
- WSL, UNC shares, mapped drives, Windows editor registration, and Windows
  shell behavior remain first-class integrations.

There is no macOS or Linux product mode to enable. Non-Windows runners may host
platform-neutral automation; that does not expand application support.

## Failure modes and recovery

A non-Windows host receives no supported Desktop Material installer or package.
Use a supported Windows system or Windows virtual machine. The archived TUI
instructions remain reproducibility notes for their dated receipt, not a
current installation recommendation.

## Security considerations

Keeping one runtime boundary reduces signing, installer, credential-store, and
shell-launch ambiguity. Windows packages still require the existing digest,
safe argument, credential, and reviewed release checks. The policy does not
permit Windows-only code to bypass those controls.

## Verification

The tracked CI safety test rejects macOS runners and Apple signing inputs in the
application workflow, requires Windows 2022 x64/arm64 build targets, and keeps
the packaged Windows x64 E2E lane. The installer workflow validates the exact
current `main` SHA and publishes only non-empty Windows release assets—including
the portable x64 ZIP—after CI succeeds. Focused ZIP/workflow checks pass; the
full local package and remote publication proof for this addition remain
pending.
