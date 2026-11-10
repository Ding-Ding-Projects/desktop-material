# Captures of a published release run under Linux

These images are **not** Windows captures and are not part of the canonical
screenshot gallery in `docs/assets/screenshots/`. They exist so that features
added without access to a Windows machine still have a picture taken from the
real, published application rather than from a mock-up.

How each one was made:

1. The published `GitHub.Desktop-x64.zip` of the release named in the file
   name was downloaded and unpacked.
2. Three Windows-only native modules (`registry.node`, `fs_admin.node`,
   `desktop-notifications.node`) were replaced by an empty stand-in, the
   credential module by its Linux build, and the bundled Git by a wrapper around
   the system Git. Nothing else in the release was changed.
3. The app was started by the project's own harness, `script/capture-app.js`,
   under Xvfb at 1280 by 800, with a throwaway profile and a small demo
   repository added through the app's own Add local repository dialog.

What this means for reading them:

- Fonts, window chrome and anything that depends on Windows behave as on Linux.
- Features that need the stand-in modules (editor detection, notifications,
  the Windows registry) report errors in this run that they do not report on
  Windows. Captures showing such an error are not kept.
- A capture shows the release in its file name, which can be older than the
  current source.

| File | Release | What it shows |
| --- | --- | --- |
| `v4.0.140801-command-palette.png` | v4.0.140801 | Command palette opened with a repository open |
| `v4.0.140801-extensions.png` | v4.0.140801 | Repository tools, Extensions, before consent |
| `v4.0.140801-local-file-converter.png` | v4.0.140801 | Local file converter with Quick convert and Base64 text |
| `v4.0.140801-sketch-pad.png` | v4.0.140801 | Repository tools, Sketch pad, empty |
| `v4.0.140801-virtual-disk-planner.png` | v4.0.140801 | Virtual disk planner with a create plan |
| `v4.0.141101-minecraft-servers.png` | v4.0.141101 | Minecraft servers with one server added and the EULA step |

## What the runs found

- v4.0.140801: the live chart slider was drawn as a thick block, and the
  pinned shortcut took half of the Repository tools rail. Both fixed in
  `d2fbaf0`.
- v4.0.141101: the web panel card showed a raw error instead of its controls,
  because the credential store cannot be reached in this Linux run and reading
  the Discord webhook from it failed the whole status request. The panel now
  treats an unreadable vault as "no webhook" and keeps working. On Windows the
  vault is Credential Manager; whether the card had the same failure there is
  not known.
- v4.0.141601: the category counts, the statistics line and the fold button
  were present, and the pinned shortcut no longer took half the rail. Two
  things were still wrong: the live chart slider was still a thick block (the
  cause was a text-field rule that Repository tools applies to every input,
  not the height removed earlier), and the unfolded chips stacked one per row
  and left the tool list one visible row. The slider now undoes that rule and
  the chips start folded.
