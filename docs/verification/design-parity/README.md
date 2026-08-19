# Design-reference parity evidence

This directory stores deterministic comparison tooling and raw evidence for the checked-in design references. The evidence is tied to a source commit, a reference route, a production route, a state, a theme, a viewport, and a display scale.

## Current observation

The first real built-artifact comparison for commit `b174c9239f1fe03479ff324b74dbf8bfb96edfc5` covers `workspace-changes-light` from `design/Desktop Material v2.dc.html` at `960x660`, light theme, scale `1`.

| Artifact | SHA-256 |
| --- | --- |
| Reference capture | `e5e36ba5183770e85e1faa6396570eb7088b69c928997d6bd4123843def52091` |
| Production capture | `4e742a0493e043bff4680ec22b48f53c7acfcc5fbfc106086db93b80d9b91396` |
| Labelled side-by-side | `b757e575d16999877f73eb46efa6faf1dc28ec088aef729dc16d0bff5853f195` |

The exact comparator receipt reports `510,768` different pixels out of `633,600` (`80.6136363%`). This is an honest red parity result: the reference contains its design fixture and reference-only states, while the production capture contains the real local fixture and current app shell. The receipt is retained so the difference can be repaired and rechecked rather than hidden behind a filename-only claim.

The route catalog contains 54 reachable reference routes plus one reviewed unreachable History menu state. The remaining routes do not yet have promoted real-built-app captures and therefore are not represented as passing inventory rows. The fail-closed validator must remain red until each route has its own matched tuple, Material Design 3 audit, raw captures, labelled comparison, receipt, and reviewed deviation where the pixels differ.

## Reproducing the comparison

Use the committed comparator with two newly captured, non-overwritten PNGs:

```text
node .codex/verification/design-parity-compare.mjs --reference-png <reference.png> --production-png <production.png> --reference-file design/Desktop Material v2.dc.html --reference-route workspace-changes-light --production-route workspace-changes-light --state workspace-changes-light --theme light --viewport-width 960 --viewport-height 660 --scale 1 --comparison <side-by-side.png> --receipt <receipt.json>
```

The comparator reads immutable regular PNG files, checks exact dimensions and tuple parity, computes RGBA differences, writes visible `REFERENCE`/`PRODUCTION` labels, refuses output overwrite, and records machine-readable hashes.
