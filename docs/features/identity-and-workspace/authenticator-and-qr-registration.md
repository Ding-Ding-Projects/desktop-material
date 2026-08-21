# The built-in authenticator and QR pairing / 內置驗證器同 QR 配對

Desktop Material ships its own TOTP authenticator: a place to register and keep
second factors for whatever accounts the user likes, and to read live codes
without reaching for a phone. Registering a factor draws a scannable QR from a
secret generated on this machine, and nothing is stored until the user has typed
one working code back.

Everything here is local. There is no account, no cloud sync, no telemetry, and
no network request of any kind — including for drawing the QR, which is encoded
and painted in-process rather than fetched from a chart service.

Desktop Material 自己有個 TOTP 驗證器：可以幫任何帳戶登記同保存第二重驗證，唔使攞手機
都睇到即時密碼。登記嗰陣會用喺呢部機度整嘅密鑰畫個掃得到嘅 QR，而且要你打返一個正確
密碼，先至會真係存低。

呢度所有嘢都係本機做。冇帳戶、冇雲端同步、冇遙測，亦都完全冇任何網絡請求——連個 QR
都係喺程序入面編碼同畫出嚟，唔係去圖表服務攞返嚟。

## Where it lives / 相關檔案

| Concern | Module |
| --- | --- |
| RFC 4226 HOTP and RFC 6238 TOTP, clock assessment | `app/src/lib/authenticator/totp.ts` |
| RFC 4648 base32 | `app/src/lib/authenticator/base32.ts` |
| `otpauth://totp/` build and parse | `app/src/lib/authenticator/otpauth-uri.ts` |
| GF(256) and Reed–Solomon | `app/src/lib/authenticator/galois.ts` |
| ISO/IEC 18004 tables (versions 1–20) | `app/src/lib/authenticator/qr-tables.ts` |
| QR encoder | `app/src/lib/authenticator/qr-encode.ts` |
| QR decoder and image sampling | `app/src/lib/authenticator/qr-decode.ts` |
| Entry records, groups, ordering | `app/src/lib/authenticator/entries.ts` |
| Credential-vault boundary | `app/src/lib/authenticator/secret-vault.ts` |
| Git-backed mutation history | `app/src/lib/stores/authenticator-store.ts` |
| The list surface | `app/src/ui/md3/md3-authenticator-view.tsx` |
| The registration dialog | `app/src/ui/md3/md3-authenticator-registration.tsx` |
| The QR renderer | `app/src/ui/md3/md3-authenticator-qr.tsx` |
| Image, clipboard and camera capture | `app/src/ui/md3/md3-authenticator-capture.ts` |
| Export serializers | `app/src/ui/md3/md3-authenticator-export.ts` |
| Styles | `app/styles/ui/_md3-authenticator.scss` |
| Tests | `app/test/unit/authenticator-totp-test.ts`, `app/test/unit/authenticator-qr-test.ts`, `app/test/unit/authenticator-entries-test.ts`, `app/test/unit/md3-authenticator-view-test.tsx` |

## Behaviour / 行為

### Registration / 登記

The registration dialog accepts six sources, selected from one radio group:

1. **Generate here** — a 160-bit secret is generated locally with
   `crypto.randomBytes`, drawn as a QR, and shown beside its grouped base32.
2. **Paste a link** — an `otpauth://totp/` URI the issuer supplied.
3. **Type the secret** — base32 by hand, with the algorithm, digits and period
   set beside it.
4. **Read an image** — a saved QR image, decoded on this machine.
5. **Read the clipboard** — a QR image, or an `otpauth://` link, from the
   clipboard.
6. **Scan with a camera** — where the platform exposes one.

All six converge on the same descriptor and then on the same pairing
confirmation. The user types one current code back, and the factor is committed
only when it matches (with a one-step tolerance either side, per RFC 6238 §5.2).
Without that step a mis-scanned secret is stored perfectly, produces beautifully
formatted digits, and is refused by every server on earth — with the first
symptom appearing at a login screen and no error anywhere to read.

Editing an existing factor is the same dialog without the sources, without the
QR, and without the confirmation: the secret is never re-read or re-shown, only
the issuer, account, group and parameters can change.

登記對話框接受六種來源：喺本機整、貼 `otpauth://` 連結、自己打 base32、讀圖檔、讀剪貼
簿、用鏡頭掃。六條路最後都行同一個確認：打返一個而家嘅密碼，夾到先至存低。冇呢一步嘅
話，掃錯咗嘅密鑰一樣會靚靚哋存住、出到靚靚哋嘅數字，但全世界都唔收——而你要到登入嗰
陣先發現，仲要冇任何錯誤訊息可以睇。

### The QR / 個 QR

