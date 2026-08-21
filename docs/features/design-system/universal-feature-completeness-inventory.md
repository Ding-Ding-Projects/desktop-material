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

The inventory also records a documented equivalent when a requirement cannot
be implemented literally on a particular surface. The reason and the closest
accessible behavior must be explicit. A blank field, placeholder, sibling-app
delegation, discovery-only record, or undocumented exemption leaves that entry
incomplete.

## Fail-closed behavior

The completeness check compares the hand-written inventory with the canonical
feature identifiers and surface identifiers. It must fail when:

- a required feature or surface is absent from the inventory;
- an entry is duplicated or uses an unknown identifier;
- any required evidence field is missing or no longer resolves exactly;
- a surface delegates its required behavior to another surface; or
- a documented equivalent omits its reason or accessible behavior.

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

## Security and privacy

Inventory entries contain stable identifiers and repository-relative evidence
references only. They must not contain credentials, private vocabulary,
machine-specific paths, private host details, or user content. Public records
describe missing evidence factually without embedding private inputs.

## Related articles

- [Command palette coverage](command-palette-coverage-gaps.md)
- [Offline documentation browser](offline-documentation-browser.md)
- [The Material Design 3 site](material-design-3-site.md)

