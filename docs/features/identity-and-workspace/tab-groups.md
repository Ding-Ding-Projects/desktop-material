# Tab groups

Repository tabs can be collected into named, colored groups. A group is an
organizational label over the existing strip: it never changes what a tab does,
never closes a tab, and never alters which repository a tab is bound to.

## Behavior and configuration

Right-click any tab to reach its group actions:

- **Add Tab to New Group…** opens a small dialog for the group's name and one
  of six curated colors (blue, green, yellow, red, purple, grey). The
  right-clicked tab becomes the group's first member.
- **Move to “name”** moves the tab into an existing group. The tab is
  repositioned next to that group's last existing member, so a group always
  reads as one contiguous run rather than being split by unrelated tabs.
- **Remove from “name”** ungroups the tab and leaves it exactly where it sits.
- **Collapse/Expand “name”** toggles the group's collapsed flag.
- **Delete Group “name”** removes the label only. Every tab that belonged to
  it stays open and simply becomes ungrouped.

A grouped tab shows a colored band along its top edge and a matching tint on
hover and while active, so members of a group are recognizable at a glance
without changing tab geometry, height, or minimum width.

Groups are stored per profile alongside the tabs themselves, so they survive
restart, profile switch, and settings-history restore through the same
persistence path as pinning and favorites.

## Persistence and compatibility

`IProfileTabsState.groups` and `IRepositoryTab.groupId` are both optional. A
profile written before groups existed loads unchanged and needs no migration
or rewrite. Both the tab and group records retain unknown keys, so a session
written by a newer release and then opened by an older one does not lose
fields it does not understand.

A `groupId` that does not match any declared group is treated as ungrouped
rather than discarded, so a downgrade followed by an upgrade does not silently
strip membership.

## Failure modes and recovery

Creating a group with a blank or whitespace-only name is rejected and the
dialog's confirm action stays disabled. Names are whitespace-collapsed and
truncated to 64 characters on entry.

Moving a tab to a group id that no longer exists ungroups it instead of
leaving a dangling reference. Deleting a group is always non-destructive to
tabs; there is no path from group management to closing a repository tab.

## Security considerations

Group colors come from a closed, curated set and are re-validated on every
read and render. An untrusted or corrupted persisted color falls back to the
default rather than reaching an inline style, so a hand-edited profile cannot
inject arbitrary CSS through a group. Group names are rendered as text and are
never interpreted as markup.

## Verification

`tab-groups-test.ts` covers curated-color validation, the fallback for
untrusted colors including CSS-injection-shaped strings, whitespace collapsing
and length bounding of names, and rejection of empty or non-string names.
