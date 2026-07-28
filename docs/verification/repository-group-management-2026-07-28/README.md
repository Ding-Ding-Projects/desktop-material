# Repository group management — built-app capture, 2026-07-28

Visual evidence for [issue #81](https://github.com/Ding-Ding-Projects/desktop-material/issues/81)
(first-class repository and tab group management).

| File | Surface |
| --- | --- |
| `repository-list-named-group.png` | Repository list with a real named group and the new **Group** action |
| `group-actions-menu-keyboard.png` | The group actions menu — **Edit group…** / **Remove group** — opened from the keyboard |

## Provenance

- **Commit:** `ff53cd2155` (`main`)
- **Build:** production webpack configuration, renderer and main built one process at a time
  into a private output directory.
- **Capture:** `script/capture-app.js` driving the real built `main.js` through Playwright's
  Electron driver, with three repositories seeded into a `Verification group`.
- **Window:** 1180×860.

## What they show

- A real named group header (`VERIFICATION GROUP`) with its own actions control, rather than
  the `OTHER` bucket that earlier gallery images were mislabelling as a group.
- The **Group** button in the action row — creating a custom group no longer requires the
  implicit trick of typing the same group name onto several repositories.
- The actions menu offers **Edit group…** and **Remove group**, and carries its own
  *Filter actions* field with the regex controls every search surface in this project requires.
- Both the repository filter and the menu filter expose the **Regex builder**.
- The grey line under each repository name (`Nothing to push or pull as of the last check`) is
  the ahead/behind summary.

### The second frame was opened from the keyboard, deliberately

Playwright's pointer `click` could not action the group-actions button, so the menu was opened
by focusing it and pressing <kbd>Enter</kbd>. That is worth more than a mouse capture would
have been: #81 requires the group actions to be reachable **by keyboard**, and this frame is
that requirement being exercised rather than asserted.

## What they do not show

Neither frame shows the **tab-group member dropdown** — the collapsed tab group listing its
members — which is the other half of #81. That surface has not been captured yet and the issue
should not be closed on these two images alone.

A `Close` tooltip is visible in the second frame, an artifact of where focus landed. It is not
part of the menu under test.

---

## Tab-group member dropdown (added 2026-07-28, after #92)

`tab-group-member-dropdown.png` shows the surface this directory previously lacked: a tab
group's chip opened into its member dropdown, captured from a production build at
`550d6ca766` at 1280×860.

It could not be captured before #92 was fixed, because the **New tab group** dialog needed to
create the group was itself rendering underneath the toolbar.

### What it shows

- The `Verification group` chip with its member count badge and members button.
- The dropdown headed *Tabs in "Verification group"*, stating: *"Every tab in this group,
  listed even while the group is collapsed. Choosing one switches to it."*
- Its own search field — *Name, alias, path, or…* — with the **Regex builder** control, as
  every search surface in this project requires.
- Group actions: **Edit group…**, **Collapse**, and **Delete group**, the last with the
  non-destructive guarantee stated in the product: *"Deleting the group clears the label only;
  every tab stays open."*

### What it does not show, and one defect it does

The captured group has **one** member, because creating a group from a tab's context menu adds
only that tab. The frame therefore demonstrates the dropdown, its search and its actions, but
**not** a multi-member list — the "lists every member while collapsed" claim is covered by unit
tests, not by this image.

The frame also exposes a real text defect, filed separately: the copy reads **"1 tabs in this
group."** and the button's accessible name is **"Show the 1 tabs in Verification group"**. Both
`tabs.groupMembersCount` and `tabs.groupMembersButton` are hardcoded plurals with no singular
form.
