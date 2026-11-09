# Motion and polish design pass (November 9, 2026)

This folder is the checked-in record of the motion and polish design canvas.
Open any `.dc.html` file beside `support.js` in a browser to see the artboard,
or read `canvas.json` for the layout. `frames/` holds renders of every artboard
at 1280 px and 390 px wide, taken locally from these exact files.

This is a design. Nothing here is implemented, verified or shipped behaviour
until the matching application change lands with its own tests and captures.

## Scope

The owner asked for the generic-looking surfaces to be polished, for motion
and transitions everywhere, and for every missing required feature. The
interface shell stays as it is (see `AGENTS.md`): the work is additive and
dresses controls and surfaces, never the pane layout or navigation.

| Artboard | What it specifies |
| --- | --- |
| `Main.dc.html` | The motion system: duration and spring tokens, Full / Calm / Reduced levels, dialog enter, list insert, tab switch, toast, chip select, progress, and the reduced-motion rules per surface. |
| `Workspace.dc.html` | The 49 still-generic stylesheets: floating-label filter field, collapsible filter chips with counts and a statistics bar, animated checkboxes, per-control info button, history rows. |
| `Popovers.dc.html` | Branch popover with staggered rows, context menu with working shortcuts, inline error banner, two-key super confirmation (type the name, then hold). |
| `Extensions.dc.html` | Extension manager: search with regex, filter tabs, built-in extensions, permission consent sheet, manifest preview. |
| `LiveCharts.dc.html` | Live charts: easing line, pulsing live dot, value badge, mouse and keyboard scrubbing, screen-reader summary, loading / paused / empty / stale states. |
| `Toolbox.dc.html` | Base64 toolkit (standard, URL-safe, MIME, padding, strict decoding with offsets, drop-to-encode beside the file, SHA-256 round trip) and the committed release walkthrough recording. |
| `VirtualDisks.dc.html` | Windows virtual disk manager: VHD, VHDX, VHD Set, ISO, create, attach, grow, compact, convert, merge, checkpoints, Dev Drive, native boot, the route used and its equivalent script, quick pack. |
| `Minecraft.dc.html` | Minecraft server manager (local, Docker, SSH, SSH Docker; flavours; versions; console) and the world generator (seed, preset, draggable area with keyboard moves, 100 × 100 chunk default, Folder or ZIP, EULA gate, batched progress). |
| `Settings.dc.html` | Motion as a persisted, resettable, schedulable appearance value; front-screen version and updated-at provenance; dim sum code name; free-by-default note; vocabulary drop celebration. |

## Stageshow

- Source: the pinned cache of `benjitaylor/skills` folder `stageshow` at commit
  `299140fafd08df55a9c234e610c3f64af3f45531`. A fresh install was attempted
  first and was refused by the sandbox this pass ran in, so the cache was used.
- Gold examples borrowed from: `form-error` (super confirmation and error
  banner), `chart-scrub` (live chart), `reorder` and `loading` (list insert and
  states), `panel-annotation` (permission sheet).
- References read: `SKILL.md`, `references/craft.md`, `references/framing.md`,
  `references/motion.md`, `references/rehearse.md`, `references/review.md`.
- Rules that did not apply: framing, cropping, bleed and satellite rules are
  written for marketing illustrations; these are real application screens at
  their real size, so they keep full screens instead of crops.

## Review findings and fixes

See `REHEARSAL.md`. Every fixable finding was fixed before this record was
committed. Open items need a decision or the real application:

- Captures of the real application are still required for each implemented
  surface; these frames are design renders only.
