# Named multi-stash manager

The repository-wide Stash Manager inventories every stash entry returned by Git
without a Desktop entry-count cap and supports
more than one Desktop-managed stash per branch. A new stash can have a printable
name, creation timestamp, branch grouping, and either all-changes or reviewed
selected-file scope.

Users can inspect files, apply while keeping, pop after a clean apply, rename
Desktop metadata, create and check out a branch, delete one entry, or clear an
exact reviewed subset. Batch clear is limited to 100 entries. Every mutation
re-resolves the stash by full object ID so shifting `stash@{n}` positions do not
silently target another entry.

A conflicting apply retains the stash for recovery. Branch creation validates
the new ref twice and consumes the stash only through Git's successful
`stash branch` operation. Rename remains Desktop-only because rewriting another
client's metadata would destroy provenance. Git storage and the bounded
metadata byte budget remain the practical limits; the old 500-entry UI cap is
gone.

Stash metadata is encoded in the Git stash message with bounded components; no
credential or absolute path is stored. External-client entries are covered by
[External stash interoperability](external-stash-interoperability.md).

Verification is in the Git stash and Stash Manager UI suites, including stale
identity, conflicts, named entries, multi-entry clear, and branch recovery.
The separate manager dialog adds searchable tabbed export, recovery history,
language and independent English/Cantonese funny-level controls, and a direct
route to the shared appearance editor.
