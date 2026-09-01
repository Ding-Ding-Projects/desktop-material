# Copilot account settings and quota

Copilot model choices and usage snapshots are scoped to the signed-in account
that owns them. The Preferences surface keeps account identity, model choices,
and usage data together so switching accounts cannot reuse another account's
selection or quota.

## Behavior

Each account is identified by its numeric account id and API endpoint. Model
lists, selected models, and quota snapshots use that same key. A model choice
for commit-message generation or conflict resolution is written only to the
selected account's map. If an account is removed, its in-flight data cannot
restore itself later. Re-authentication starts a new request generation, so an
older response cannot replace newer data.

The usage card reports the values returned by the provider: used requests,
available requests when the provider supplies a finite entitlement, reset date,
and the local refresh timestamp. Unlimited quotas use an accessible
"No usage limit" value. The card also reports loading, available, stale,
unavailable, and error states. Missing data is never represented as a guessed
zero or as another account's data.

Counts and percentages use the shared number-format preference, with a bounded
maximum fraction setting. Zero-fraction values omit the decimal separator, so
the card never displays a dangling separator beside a quota fact.

## Persistence and migration

Account-scoped model selections are stored under
`selected-copilot-models-by-account`. The value is a bounded object whose keys
are account cache keys and whose values contain feature-to-model selections.
The legacy global selection is copied to every known account only when that
account has no explicit override. After migration, the legacy keys are removed
and repeated migration is idempotent. Provider and model removal scrubs stale
selections before they are saved.

Selection changes go through the existing profile settings history path. The
registered setting is `selected-copilot-models-by-account`, so changing a model
creates a normal local settings-history entry without storing account tokens or
provider secrets.

## Failure and recovery

An account without Copilot SDK eligibility reports unavailable. A known account
whose scoped map contains `null` remains loading or unavailable, rather than
falling back to the first account. A refresh failure retains the last valid
snapshot and marks it stale. A failure without a prior snapshot reports an
error with no fabricated values. A response received after sign-out or after a
newer request is ignored for cache and state mutation.

## Security and privacy

The cache key contains only the account id and endpoint. Account tokens,
provider credentials, and raw provider responses are not placed in model
selection storage, settings history, UI labels, exports, or diagnostics.
Quota values are treated as provider facts and are rendered only after the
account identity and request generation have been checked.

## Verification

### Desktop completeness inventory

| Surface | Implementation | Search or route | Focused checks | Capture state |
| --- | --- | --- | --- | --- |
| Account overview | `app/src/ui/preferences/snapshot-card.tsx` | `settingsCopilotAccountOverview` | account identity and sign-out isolation | Packaged capture pending |
| Quota details | `app/src/ui/preferences/snapshot-card.tsx` | `settingsCopilotQuota` | used/available/reset, status and progress semantics | Packaged capture pending |
| Configure models | `app/src/ui/preferences/copilot.tsx` | `settingsCopilotConfigureModels` | per-account selection and model restoration | Packaged capture pending |

The inventory is intentionally hand-written. It does not infer coverage from
the entries already discovered by a test. Its negative evidence is the focused
red proof that replaces the used value with the entitlement value and requires
the UI check to turn red; restoring the provider-reported used value turns it
green again.

Focused checks cover two-account model isolation, migration overrides,
storage round trips, idempotence, sign-out, re-authentication races, stale
quota responses, no invented quota values, accessible account and progress
semantics, localized English and Cantonese copy, funny-level framing, and
settings search and command-palette reachability. The focused command is:

```text
node script/test.mjs app/test/unit/stores/copilot-store-test.ts app/test/unit/ui/copilot-preferences-test.tsx app/test/unit/settings-search-test.ts app/test/unit/format-number-test.ts
```

The command-palette suite retains one unrelated pre-existing failure in
`palette:set-attention-focus`; the Copilot registration and selector checks
remain green.

## Suggested articles

- [Copilot commit-message controls](copilot-commit-message-controls.md)
- [Ollama model manager](ollama-model-manager.md)
- [Multiple accounts and repository identity](../identity-and-workspace/multiple-accounts-and-repository-identity.md)
