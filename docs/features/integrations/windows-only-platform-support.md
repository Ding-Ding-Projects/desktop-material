# Windows-only graphical edition support

Desktop Material's graphical Electron edition is a Windows application.
Windows is its only supported runtime, packaging target, installer target, and
end-to-end acceptance environment. Source inherited from upstream may still
contain non-Windows adapters, but those paths are compatibility history rather
than supported graphical product surfaces.

The [Linux-first terminal edition](../linux-tui/README.md) is a separate
Python/Textual product surface with its own packages, CI, interaction model, and
acceptance record. It does not change the Electron boundary or make inherited
macOS/Linux Electron adapters supported.

## Behavior and configuration

- CI builds Windows x64 and Windows arm64 and runs the full unit suite on
  Windows x64.
- Packaged end-to-end smoke testing installs and exercises Windows x64.
- Local packaging and automated releases produce the Windows x64 portable ZIP,
  Squirrel feed, EXE, and MSI.
- WSL, UNC shares, mapped drives, Windows editor registration, and Windows
  shell behavior remain first-class integrations.

There is no macOS or Linux mode to enable in the Electron binary. Non-Windows
runners may host platform-neutral automation and the distinct Linux TUI lane;
neither expands graphical application support.

## Failure modes and recovery

A non-Windows host receives no graphical Desktop Material installer. Use a
supported Windows system or Windows virtual machine for Electron. Linux users
may install the separate terminal edition, whose own package and headless
interaction failures are release blockers for that edition only.

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