The symbol is encoded by `encodeQr` (byte mode, error-correction level M by
default, versions 1–20) and painted as SVG rectangles. Three properties are
load-bearing rather than decorative:

- **It is never themed.** The modules are `#000000` on a `#ffffff` plate in both
  light and dark mode. A QR tinted to match a dark surface is a QR scanners
  refuse, and the failure looks like a broken camera rather than a styling
  decision.
- **The quiet zone is real** — four light modules on every side, inside the
  plate, exactly as ISO/IEC 18004 requires. A symbol flush to the edge of a card
  is the most common reason a hand-rolled QR "does not scan".
- **The module size has a floor.** The rendered size is never smaller than three
  CSS pixels per module, whatever box the caller asked for.

The text alternative names the account, the issuer and the parameters, so a
screen-reader user is told the QR and the grouped base32 beside it are the same
thing.

### The list / 個清單

Each row shows the current code in large grouped digits (a read-only text box,
so it can be selected by click rather than by a drag-and-hope), a peek at the
next code, and a countdown. The countdown always has a text equivalent in
seconds and is never colour-only or motion-only. The code region is an
`aria-live="polite"` region carrying the code and nothing else, so it speaks
once per time step rather than reading a number at the user every second.

A factor whose secret is not in the credential vault — a restored record whose
key is gone, for instance — renders as unable to produce a code and says so,
rather than showing a blank cell that reads as a bug.

Registered factors can also answer the app's for-fun appearance and tab locks.
The lock setup surface stores only the selected authenticator entry id in the
lock record. At renderer startup the lock adapter keeps the entry metadata
available for lookup and asks the existing credential-vault boundary for the
secret only while verifying a typed code. No secret is copied into the lock
store, authenticator document, history, export, log, or UI. Removing or
restoring an entry therefore leaves an OTP lock unavailable when its vault key
is absent, with a recovery message instead of a guessed or empty code path.
The authenticator settings surface publishes the public metadata snapshot after
each mutation, so a factor registered after startup can answer a newly created
lock without restarting the app.

The list carries what this project asks of every list: a search bar wired to the
full regex builder, group chips composed with the query, multi-select by click,
shift-click and keyboard, an honestly-scoped select-all, an inverse selection,
reordering, grouping through a `Move… into group…` picker, and bulk delete and
export scoped to the selection or the filter.

### Clock skew / 時鐘偏差

Codes come from the system clock. When the app can compare that clock against a
reference it trusts, `assessTotpClock` reports the offset and whether it exceeds
half a time step — the point past which the server's own ±1-step window stops
overlapping. The surface states the exact offset in seconds and says to fix the
system time. When nothing has been compared, it says the clock is **unverified**
rather than fine: a check nobody ran is not a check that passed.

There is deliberately no network time lookup. This app makes no runtime network
requests, and a silent one to a time server would be exactly that.

密碼係跟系統時鐘計。有得同可信參考對嗰陣，App 會講清楚差咗幾多秒、超唔超出容忍範圍；
未對過就直接講「未驗證」，唔會扮冇事。呢度特登冇去對時伺服器攞時間——因為呢個 App 唔
會喺執行期發任何網絡請求。

## Configuration / 設定

| Setting | Default | Provenance |
| --- | --- | --- |
| Algorithm | `SHA1` | Shipped default; overridden per factor by an `otpauth://` link |
| Digits | `6` | Shipped default; 6–8 accepted |
| Period | `30` seconds | Shipped default; 1–86 400 accepted |
| Error-correction level for the pairing QR | `M` | Shipped default |
| Quiet zone | 4 modules | ISO/IEC 18004 requirement, not a preference |

Both the list and the registration dialog carry their explanation behind
progressive disclosure and a truthful default-provenance line beside it. The
registration dialog distinguishes **Default in use** from **Set by the issuer**,
so a user can tell whether a parameter came from the app's own defaults or from
the link they pasted.

## Security considerations / 保安考慮

- **The secret only ever lives in the operating-system credential vault**, under
  the service name `Desktop Material - Authenticator` (dev builds keep their own
  drawer) and the entry's own id. It is not in the settings document, an export,
  a log, a screenshot, telemetry, the app's local Git history, or Git.
- **The settings document has no secret field at all.** That is asserted by a
  test rather than left as an intention: the document is versioned into the
  app's local Git history, so a field that crept in would be committed.
- **The generated secret is revealed once, deliberately.** It is hidden by
  default behind an explicit *Show the secret* action, for the case where
  somebody is pairing by hand rather than scanning. After it reaches the vault
  neither the app nor anybody working on it displays, hints at, or characterises
  its value, length or composition — and there is no read-back-for-display path
  in `secret-vault.ts` to make that possible.
