# Windows startup repair verification, October 11, 2026

The corrected v4.0.133501 package reaches the local empty workspace without the reported native argument-parser startup exception. This is isolated-profile package acceptance. Installed and existing-profile acceptance remain incomplete.

![Desktop Material 4.0.133501 empty workspace in an isolated local profile](../assets/screenshots/startup-repair-4.0.133501-empty-workspace-20261011.png)

## Exact evidence scope

- Source: 1ef2e137353ea431082d7bbd2026ad14be16f561.
- Squirrel full package SHA-256: deeff825f46f26a70a90c13250af6f39b07753e1fdbaaf86d18e316e2a8cd13c.
- Raw/promoted capture SHA-256: 781b95e452ad1edadd7b50b5c47b283222da8aebcb19c22ab375a5b7fcf8f634. The promoted PNG is byte-identical to the inspected raw capture.
- Capture completed: 2026-10-11T07:10:10.912Z (UTC).
- PNG dimensions: 1200 by 700. The observed CSS viewport is 1247 by 728 with device pixel ratio 0.9620000808040317. The requested device emulation was 1200 by 700 at scale 1; those requested values are not relabelled as the actual CSS tuple or native display scale.
- English, light theme, local isolated profile, no accounts or repositories shown. All three empty-workspace actions were enabled.
- The application was launched on a named hidden desktop through the cheap native route. Native identity, loopback ownership and the unique intended page were verified; no visible desktop, cursor or foreground application was used.
- Prospective CDP observation for the capture interval reported zero console errors, unhandled exceptions and page errors. This does not cover historical startup logs.
- The owned instance exited normally. Its process tree and hidden desktop are absent, original protocol associations were restored byte-for-byte, and global Git configuration matches the saved baseline.

## Separate argument workflows

The corrected package also accepted a second-instance path containing spaces and Cantonese characters. Protocol arguments reached the exact reviewed clone URL through a hidden second instance; cancellation did not clone. The real custom-editor menu action produced exactly eight expected child arguments, including the target path, an empty value, spaces, Unicode, escaped quotation marks, backslashes and a tab separator. The operating-system shell association invocation did not reach that form and remains unverified. These workflow receipts are retained privately, separately from this empty-workspace image.

## Remaining acceptance

This record does not establish corrected installed startup, existing-profile retention, updater lifecycle, every feature workflow, complete layout/design parity, or refreshed captures across every presentation surface. The corresponding roadmap work remains open.
