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
