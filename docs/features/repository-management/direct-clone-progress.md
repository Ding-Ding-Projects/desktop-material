# Direct clone progress and long paths

Direct clones register their repository and initial progress before waiting for
the recovery queue. Selecting the new tab therefore has a valid clone state
immediately. Git, staging, and recovery journal operations remain serialized.

On Windows, cloning enables Git's long-path support for the operation and saves
it in the new repository. This covers checkout beneath the staging directory
without changing the user's global Git configuration. It does not remove
filesystem limits on individual filename components or make other tools support
long paths.

Existing destination protection, account selection, cancellation, and recovery
checks remain in force. A failed clone continues through the existing retry
dialog. Do not delete an existing destination to retry without reviewing its
contents and the recovery state.

Focused regressions cover immediate progress registration, queued clone
identities, serialized staging, and real Git checkout of a long path. Built
interface and installer verification are separate evidence and are not implied
by these tests.

直接複製會先登記儲存庫同初始進度，再等候復原佇列，所以新分頁即刻有有效狀態。
Windows 複製會為今次操作及新儲存庫啟用 Git 長路徑支援，唔會改全域設定。
檔名本身嘅檔案系統限制仍然適用；現有目的地保護、取消同復原檢查照常保留。
