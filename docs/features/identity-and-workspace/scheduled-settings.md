# Scheduled language, appearance, and external settings

Desktop Material can apply a settings value during a local date-and-time
window. A rule can change the language presentation, theme, and appearance
customizations together or leave any of those fields unchanged. Rules are
stored in the active profile and evaluated in the computer's local time zone.

## User workflow

Open **Settings → Appearance → Scheduled settings**, then choose **Add
schedule**. Each rule provides:

- optional start and end dates, using the native date picker;
- a start and end time, using the native time picker;
- either a selected set of weekdays or **Every day**;
- a local value, a validated API value, or a Home Assistant boolean source;
- an enabled switch, an editable label, and a remove action.

The end time is exclusive. A start and end time that are equal means the full
selected day. A window that crosses midnight belongs to its selected start day
and continues after midnight into the following day. When multiple rules are
active, later rules win only for fields that they provide.

The editor reports the operating system's local IANA timezone beside the
pickers. Evaluation follows that local wall clock when daylight-saving time
changes: a skipped wall-clock time cannot fire, and a repeated wall-clock time
continues to use the same rule window. The selected dates and times are never
silently converted to UTC.

The local editor exposes language, theme, update-progress palette, surface,
elevation, fonts, motion, toolbar and repository density, tab width and close
button behavior, submodule Back treatment, and the Desktop Material feature
highlight. **No change** leaves a field inherited from the normal appearance
profile. The API contract can also provide the other allowlisted appearance
customization objects, including typography and safe identity styling. API
identity payloads never provide a custom local logo path; that path remains a
local profile choice.

## API source

An API rule fetches a bounded JSON document over HTTPS. HTTP is accepted only
for `localhost`, `127.0.0.1`, and `::1`. Credentials embedded in the URL, query
strings, fragments, redirects, private-network destinations, oversized
responses, invalid JSON, and unknown settings are rejected. The response shape
is:

```json
{
  "version": 1,
  "settings": {
    "languageMode": "bilingual",
    "theme": "dark",
    "appearance": {
      "accentPalette": "teal",
      "motion": "reduced"
    }
  }
}
```

Only the documented language, theme, and normalized appearance fields are
accepted. A failed or invalid source is skipped without preventing local
rules or restoring the user's normal settings.

## Home Assistant boolean source

Choose **Home Assistant boolean** and enter the HTTPS server URL plus an
entity ID such as `binary_sensor.office` or `input_boolean.focus`. The rule's
local settings value is applied only while the entity reports the exact state
`on`; `off` leaves the normal settings active. **Test sensor** reads the
current state without changing the schedule.

The access token is submitted to the main process and stored in the operating
system credential vault, keyed to the normalized server and entity. It is not
written into the schedule, local storage, logs, exports, or renderer state
after a successful save. A missing token, invalid entity, non-boolean state,
timeout, HTTP failure, or unavailable Home Assistant instance skips that rule.

## Persistence and failure modes

The schedule document is versioned and size-bounded before it enters profile
storage. Invalid times, weekdays, URLs, entity IDs, and unsupported values are
normalized or disable the affected external rule. A reversed date range stays
visible in the editor, is announced inline, and fails closed until corrected.
The refresh loop runs on a bounded background interval and ignores stale
responses and stale failures after a newer refresh or stop. The active
appearance overlay is reversible: when no rule is active, the profile's stored
appearance and theme return unchanged.

## Security considerations

- Network requests run in the main process with a five-second timeout,
  redirect rejection, a 64 KiB response limit, and an explicit JSON schema.
- API URLs do not accept user information, passwords, query strings, or
  fragments. Generic API DNS results are checked against private, loopback,
  link-local, and reserved networks before the request. Local HTTP is limited
  to loopback so an unencrypted remote endpoint cannot be saved.
- Home Assistant tokens never enter schedule JSON or exported settings. The
  renderer receives only success, failure, or the boolean state returned by
  the main-process bridge.
- API and Home Assistant failures are isolated per rule and never replace a
  working local value with an unverified response.

## Verification

The model and runtime tests cover every-day windows, bounded time windows,
cross-midnight evaluation and date bounds, reversed-range fail-closed behavior,
external URL and entity validation, versioned API parsing, remote identity path
stripping, merge precedence, Home Assistant `on`/`off` gating, stale-refresh
failure isolation, and failure isolation. The IPC contract covers all three
main-process channels. The
settings-search, internationalization, and appearance UI suites remain
green. A real hidden Windows desktop capture reaches the date/time editor, API
endpoint field, and Home Assistant URL/entity/token/test controls.

## Suggested articles

- [Settings search](settings-search.md) — find the schedule controls by name,
  description, or keyword.
- [Owner-scoped appearance and history](owner-scoped-appearance-and-history.md)
  — understand how normal appearance changes are persisted and reversible.
- [Material Design 3 site](../design-system/material-design-3-site.md) — see
  the project's shared appearance and localization surface rules.
