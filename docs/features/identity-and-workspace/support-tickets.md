# Support Tickets: the local recovery desk / Support Tickets：本機支援櫃檯

Desktop Material ships several for-fun locks — a tab a user can put behind a
password, an appearance property behind an OTP, the renamable presentation lock
in settings. Every one of those is a self-imposed speed bump rather than a
security boundary, so forgetting the credential is a normal outcome and the app
owes the user a self-service way back in.

Support Tickets is that route. It is dressed as a service desk, and the joke is
deliberate; the resolution it eventually offers is the only thing that actually
works — it opens the application data folder in the platform's own file manager
so the user can delete it themselves.

Desktop Material 有幾個「好玩」嘅鎖：分頁可以加密碼、外觀屬性可以加 OTP、設定入面
仲有可以改名嘅展示鎖。呢啲全部都係自己畀自己設嘅減速帶，唔係安全防線，所以唔記得密碼
係好正常嘅事，App 有責任畀返條路你自己行返入去。

Support Tickets 就係嗰條路。佢刻意扮成一個客服櫃檯，個玩笑係故意嘅；但佢最後畀你嘅
解決方法先至係真係做到嘢——喺你嘅檔案總管打開 application data 資料夾，等你自己刪。

## Where it lives / 相關檔案

| Concern | Module |
| --- | --- |
| Ticket records, numbering, statuses, storage | `app/src/lib/support-tickets.ts` |
| Export serializers (9 formats) | `app/src/lib/support-ticket-export.ts` |
| Folder resolution and opening | `app/src/lib/support-ticket-recovery.ts` |
| The desk surface | `app/src/ui/md3/md3-support-tickets-view.tsx` |
| The three entry points | `app/src/ui/md3/md3-support-ticket-entry.tsx` |
| The delete gate | `app/src/ui/md3/md3-support-ticket-delete-gate.tsx` |
| Styles | `app/styles/ui/_md3-support-tickets.scss` |
| Tests | `app/test/unit/support-tickets-test.ts`, `app/test/unit/support-ticket-recovery-test.ts`, `app/test/unit/support-tickets-desk-test.tsx` |

## Behaviour / 行為

### Three routes in / 三條入口

`Md3SupportTicketEntry` is one component rendered three times, once per route:

1. **The unlock prompt** — the "Forgotten your password?" link beside the
   credential field in the presentation-lock settings section
   (`app/src/ui/preferences/school-mode.tsx`). Somebody who cannot remember the
   credential is looking at that field, so the link belongs there rather than in
   a menu elsewhere.
2. **The lock setting** — a "Support Tickets" link in the same settings section,
   available whether or not the lock is currently on.
3. **Help** — a "Support Tickets" link in the About dialog
   (`app/src/ui/about/about.tsx`), which is what the Help menu opens.

