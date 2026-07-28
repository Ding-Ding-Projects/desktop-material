---
name: verify-linux-tui-headless
description: Build and verify Desktop Material's Linux TUI through Lowlevel computer-use in an ephemeral WSL Linux environment, a real Xvfb display, and a real terminal. Use for Linux TUI milestone captures, mouse and text-field acceptance, responsive terminal checks, and screenshot refreshes.
---

# Verify Linux TUI Headlessly

Goal: exercise the packaged TUI with real Linux terminal input without touching the
user's visible desktop.

Parameters:

- `repository_path` — Windows checkout path; resolve its Linux path at run time.
- `fixture_repository` — disposable Git fixture created below `/tmp`.
- `display` — unused X display number selected at run time, normally 97–199.
- `capture_directory` — repository-relative milestone screenshot directory.
- `distro_source` — installed WSL distro to clone; default `Debian`.

Replay these steps in order with Lowlevel MCP. Read every returned `ok`.

1. Read the milestone run manifest and record the expected build, interactions,
   captures, and cleanup targets.
2. Call `wsl_status {}` and `wsl_list_distros {}`. Select the named source only
   from the returned inventory.
3. Call `wsl_create_temp { "clone_from": "{distro_source}" }`. Retain the exact
   returned distro name; never derive or hard-code it.
4. Call `wsl_run` on that exact distro to:
   - install Python, Git, Xvfb, xterm, xdotool, wmctrl, ImageMagick, and fonts;
   - install the repository's vendored Lowlevel package in a temporary venv;
   - install the built Desktop Material TUI wheel in a separate temporary venv;
   - create a deterministic disposable Git fixture below `/tmp`.
5. Through `wsl_run`, invoke `lowlevel-computer-use-cheap linux_status`; require
   Xvfb, xdotool, wmctrl, and ImageMagick before continuing.
6. Through `wsl_run`, invoke `lowlevel-computer-use-cheap
   create_virtual_display` with the selected display and fixed capture size.
   Add this display to the cleanup ledger immediately.
7. Through `wsl_run`, invoke `lowlevel-computer-use-cheap
   launch_on_virtual_display` to launch:
   `xterm -xrm 'XTerm.vt100.allowSendEvents: true' -geometry 150x46
   -e desktop-material-tui {fixture_repository}`.
8. Look before input:
   - invoke `list_virtual_display_windows` through the cheap client;
   - choose the current xterm X11 handle from the returned inventory;
   - invoke `screenshot_virtual_display` into the capture directory;
   - inspect the PNG and derive click positions from the current window geometry
     and rendered controls.
9. Drive the real window in the background using the runtime handle and display:
   - click the Changes commit-summary Input, type a unique summary;
   - click the multiline commit-body TextArea, type two lines;
   - click at least two main tabs and one clickable action;
   - open the regex builder, type a pattern and sample, and verify matches;
   - resize the xterm to narrow and wide dimensions using `resize_window`;
   - use mouse scrolling on Settings and click a lower text field or button.
   Prefer background `mouse_click`, `type_text`, and `win_send_keys`. If xterm
   rejects XSendEvent despite `allowSendEvents`, focus only the Xvfb window and
   continue inside the invisible display.
10. After every interaction group, invoke `screenshot_virtual_display`, inspect
    the result, and record what visibly changed. Never present a mockup as proof.
11. Send `ctrl+q` to the runtime handle and verify the TUI exits cleanly.
12. Cleanup even after failure:
    - invoke `stop_virtual_display` through the cheap client;
    - call `wsl_destroy` with the exact temporary distro name;
    - verify with `wsl_list_temp` that the owned distro is absent;
    - update the manifest cleanup ledger.

Never place credentials, tokens, or passwords in a command, screenshot, fixture,
or log. Do not use an existing user repository as the mutation fixture.
