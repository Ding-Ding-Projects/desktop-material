# Universal-feature completeness inventory

The universal-feature completeness inventory is the repository's explicit map
from each required user-facing feature to each user-facing surface that must
ship it. It prevents a feature from disappearing simply because a discovery
scan no longer finds the implementation that used to register it.

## Contract

The inventory is hand-written and uses stable feature and surface identifiers.
Every required feature appears once for every applicable surface. Each entry
records separate references for:

- the production implementation or registration;
- the user-facing documentation article and localized copy;
- the persistence boundary, when the feature stores state;
- focused test coverage;
- interaction evidence from the built artifact; and
- a real capture record for visible behavior.

Those references are independent evidence fields. A source registration proves
only that the repository names or wires the feature; it does not prove that the
feature is complete, reachable, functional, accessible, localized, persistent,
tested, exercised in the built application, or visually verified.

The current machine-readable manifest is
[`evidence-paths.json`](../../../app/test/fixtures/feature-completeness/evidence-paths.json).
It contains all **62** canonical feature IDs in canonical order and uses schema
version 2 with seven independent dimensions: `implementation`, `documentation`,
`localization`, `persistence`, `focusedTest`, `builtArtifactInteraction`, and
`realCapture`. Each dimension is an array of records, so one feature can cite
more than one file without collapsing separate proof into a single path.

Each record is explicitly `present`, `pending`, or `blocked`. A `present` record
names repository-relative paths that were found during read-only inspection;
it does not promote the feature to complete. `pending` and `blocked` records
must carry a reason. The completion verdict walks every record, checks every
claimed-present path, and remains incomplete while any required evidence is
pending or blocked. The August 21 ultra-speed pass intentionally leaves the
runtime, persistence, built-artifact interaction, and real-capture dimensions
pending where they were not independently verified; that state is evidence of
an open Chut, not a missing file to be papered over.

The inventory also records a documented equivalent when a requirement cannot
be implemented literally on a particular surface. The reason and the closest
accessible behavior must be explicit. A blank field, placeholder, sibling-app
delegation, discovery-only record, or undocumented exemption leaves that entry
incomplete.

## Fail-closed behavior

The completeness check compares the hand-written manifest with the canonical
feature identifiers and required dimensions. It must fail when:

- a required feature or surface is absent from the inventory;
- an entry is duplicated or uses an unknown identifier;
- any required evidence dimension is missing, empty, malformed, or no longer
  resolves exactly;
- a `present` record names a missing repository path;
- a `pending` or `blocked` record has no reason; or
- a surface delegates its required behavior to another surface; or
- a documented equivalent omits its reason or accessible behavior.

Inventory validity and completion are separate verdicts. A valid manifest can
have an incomplete completion verdict while evidence is honestly pending. The
dedicated completion Chut nevertheless asserts `complete === true`; with the
current deferred evidence it is expected to be red, and its failure message
prints the exact pending, blocked, or missing paths that must be resolved. The
focused contract test exercises both verdicts and mutates every row and every
dimension using the row's actual ID and record content, including missing paths
and missing pending reasons.

A negative regression check must deliberately remove one required feature,
surface, and evidence reference at a time, observe failure, restore the record,
and observe success. Exact identifiers and boundaries are required so a
commented line, descendant path, or renamed symbol containing the old name
cannot satisfy the check accidentally.

## Evidence boundary for the current registration pass

The current ultra-speed pass registers missing universal-feature identifiers
and their coverage metadata. It intentionally does not run tests, reviews,
audits, captures, builds, or packaging. Therefore this pass must not be cited as
proof that the registered features themselves are implemented or verified.
Every evidence field remains accountable to the artifact it names, and any
field without current evidence remains incomplete until that evidence is
produced in a later verification pass.

The companion
[`canonical-surfaces.json`](../../../app/test/fixtures/feature-completeness/canonical-surfaces.json)
prevents a whole user-facing surface from disappearing between feature rows.
It explicitly repeats all 62 canonical feature IDs for the Windows desktop,
Linux terminal, and documentation-page families. Its current route inventory
contains 299 desktop popup/teleport routes, 13 terminal screens, and 131 served
HTML pages. A focused test derives the live route sets independently and fails
when a feature, route, or source inventory is removed, added without review, or
stale.

Surface enumeration and feature evidence remain separate verdicts. A complete
surface matrix proves that every feature has an accountable destination; it
does not turn a pending implementation, localization, persistence, test,
built-artifact interaction, or real capture into present evidence.

## Security and privacy

Inventory entries contain stable identifiers and repository-relative evidence
references only. They must not contain credentials, private vocabulary,
machine-specific paths, private host details, or user content. Public records
describe missing evidence factually without embedding private inputs.

## Related articles

- [Command palette coverage](command-palette-coverage-gaps.md)
- [Offline documentation browser](offline-documentation-browser.md)
- [The Material Design 3 site](material-design-3-site.md)

