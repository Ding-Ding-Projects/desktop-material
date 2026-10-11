# October 2026 feature contract review

Reviewed on October 11, 2026 against Desktop Material source
`e20a3c8357bfdb2a1837f80b5a37ee5244d713cc`.
This review records required implementation and acceptance work. It does not
claim that the features below have been added or that historical evidence
verifies the current package. The installed-startup repair remains active.

## Required additions and current coverage

| Requirement | Existing implementation | Required work and acceptance |
| --- | --- | --- |
| Complete **Animation and Transition** authoring in every per-element appearance editor | The workspace editor offers a system/reduced motion preference. The shared editor shell has a header, history action and content area. | Add target-, layer- and state-bound motion tracks, all supported renderer properties, keyframes, timing/easing, timeline/playback, transitions/triggers, sequencing and interruption behavior. Keep unsupported capabilities visible with exact reasons. Bind persistence, undo/history, presets and versioned import/export to real renderer consumers. Verify reduced-motion rendering separately from authored values, negative omissions, actual timed rendering and each capability in the built application and hosted documentation surface. |
| Optional guidance above each capable interactive control and unique contextual help | Specific workflows have specialized wizards, and settings have progressive explanations with stable description IDs. | Add a hand-written per-element guidance and control-complexity inventory, an optional above-control entry and appropriate simple/full guided steps, authoritative concept/help IDs and unique target-specific explanations. Direct and guided routes must share validation, permissions, confirmation, action and history. Verify Back, Cancel, interrupted recovery, unavailable inputs, localized search/palette help, non-reopening behavior and negative omissions/duplicate generic explanations. Include read-only values and the guidance controls themselves where capable. |
| Complete current-presentation image and reference inventory | Historical screenshot refreshes, design-parity tools and explicit missing-evidence records exist. | Inventory current references across the application, hosted site, README, articles, wiki, gallery, downloads and interface-changing releases. Capture and inspect the intended rebuilt source, bind every image to source/package/state/language/theme/viewport/scale/method/privacy/date provenance, verify delivered routes and add a stale-current-reference negative regression. Retain historical originals and their original provenance. Missing current captures remain explicit gaps. |
| Full Minecraft server creator, installer and manager | No Minecraft or Bedrock implementation was found in the bounded production-source search. The existing self-hosted collaboration wizard provisions a different service. | Implement Java/Bedrock distribution discovery without a curated version ceiling, version-bound capability/configuration descriptors and four independently verified targets: local Windows process, local Docker, SSH process and SSH Docker. Cover creation/adoption, flavour/runtime/extension installation, lifecycle and scheduling, logs/health, worlds/backups/restore/migration, players/permissions, networking, packs, commands and update/rollback. Use typed rich controls, transactional writes, compatibility/provenance checks and truthful unavailable states. Maintain edition/version/flavour/target/extension matrices and real built-GUI acceptance at each distinct boundary. |

The four additions above are incomplete. Existing preferences, specialized
wizards, version selectors or static documentation cannot establish their full
implementation or runtime acceptance.

## Existing schema alignment still required

The local personal-vocabulary loader has an older, separate alignment gap:

| Bound | Current production source | Required behavior |
| --- | --- | --- |
| UTF-8 input | 1 MiB | 256 KiB |
| Entry count | Fixed ceiling of 2,000 | No fixed entry-count ceiling; retain the bounded schema and input-size limit |
| Key length | 200 JavaScript string units | 160 Unicode code points |
| Replacement length | 500 JavaScript string units | 1,000 Unicode code points |
| Nesting | Full schema/depth reconciliation remains unverified | Maximum depth 8, complete validation before application or caching |

Do not remove resource limits while removing the fixed entry ceiling. Update
validation, rejection copy, cache handling and focused tests together. Verify
duplicate keys, malformed UTF-8/JSON, schema versions, every boundary, no partial
application, replace/clear, original-wording restoration and local-only behavior.
No private input was loaded, retained in this document or disclosed by this review.

## Source references

