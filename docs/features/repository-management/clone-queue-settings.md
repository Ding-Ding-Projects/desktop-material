# Clone queue settings

Desktop Material exposes its account-scoped automatic-clone policy at
**Settings → Clone queue**. This page is the durable configuration surface for
background discovery; it does not replace the batch-clone progress window or
make the Agent API command queue configurable.

## Behavior

Each signed-in hosted account receives its own card. The card displays the
saved base directory, parallel or sequential clone mode, and whether automatic
cloning is on. When enabled, Desktop Material records the provider repository
catalog as a baseline and then checks every five minutes. Only repositories
discovered after that baseline are queued, so enabling the policy does not
silently clone the account's existing catalog.

Discovery continues after Settings closes. New work starts in the background
without opening an unsolicited progress dialog, and the normal batch-clone
journal retains pause, retry, interruption, and review-required recovery. The
same policy remains available in the Clone dialog; both surfaces configure the
one account-scoped store.

## Configuration

1. Sign in to the hosted account that owns the repositories.
2. Open **Settings → Clone queue** and find that account's card.
3. Choose an absolute base directory.
4. Select **Parallel — up to 3 at once** or **Sequential — one at a time**.
5. Turn on **Automatically clone new repositories**.

A directory is required before the switch can be enabled. Choosing a new
directory or clone mode while the policy is already on updates that account's
policy immediately. Turning the switch off removes the policy and prevents new
automatic batches from starting; it does not cancel a clone that is already
running.

Policies are stored locally by stable account identity. The saved data contains
the base path, mode, baseline state, and bounded credential-free repository
URLs. Provider tokens and embedded credentials are never written into the
policy file.

## Failure modes and recovery

- If no hosted account is signed in, the page explains that an account is
  required instead of showing empty controls.
- An empty, relative, invalid, or excessively long base directory fails closed.
  Choose another absolute folder and enable the policy again.
- A provider catalog that is too large or contains an unsafe URL is rejected
  before it can become a baseline. Refresh or correct the account catalog and
  retry.
- If local policy storage fails, the current session may continue, but Desktop
  Material reports that the policy may need to be enabled again after restart.
- Existing, incomplete, linked, bare, modified, or differently bound
  destination folders are never removed or overwritten. The recovered queue
  leaves them in a review-required state.

## Security and resource bounds

Desktop Material accepts at most 32 account policies, retains at most 5,000
seen URLs per policy, and starts no more than 500 newly discovered repositories
in one batch. Parallel mode uses the existing three-clone concurrency bound.
Clone URLs containing credentials, unsafe destination names, and repositories
already tracked by Desktop Material are excluded. The queue reuses the exact
selected account's normal credential path rather than widening authentication
to another host or identity.

## Verification

The Settings component is covered by focused tests for empty-account copy,
persisted-policy hydration, required-directory validation, directory selection,
parallel/sequential changes, enable/disable dispatch, and English, playful Hong
Kong-style Cantonese, and bilingual rendering. The responsive-surface catalog
registers the page as a Settings destination. Exact-source production build,
off-screen interaction and screenshot acceptance, remote CI, and publication
are recorded separately in the active run manifest and `HANDOFF.md`.

## HTTP/API applicability

This page configures the renderer-owned automatic-clone store and adds no HTTP
route. The Agent API's fixed eight-running/64-waiting request limits are a
separate security boundary and intentionally remain non-configurable, so no new
Postman request is applicable.
