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
- No staging container or recovery root exists.
- Any existing `.git` directory is ordinary and canonical.
- No promotion marker exists, including an invalid marker.

The absence checks are repeated before accepting the proof. An inspection error
or ambiguous filesystem state retains the journal and recovery data. Clearing
the stale journal does not remove, modify, or adopt the occupied destination.
Cloning into an occupied directory still requires choosing an available path.

## Verification

`app/test/unit/cloning-repositories-staging-test.ts` exercises restart and
subsequent-clone recovery with real temporary directories. Sentinel files prove
that occupied destinations remain unchanged. Additional cases retain ambiguous
staging roots, promotion markers, and linked parents. The existing successful
promotion and interrupted-staging recovery checks remain in place.

## 廣東話

直接複製會先寫復原紀錄，再建立暫存目錄。如果兩步之間程式停止，可能留下
沒有暫存資料的舊紀錄。只有確認沒有暫存或提升標記，而且路徑沒有連結或其他
歧義，才會清除紀錄本身。現有目的地的檔案不會被刪除或修改；有疑問就保留
復原資料。原有已驗證的復原流程保持不變。