- **Ordinary exports omit every secret and say so.** Each format carries a
  `secret` column reading `omitted`; every format with somewhere to put a
  comment also carries the sentence in words. JSONL, CSV and TSV are the three
  that do not, because a comment line breaks the parsers that read them — there
  the column itself is the statement.
- **The secrets export is a separate, separately-named action behind the shared
  destructive-action gate** (`authenticator-secrets-export`), and shares no code
  path with the ordinary export. No menu item, keyboard shortcut or bulk action
  can reach it by accident. It states before it runs that the file will hold
  usable second factors in the clear.
- **Bulk deletion is gated too** (`authenticator-bulk-delete`), because it
  destroys secrets nothing can bring back. Deleting a single row is not gated;
  that path is one row with a toast.
- **A vault deletion that fails is reported by name.** `deleteAuthenticatorSecrets`
  returns the ids it could not clear, so a bulk delete cannot claim a clean sweep
  while the keys are still on the machine.
- **The QR is drawn in-process.** Sending an `otpauth://` URI to a QR web service
  would hand the shared key to a stranger's server on the way to drawing it.
- **The camera stream is stopped** on the first successful decode, on *Stop the
  camera*, and when the dialog unmounts, so the platform's recording indicator
  goes out with the dialog.

## Failure modes / 失敗情況

| Situation | What happens |
| --- | --- |
| A pasted link is not `otpauth://totp/` | The dialog names the reason — wrong scheme, counter-based factor, invalid base32, no account name |
| An image contains no QR | "No QR was found in that image." |
| A QR is found but the grid cannot be read | "Hold the code square to the lens and try again." The decoder's geometry is affine: rotation and mild shear are handled, a steep photographic angle is not |
| A QR is found but too damaged for Reed–Solomon | Reported as too damaged, never mis-corrected into a plausible-looking wrong secret |
| A QR carries Kanji or a structured-append header | Reported as unsupported content rather than returning half a URI |
| The machine has no camera | The camera control is disabled and says so, pointing at the image-file route |
| Camera access is refused | Stated plainly, pointing at the image-file route |
| The pairing code does not match | The factor is not stored; the message names both likely causes, the code and the clock |
| A factor's vault key is gone | The row says the factor cannot produce a code and to register it again |
| The credential vault refuses a delete | The record still goes, and the toast names how many secrets are still on the machine |
| The pairing link is too long to encode | The QR is not drawn and the encoder's own message is shown verbatim |

## Verification / 驗證

The RFC vectors are the acceptance gate, because a subtly wrong authenticator
produces confidently formatted digits that every server refuses with no error to
read.

- `app/test/unit/authenticator-totp-test.ts` — all ten RFC 4226 HOTP vectors,
  all eighteen RFC 6238 TOTP vectors at eight digits, the same eighteen
  truncated to six, counter handling past 2^53, the pairing-verification window,
  base32 round trips and its truncation guard, and `otpauth://` round trips with
  every named parse failure.
- `app/test/unit/authenticator-qr-test.ts` — every block-layout row checked
  against ISO/IEC 18004's own module-count formula (a check derived from the
  symbol geometry, so a mistyped table cannot satisfy both), the published
  format and version information words, Reed–Solomon correction to the code's
  full capacity and honest failure past it, round trips through all eight masks
  at all four error-correction levels and at every supported version, damage
  tolerance, and decoding a rendered image at several scales.
- `app/test/unit/authenticator-entries-test.ts` — document validation and
  normalization, the assertion that no record carries a secret, the
  credential-vault boundary including a failing delete, list filtering, and the
  export contract in all nine formats.
- `app/test/unit/md3-authenticator-view-test.tsx` — the rendered surface: the
  named grid, the code matching the RFC value at a pinned instant, the countdown
  text equivalent, the live region carrying the code and never the countdown,
  the missing-secret row, the clock states, the search field and its regex
  builder, selection and bulk actions, and the registration flow refusing to
  commit until a code matches.

Run them with `node script/test.mjs app/test/unit/authenticator-totp-test.ts
app/test/unit/authenticator-qr-test.ts
app/test/unit/authenticator-entries-test.ts
app/test/unit/md3-authenticator-view-test.tsx`.

## Suggested articles / 建議閱讀

- [Collection bulk actions and regex safety](collection-bulk-and-regex-safety.md)
  — the bulk-selection and regex-builder contract this list implements.
- [Support Tickets: the local recovery desk](support-tickets.md) — the
  self-service route back in after losing a for-fun lock's credential, which is
  the neighbouring surface an OTP factor is most often used with.
- [Settings search](settings-search.md) — how the app's settings surfaces expose
  their own search fields.