The desk names the route it was reached by ("You arrived from the unlock
prompt."), so a user is never left wondering whether they are in the right
place. The route is also recorded on any ticket raised during that visit and is
written into every export.

### The ticket / 張飛

The form takes a **category** (forgotten password, lost authenticator, locked
tab, locked appearance setting, something else) and a **severity** (whenever,
normal, urgent, critical) as radio groups, plus a free-text description bounded
at 2,000 characters. Both pickers state in their own hint text what they do and
do not affect; the severity hint says plainly that every severity behaves
identically because there is no queue and no agent.

Submitting mints a ticket number of the form `DM-YYYYMMDD-NNNN`, where the
date is UTC and the sequence is derived from the tickets already stored rather
than from a persisted counter — a partially restored or hand-edited store
therefore cannot mint a duplicate. The canned first response is attached at the
same moment; it is immediate and local, with no simulated delay that could read
as a queue somebody is working through.

Statuses advance one step per activation: `received` → `triaged` →
`awaitingCustomer` → `resolved`. `resolved` is terminal and the Advance control
becomes unavailable rather than silently doing nothing. Each step appends its
own response line.

Response **text** is not stored — only its kind. Storing the words would freeze
one language and one funny level into the record, so a user who later switches
to Cantonese would read their own ticket history in the language they left.

### The list / 張飛清單

The ticket list is a real list and carries what every list in this project
carries:

- its own search field with the anchored full regex builder beside it
  (`Md3RegexBuilderDialog`), plain text by default and regex as an explicit
  opt-in;
- filter chips for open, resolved, and urgent-or-critical;
- multi-select by click, shift-click range, and keyboard (Space toggles, Ctrl+A
  selects the filtered set, arrow keys move, Home/End jump);
- a select-all that names its own scope honestly — "Select all N tickets" with
  no filter, "Select the N matching tickets" with one;
- inverse selection, and a scope readout that says whether a bulk action will
  run on the selection, the filtered set, or everything;
- bulk advance, bulk export, and bulk delete;
- a row context menu and a list context menu, each with its own filter field and
  regex-builder route.

### Export / 匯出

Exports are serialized by `serializeSupportTicketExport` into any of nine
formats — JSON, JSONL, YAML, TOML, XML, CSV, TSV, Markdown, HTML. Every format
carries all nine fields of a ticket record, so none of them warns about loss;
a format that could not represent a future field would have to add that warning
rather than truncate silently. Content is UTF-8 with LF line endings, and the
scope sentence is written into the file wherever the format has somewhere to put
one. The desk never writes the file itself: the host is handed the bytes and a
suggested filename, which is what keeps the export path testable without a file
system.

### The resolution / 解決方法

The resolution panel resolves the application data folder from the running
application (`getPath('userData')`), shows that exact string, and hands that
exact string to the opener. Displayed and opened are one value, not two that
could drift.

Opening goes through `shell.openPath`, whose contract is an empty string on
success and the platform's own message on failure — which is why it is used
rather than the fire-and-forget reveal helpers. All three outcomes are reported:

| Outcome | What the user sees |
| --- | --- |
| `opened` | "Opened `<path>` in your file manager." |
| `failed` | "The file manager could not open `<path>`. It reported: `<message>`" — the platform's words, verbatim |
| `unavailable` | The folder could not be resolved; the Open button stays unavailable and the panel says so |

The panel also carries a fixed line stating that the app opens the folder and
stops there, and never deletes it for the user.

## Configuration / 設定

There is none to speak of, and that is deliberate: the desk is a recovery route,
not a feature to be tuned. What can be adjusted is what adjusts everywhere else —
the language mode, the two per-language funny levels, and the appearance system.

Tickets are stored under the `desktop-material-support-tickets-v1` key in this
profile's local storage, capped at 200 records, newest first. A change raises
`desktop-material-support-tickets-changed` on `window`.

The desk carries its own explanation behind progressive disclosure ("How this
desk behaves") and a truthful default-provenance line beneath it: it says
whether the ticket count came from a store that has actually been written, or
whether the desk is showing its shipped default of an empty queue. The folder
path carries the same treatment — the panel states whether the path came from
the running application or whether no value has arrived yet.

## What the funny level may and may not touch / 搞笑等級可以改咩、唔可以改咩

Three key families are banded across `plain` / `light` / `playful` / `maximum`
and registered in `FunnyLevelTextBase`:

- `supportTickets.deskLead` — the desk's framing sentence;
- `supportTickets.response.acknowledged` — the canned first response;
- `supportTickets.resolution.lead` — the framing above the resolution.

Everything a user acts on is deliberately **not** banded: the disclosure line,
the folder path, the statement that the app never deletes anything, the file
manager's own failure message, the ticket number, the counts, and every control
label. A funny level may make the desk pompous; it may never make the recovery
route ambiguous.

### The disclosure line / 免責聲明嗰行

One line, fixed copy in both languages, outside the comedy:

> Nothing here is sent anywhere. No ticket exists outside this machine, no
> network request is made, no data is collected, and nobody is reading it. Do
> not wait for a reply.

A user sitting and waiting for a reply that was never coming is the single
outcome this whole feature must not produce, so the sentence is asserted
character-for-character at every funny level in all three language modes.

The desk never fabricates a real agent's name, a real company's support
branding, a real case-management system, or a response time that implies a
human.

## Failure modes / 失敗情況

| Situation | Behaviour |
| --- | --- |
| Local storage is unreadable or damaged | The records that survive parsing are returned; a malformed entry is dropped rather than throwing. A desk that refuses to open because one record is malformed has locked the user out of the route that exists to let them back in. |
| Local storage write fails (quota, unavailable) | The in-memory list stays correct for the session and the surface keeps working. Nothing about the recovery route depends on persistence. |
| The application cannot report its data folder | The path is not shown, the Open button stays unavailable, and the provenance line says no value has arrived. No guessed path is ever displayed. |
| The file manager refuses to open the folder | The platform's own message is shown verbatim in the panel and raised as an error notification that does not auto-dismiss. |
| An invalid regular expression is typed | The list keeps showing every ticket and says the pattern is not valid, rather than silently emptying. |
| The description is empty | The Raise ticket button stays live — a disabled control gives a keyboard user nothing to press and no explanation — and pressing it moves focus to the field and states what is missing. |

## Security considerations / 保安考慮

- **No network, anywhere.** No `fetch`, no `XMLHttpRequest`, no `WebSocket`, no
  beacon, no URL of any kind in any of the desk's modules. This is asserted both
  by a source guard and by a runtime test that replaces every transport jsdom
  exposes and fails if one is touched during a full ticket lifecycle.
- **No credentials.** The desk holds none, reads none, and stores none. It never
  displays, hints at, or characterises the value, length, or composition of any
  stored secret — recovery here means deleting the profile, never revealing what
  was in it.
- **No deletion.** Nothing in the recovery route references a filesystem-removal
  API. The desk opens the folder and stops; the deletion is the user's own act
  in their own file manager. Any future in-app deletion of the profile would be
  a destructive action owing the two-key super-confirmation gate, never a button
  on a joke ticket.
- **Ticket text is data, never instructions.** A description is stored, trimmed,
  length-bounded and rendered as text. It is never parsed, evaluated, or treated
  as markup.
- **Bounded storage.** 200 records, 2,000 characters each, so a joke desk cannot
  become an unbounded write to local storage.

## Accessibility / 無障礙

- The desk is a modal surface with `role="dialog"`, `aria-modal`, a labelled
  title, the disclosure line as its description, a focus trap that wraps Tab in
  both directions, Escape to close, and focus restored to the link that opened
  it.
- The ticket list is a `grid` with `aria-multiselectable`, roving tabindex on
  rows, arrow-key traversal between rows and into a row's own controls, and
  per-row accessible names that include the ticket number.
- Every icon-only control has an accessible name; every ghost button whose
  visible label is shorter than its meaning carries a fuller accessible name
  that still contains its visible words, so speech input can activate what the
  user can read.
- The delete gate is an `alertdialog` whose emergency exit holds focus on open,
  so a gate that appeared under a stray keypress cannot delete anything on the
  next one. Its slider exposes `aria-valuetext` in words.
- Radio groups are real `fieldset`/`legend` groups with native radios, so the
  platform's own group navigation applies.
- The progress fill's transition is dropped under `prefers-reduced-motion`.
- Targets are at least 34px tall, and 44px for the entry links; the panel scrolls
  inside a viewport-bounded height rather than capping and hiding overflow, and
  the layout wraps below 620px so nothing clips in bilingual mode at high
  display scales.

## Verification / 驗證

```
node script/test.mjs app/test/unit/support-tickets-test.ts \
  app/test/unit/support-ticket-recovery-test.ts \
  app/test/unit/support-tickets-desk-test.tsx
```

Covered: number generation and per-day sequence derivation; the canned first
response; the status chain and its terminal state; description bounds; storage
round-trip, damage tolerance and capping; all nine export formats plus escaping
and a JSON round trip; the three entry routes and the origin each one names;
raising, listing, advancing and searching a ticket; bulk select-all, inverse
selection and scoped export; deletion refusing to proceed without both keys and
a full slider; the resolution opening exactly the displayed path, reporting a
refusal verbatim, and offering nothing to press when no path resolved; the
disclosure line asserted character-for-character at all five funny levels in all
three language modes; and two independent no-network assertions.

Four of these are guards, and each was watched to fail before being trusted:
the deletion-path guard (adding `rmdir` to the recovery module turns it red),
the disclosure-invariance guard (routing the line through the funny level turns
it red), the gate guard (deleting without opening the gate turns it red), and
the no-network source guard (adding a URL to the view turns it red).