- [Shared appearance editor shell](https://github.com/Ding-Ding-Projects/desktop-material/blob/e20a3c8357bfdb2a1837f80b5a37ee5244d713cc/app/src/ui/appearance/appearance-editor-panel.tsx), lines 37-66.
- [Workspace appearance controls](https://github.com/Ding-Ding-Projects/desktop-material/blob/e20a3c8357bfdb2a1837f80b5a37ee5244d713cc/app/src/ui/appearance/element-appearance-editors.tsx), lines 94-107 and 126-186.
- [Appearance schema](https://github.com/Ding-Ding-Projects/desktop-material/blob/e20a3c8357bfdb2a1837f80b5a37ee5244d713cc/app/src/models/appearance-customization.ts), motion preference at line 34.
- [Progressive setting explanations](https://github.com/Ding-Ding-Projects/desktop-material/blob/e20a3c8357bfdb2a1837f80b5a37ee5244d713cc/app/src/ui/preferences/settings-explanation.tsx), lines 44-75.
- [Explicit setting explanation inventory](https://github.com/Ding-Ding-Projects/desktop-material/blob/e20a3c8357bfdb2a1837f80b5a37ee5244d713cc/app/src/ui/preferences/settings-explanation-inventory.ts).
- [Existing self-hosted collaboration wizard](https://ding-ding-projects.github.io/desktop-material/docs/features/collaboration/self-hosted-server-wizard.html).
- [Local personal-vocabulary validation](https://github.com/Ding-Ding-Projects/desktop-material/blob/e20a3c8357bfdb2a1837f80b5a37ee5244d713cc/app/src/lib/personal-vocabulary.ts), limits at lines 37-40 and entry-count rejection at lines 139-142.
- [Personal-vocabulary regression tests](https://github.com/Ding-Ding-Projects/desktop-material/blob/e20a3c8357bfdb2a1837f80b5a37ee5244d713cc/app/test/unit/personal-vocabulary-test.ts).
- [Feature completeness evidence contract](https://ding-ding-projects.github.io/desktop-material/docs/features/design-system/universal-feature-completeness-inventory.html).

The bounded search inspected `app/src`, `app/test`, `script`, `services` and
`docs/features`, excluding generated documentation bundles. It found no
Minecraft/Bedrock manager or universal motion/guidance implementation matching
the new contracts. The concrete appearance controls above independently show
incomplete universal coverage; a search result alone is not runtime proof.

The existing feature-completeness manifest has 62 product-family identifiers.
Its identifiers and scope differ from the broader requirements catalogue, so
subtracting the two counts would not produce a valid missing-feature count.
Reconcile explicit requirements and surfaces rather than changing a number.

## Evidence boundaries

- The [September screenshot refresh](https://ding-ding-projects.github.io/desktop-material/docs/verification/screenshot-refresh-20260903/index.html)
  records source `d2999c62`, 52 captures, 16 skipped scenes and 79 of 131 gallery
  images outside that refresh. It is historical evidence with that exact scope.
- The [design-parity report](https://ding-ding-projects.github.io/desktop-material/docs/verification/design-parity/index.html) records
  source `b174c923`, a measured 80.6136363% pixel difference and 54 reachable
  reference routes without complete promoted capture coverage. This remains an
  explicit gap rather than current-source acceptance.
- The complete mirrored wiki now has 14 articles plus its index, 95 checked
  internal links/anchors and 115 source-byte-verified images on the live site.
  Content and delivery verification does not refresh those historical captures
  or establish full interactive/layout acceptance.
- Server reference research records unresolved historical distributions,
  runtime mappings and command/API coverage. Reference research is separate
  from implemented adapters, installation, runtime and GUI acceptance.

## Implementation order and completion criteria

1. Finish installed-startup acceptance and preserve the existing user profile.
2. Align the bounded local schema and add explicit guidance/motion capability
   inventories before implementing their shared components.
3. Implement the required appearance and guidance workflows through their
   real consumers, then complete built behavior, accessibility, localization
   and layout verification.
4. Scope the server manager as its own substantial implementation with exact
   target ownership, official version sources, typed descriptors and recovery.
5. Rebuild and refresh all current presentation references after interface
   delivery, keeping historical evidence separate.

Each item stays incomplete until its actual implementation and required
acceptance are verified. This review adds no placeholder controls, enabled
empty features or optimistic completion ticks.

## 廣東話核對摘要

今次只核對新要求同現有程式，未將未完成嘅功能扮成已交付。
外觀編輯器而家只有跟隨系統／減少動態嘅選擇，完整動畫同轉場編輯仍未有；
個別精靈同設定說明亦未覆蓋每個可用控制項。
Minecraft 伺服器管理需要四種執行目標、完整版本來源、真正設定控制同復原流程，
現有協作伺服器精靈做緊另一件事。

個人詞彙檔仍有舊嘅固定條目上限同大小限制，需要一併校正驗證、提示同測試，
唔可以為咗移除條目上限而拆走所有資源限制。
舊畫面保留原本來源同日期；新版本嘅現時展示畫面要重新擷取、檢查同驗證。
啟動修復同現有資料保留仍然係進行中嘅工作。
