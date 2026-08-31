# Progressive settings explanations and provenance

Desktop Material is adding one shared presentation contract for settings:
every setting needs a full behavioral explanation behind progressive
disclosure and a factual provenance line that names the current value, the
shipped value, and where the current value came from.

This article records the foundation and its current coverage. It does not
claim that every settings control is covered yet. The canonical completeness
ledger therefore keeps `settings-explanations` pending until the remaining
controls, built interaction, and capture evidence are complete.

## Behavior

`SettingExplanation` renders two independent pieces of information:

1. A collapsed `<details>` disclosure whose summary is localized as “What this
   setting changes.” Opening it reveals behavior, not a restatement of the
   label.
2. A provenance paragraph that remains visible. It distinguishes a compiled
   fallback, a stored choice, a runtime-only value, and a credential-vault
   value. The line names the actual current and shipped values.

The setting control uses both element IDs in `aria-describedby`. Assistive
technology therefore receives the explanation and provenance even when the
visual disclosure remains collapsed.

## Current hand-written inventory

The first implementation slice covers eleven controls:

| Area | Settings |
| --- | --- |
| Accessibility | Underline links, diff check marks |
| Attention accommodations | Focus, Low stimulation, Time awareness, One thing at a time, Momentum, Next action, Momentum defer interval |
| Status Hub | HTTPS endpoint, write-only authorization replacement |

`ImplementedSettingExplanationIds` lists every covered control explicitly.
The focused test removes `status-hub-endpoint` from a copy of that list and
requires the inventory assertion to fail before checking the restored list.
Discovery alone is not accepted because a missing control would also disappear
from discovery.

## Provenance semantics

### Attention accommodations

The normalized value cannot reveal its source. An explicitly saved all-off
profile is identical to the shipped all-off object. The model therefore checks
whether the versioned local-storage key exists:

- absent key: compiled fallback, current and shipped value `off`;
- present key: stored choice, current value `on` or `off`, shipped value `off`.

The one user-entered next action reports whether its bounded text is empty or
saved. The defer-interval selector is deliberately runtime-only and says so;
its current and shipped value is 30 minutes until the user changes it for the
current settings session.

### Status Hub

The endpoint response uses `null` to distinguish the unconfigured compiled
fallback from a stored endpoint. Authorization is write-only: the renderer
receives only a presence boolean, reports credential-vault provenance, and
never receives or repeats the stored value.

## Localization and accessibility

The initial controls provide English, playful Hong Kong Cantonese, and compact
bilingual rendering through the existing language mode. Values and source
facts do not change with tone. The summary has a minimum keyboard/touch target,
the native disclosure remains keyboard-operable, and the control references
both description IDs.

## Persistence

The component stores nothing. Each owning setting continues to use its real
storage boundary. Attention provenance reads the existing local-storage key;
Status Hub provenance reads the existing main-process configuration response
and credential-presence boolean. No explanation text is copied into settings
data.

## Failure modes

| Situation | Behavior |
| --- | --- |
| Local storage is unavailable | Attention values and provenance fail closed to the compiled all-off fallback. |
| A saved attention record is malformed | The existing bounded coercion restores safe values; provenance still says a record exists rather than calling it a default. |
| Status Hub configuration has not loaded | Controls remain disabled and show the unconfigured fallback until the real response arrives. |
| Credential-vault value exists | Only presence is reported; the value is never read into the renderer or explanation. |
| A covered ID disappears | The hand-written inventory assertion fails. |

## Security considerations

- Explanation and provenance copy contain no secret material.
- Credential provenance is presence-only and never characterizes the stored
  authorization value.
- Endpoint provenance may display the owner-selected endpoint because the same
  value is already visible in its editable field.
- No network request is added by the explanation component.

## Verification

Focused coverage lives in:

- `app/test/unit/settings-explanation-test.tsx`;
- `app/test/unit/attention-accommodation-test.tsx`; and
- `app/test/unit/ui/status-hub-owner-settings-test.tsx`.

The focused slice verifies collapsed disclosure, stable description IDs,
machine-readable provenance categories, compiled-versus-stored accessibility
and attention state, runtime-only defer provenance, endpoint provenance,
write-only credential provenance, all eleven inventory IDs, and the deliberate
red inventory mutation.

Built-artifact interaction and capture evidence remain pending until the
complete settings inventory is implemented. Source-only verification is not
promoted as complete feature evidence.

## Suggested articles

- [Attention accommodations](attention-accommodations.md)
- [Status Hub projection](status-hub.md)
- [Universal-feature completeness inventory](universal-feature-completeness-inventory.md)

---

# 漸進式設定說明同來源

Desktop Material 正加入一套共用設定呈現合約：每個設定都要有收喺漸進式披露入面嘅
完整行為說明，亦要有一行照直講清楚目前值、出廠值同目前值來源嘅文字。

呢篇文章記錄基礎同目前覆蓋範圍，唔會扮成全部設定已經完成。完整性清單會繼續將
`settings-explanations` 留喺 pending，直到其餘控制項、已建置程式互動同畫面證據都完成。

`SettingExplanation` 會渲染兩部分：原生 `<details>` 收埋真正行為說明，而來源句會
一直顯示，分清楚編譯時後備值、已儲存選擇、只限今次工作階段嘅值，同憑證保險箱值。
控制項嘅 `aria-describedby` 會同時指住說明同來源，所以視覺上收埋咗說明，輔助技術
仍然收到完整資料。

第一批手寫清單有十一個控制項：連結底線、diff 剔號、五個專注調節、下一步、動力提示延後時間、Status Hub
endpoint 同只寫不讀嘅授權更換欄。測試會刻意由清單移除一項，確認會變紅，還原先再
驗證綠色。目前只係基礎切片，未完成嘅控制項同已建置程式證據仍然唔會當完成。
