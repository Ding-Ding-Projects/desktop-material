# TUI search and RE2

> **Historical prototype record:** This page preserves the July 27, 2026 TUI
> experiment. It is not current supported-product guidance or a Windows-release
> blocker.

## Search modes

Plain literal search is the default. A user must deliberately select fuzzy or
regex mode. The shared search control keeps query, mode, case choice, RE2 flags,
validation, and the full builder synchronized on each connected collection
surface.

- **Literal/substring** compares ordinary text and does not compile a pattern.
- **Fuzzy** ranks ordered character matches for navigation-oriented filtering.
- **Regex** uses `google-re2`, the RE2 dialect—not Python `re`, PCRE, or
  JavaScript regular expressions.

Patterns and sample text are evaluated locally. They are not sent to GitHub or
persisted merely because the user previews them.

## Builder

The Regex tab provides:

- raw pattern input;
- `i`, `m`, and `s` flags;
- guided literal, character-class, anchor, group, alternation, and quantifier
  construction;
- sample text;
- syntax feedback;
- live match ranges and capture previews;
- a copy/export path through the terminal clipboard behavior.

RE2 deliberately rejects constructs such as backreferences and look-around. The
builder reports those as dialect errors; it never falls back to a more
permissive engine.

## Safety bounds

| Bound                  |                    Value |
| ---------------------- | -----------------------: |
| pattern                |         1,000 characters |
| one candidate/sample   |       100,000 characters |
| total collection input |     1,000,000 characters |
| match count            |                    5,000 |
| capture work           | 50,000 match×group units |
| capture previews       |                       24 |
| one capture preview    |           120 characters |
| RE2 memory option      |                    8 MiB |

Capture-heavy expressions lower the effective match limit. Candidate keys are
bounded before evaluation. The match iterator advances safely after a zero-width
match, including at end of input, so a pattern cannot loop forever on the same
offset.

## Escaping and flags

The pattern field contains raw RE2 syntax. Shell quoting is irrelevant because
the pattern is not interpolated into a shell command. A literal builder token is
escaped for RE2 before insertion.

- `i`: case-insensitive matching;
- `m`: `^` and `$` operate by line;
- `s`: dot matches newline.

Unsupported flag letters fail validation. Unicode behavior is RE2 behavior;
users should not assume PCRE locale classes or Python-specific semantics.

## Failure and recovery

Invalid syntax leaves the previous collection visible and reports the error; it
does not reinterpret the pattern as literal text. Over-limit input reports the
exact bound. Switch explicitly to Literal to search the pattern characters as
ordinary text.

Tests cover valid/invalid syntax, no match, Unicode, multiline, zero-width,
captures, adversarial forms, and literal-versus-regex behavior. The generated
parity ledger links builder and shared-service evidence but does not prove that
every one of the desktop edition's 51 search surfaces already exists in the TUI.
