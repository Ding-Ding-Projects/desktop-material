# Direct clone recovery

Direct cloning records a recovery journal before creating its staging directory.
If the application stops between those operations, a stale record can survive
even though no clone data was staged. An occupied destination must never be
deleted merely to make that record disappear.

On restart and before a subsequent direct clone, recovery first follows the
existing verified-promotion cleanup and owned-staging discard paths. If recovery
instead requires review, the application may clear only the stale journal after
proving all of the following:

- The destination's parent and any existing destination are ordinary canonical
  directories, without linked ancestry.
- No recovery root exists. The staging container is absent, a canonical empty
  markerless directory, or a canonical directory containing only the valid
  versioned container ownership marker.
- Any existing `.git` directory is ordinary and canonical.
- No promotion marker exists, including an invalid marker.

The absence checks are repeated before accepting the proof. An inspection error
or ambiguous filesystem state retains the journal and recovery data. Clearing
the stale journal does not remove, modify, or adopt the occupied destination.
Cloning into an occupied directory still requires choosing an available path.

A new clone may initialize a canonical empty markerless staging container by
exclusively creating its ownership marker. It checks directory identity,
canonical ancestry, marker validity, and permitted entries again before creating
the recovery root. An exclusive-creation race is accepted only after the
resulting state passes those same checks. Existing marked containers may contain
other ordinary recovery roots for concurrent batch clones. Unknown contents,
invalid markers, links, unreadable state, and changed identities require review;
none is recursively deleted to make cloning proceed.

When retained recovery blocks another direct clone, the error distinguishes the
retained repository name and path from the requested clone. The requested clone
has not started. **Check recovery and retry** serializes another recovery
inspection before retrying that requested clone. Startup recovery offers the
same inspection action for its retained item. Ordinary network or authentication
clone errors keep their existing retry action. Early rejection never discards a
new staging identity before its own journal has been acquired.

## Verification

`app/test/unit/cloning-repositories-staging-test.ts` exercises restart and
subsequent-clone recovery with real temporary directories. Sentinel files prove
that occupied destinations remain unchanged. Additional cases retain ambiguous
staging roots, promotion markers, and linked parents. The existing successful
promotion and interrupted-staging recovery checks remain in place.
`batch-clone-staging-container-test.ts` covers invalid markers, concurrent owned
roots, unknown contents, exclusive marker races, and data arriving during marker
creation. `app-error-clone-recovery-test.tsx` verifies the distinct action label,
requested/retained identities, unchanged retry payload, and translations.

## 廣東話

直接複製會先寫復原紀錄，再建立暫存目錄。如果兩步之間程式停止，可能留下
沒有暫存資料的舊紀錄。只有確認沒有暫存或提升標記，而且路徑沒有連結或其他
歧義，才會清除紀錄本身。現有目的地的檔案不會被刪除或修改；有疑問就保留
復原資料。原有已驗證的復原流程保持不變。

## October 15, 2026: resource-boundary preservation

The source repair is integrated on main. Normal release
[v4.0.134701](https://github.com/Ding-Ding-Projects/desktop-material/releases/tag/v4.0.134701)
is bound by both its tag and target to
`cc4c89c168cb129be77defc2a7e16f8e1540ad25`. Its publisher and matching Windows,
Linux and documentation runs succeeded. Downloaded unsigned Squirrel setup,
full package and RELEASES bytes match their published digests; the RELEASES
package SHA-1 and size also match. Both exact local root build entrypoints passed.

The completed private matrix covers 48 unique presentation tuples and 96
inspected originals: 1440 by 960 and 960 by 660 CSS viewports, three language
modes, two themes and four actual process raster scales. Real blocked/rechecked
actions preserved the journal and sentinel; resolved clones and the exact
empty-container variant passed independent filesystem proofs. Native operating-
system display-setting changes and native keyboard/pointer delivery were not
verified. The originals contain host-identifying synthetic paths and remain
private; no current recovery image was published or presented as public evidence.

The existing application was closed normally after explicit authorization. A
restricted full current-profile recovery copy passed stable-source and hash
verification. **The installer and actual-profile acceptance launch have not
started.** The prior installation remains unchanged and closed. Installation,
production journal clearance and opening the existing requested repository
without replacement remain the next work after authorized resumption.

All reviewed source contributions are durable on main. One earlier synthetic
process remains after a normal close, with no eligible application window; its
server is absent. Its private run and immutable executable remain retained.
Task-owned cleanup requires a verified complete archive and ancestry proof;
active, unrelated and uncertain work remains retained.

廣東話交接：來源修正同正常版本已發佈，48 組畫面同 96 張原始圖片驗證完成，
但原圖有合成路徑內嘅主機身份資料，所以只作私人證據。原有程式經明確批准正常
關閉，設定檔亦已完整備份及核對。安裝同實際設定檔驗收未開始，唔會將套件成功
當成安裝成功；之後要用已驗證嘅 Squirrel 套件，再經原有新增或開啟流程處理現有
資料夾，唔可以複製覆蓋佢。
