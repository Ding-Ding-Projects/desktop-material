# Desktop Material

Desktop Material is an independent remake of GitHub Desktop that keeps the
upstream TypeScript, React, Electron, and Sass implementation stack while
rebuilding the application shell around Material Design 3.

## Product contract

- Preserve the complete Git workflow that makes GitHub Desktop useful.
- Replace the current visual shell with Material Design 3 navigation,
  surfaces, typography, color roles, elevation, motion, and components.
- Support multiple accounts on the same GitHub host, including multiple
  `github.com` identities.
- Let each repository remember the account used for network operations.
- Keep credentials in the operating-system credential store and never write
  tokens to repository configuration or exported settings.
- Keep the product language and implementation language aligned with upstream:
  English UI copy and TypeScript/React/Electron source.
- Publish a screenshot-led project site and complete user/developer wiki with
  GitHub Pages.

## Multi-account model

Upstream identifies accounts primarily by endpoint and prevents a second
account on the same endpoint. Desktop Material will use an immutable account
ID derived from host and authenticated user identity. Repository preferences
will store an optional account ID; operations without a repository will use
the active global account.

Migration must preserve existing users:

1. Read existing accounts from the current account store.
2. Generate stable account IDs without changing stored credentials.
3. Assign repositories to the matching endpoint account when the choice is
   unambiguous.
4. Ask once when multiple accounts match, then remember the selection.

## Delivery phases

1. Material foundations: design tokens, theme modes, app frame, navigation.
2. Repository workspace: changes, history, diff, branches, pull requests.
3. Account profiles: account switcher, sign-in management, repository binding.
4. Remaining dialogs and flows: clone, publish, settings, merge, conflicts.
5. Accessibility, keyboard navigation, automated tests, packaged builds.
6. Screenshots, GitHub Pages landing page, and complete wiki.

This file is the implementation contract. A phase is complete only after its
tests pass, its UI has been rendered and reviewed, and its commit is pushed.
