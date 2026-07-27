# Private-repository lock badge

> **Delivery status — July 27, 2026:** the implementation, focused tests,
> TypeScript checks, production build, and isolated real-window capture pass
> locally and the source is integrated into local `main`. Remote push/CI,
> Pages/wiki publication, and installer/Release evidence remain pending.

Desktop Material shows a separate filled lock beside a repository's normal
leading glyph when GitHub metadata explicitly identifies the repository as
private. The lock does not replace a fork glyph, custom repository logo, or
ordinary repository icon.

![Repository picker showing a private-repository lock beside the repository logo](../../assets/screenshots/private-repository-lock-badge.png)

<sub>**香港粵語速讀。** GitHub 明確話個 repo 係 private，repo 行就會另外顯示一個
鎖仔；原本嘅 fork、custom logo 或 repo icon 照樣保留。唔會靠網址、登入失敗或者
本機路徑亂估私隱狀態。鎖仔可以用鍵盤聚焦，英文、廣東話同雙語模式都有清楚名稱。</sub>

## Behavior

The repository picker renders the badge only when
`gitHubRepository.isPrivate === true`:

- `true` shows the lock;
- `false` shows no lock; and
- `null`, missing provider metadata, and non-GitHub repositories show no lock
  because their privacy state is unknown.

The badge is independent of the repository's primary visual identity. It stays
visible beside a fork glyph or custom image and contributes **Private
repository** to the list row's accessible name.

## Configuration

There is no user override for the badge. It reflects the provider metadata
already associated with the repository and updates when that repository model
is refreshed. Language mode and density use the app's existing persisted
settings:

- English reads **Private repository**;
- playful Hong Kong-style Cantonese reads **私人 repo**; and
- bilingual mode shows both in the focus tooltip while keeping the canonical
  accessible name concise.

## Failure modes

Unknown or unavailable provider metadata fails closed as an unknown display
state: no privacy claim is painted. The UI does not infer a private repository
from an access error, sign-in state, URL shape, remote name, filesystem path,
or whether a clone operation succeeded.

A missing custom logo affects only the leading repository image and does not
remove a valid lock. Conversely, a custom logo never creates a lock without
explicit private metadata.

## Security and privacy

The badge is a presentation of metadata that is already in the in-memory
repository model. Rendering it performs no network request, reads no
credentials, and persists no new repository data. Avoiding inference matters:
an error or inaccessible remote is not proof that a repository is private, and
showing a false lock could misrepresent the repository's actual visibility.

## Accessibility and layout

The lock exposes `role="img"`, a localized accessible label, keyboard focus,
and a localized tooltip. The containing repository option also includes the
privacy label, so screen-reader users hear the state without having to move
focus to the badge.

The badge uses fixed 22 px geometry in normal density and 20 px in compact
density. It does not expand with localized text, and the tooltip supplies the
full bilingual wording without widening or clipping the repository row.

## Verification

The dedicated unit suite passed **3/3** and covers exact-true rendering,
false/unknown suppression, bilingual keyboard tooltip behavior, and the
canonical list-row accessible name. Adjacent repository-list, logo, sync, and
localization tests passed **40/40**. The feature also participated in the
combined **652/652 across 53 files** gate, clean full TypeScript checking, and
the successful Windows production build.

The accepted 960×660 capture above came from the real built repository picker
on an isolated hidden Win32 desktop. A disposable repository model supplied
exact `isPrivate: true` metadata without a network account or credential. The
original-resolution image passed clipping, overlap, sizing, and private-data
inspection.

Packaged Windows E2E, remote push/CI, Pages/wiki publication, and
installer/Release verification remain pending. The image is
assigned to the 89-scene local source gallery; its raw `main` URL becomes
publication evidence only after the default-branch push is verified.

## API applicability

This is an in-process repository-list presentation feature. It adds no HTTP
API, so a Postman collection is not applicable.
