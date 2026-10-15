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
