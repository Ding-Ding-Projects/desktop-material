# Clone progress and Windows long-path repair

## September 6, 2026

The direct-clone mutex deferred registration of the temporary repository until
after `AppStore._clone` had synchronously looked it up. Selection consequently
received `undefined`, rendering "No repository selected" during cloning.
Registration now happens before queueing, while journal and Git operations stay
serialized. The same temporary model is passed into the queued operation.

Windows clone commands now set `core.longpaths=true` both on the invoking Git
process, for recursive operations, and through clone's `--config`, for the
resulting repository. Global Git configuration is unchanged.

## Verification

`node script/test.mjs app/test/unit/cloning-repositories-store-test.ts app/test/unit/cloning-repositories-account-test.ts app/test/unit/cloning-repositories-staging-test.ts app/test/unit/git/clone-test.ts app/test/unit/ui/cloning-repository-view-render-test.tsx`

39 tests passed across five files, with zero failures or skips:

| File | Tests |
| --- | ---: |
| `cloning-repositories-store-test.ts` | 5 |
| `cloning-repositories-account-test.ts` | 2 |
| `cloning-repositories-staging-test.ts` | 15 |
| `git/clone-test.ts` | 14 |
| `ui/cloning-repository-view-render-test.tsx` | 3 |

Removing the long-path arguments reproduced `Filename too long` in the new
real-Git checkout regression. Restoring them returned the focused tests to green.
An independent read-only review found no introduced correctness defect.

The previous installer run `33822411314` and Windows CI run `33821945423`
failed with TS2345 in `script/draft-release/run.ts:173`. Release drafting now
awaits Prettier before writing JSON and before printing its formatted fallback
instructions. `yarn compile:script` passes with that correction.

Issue [225](https://github.com/Ding-Ding-Projects/desktop-material/issues/225)
and Discussion [226](https://github.com/Ding-Ding-Projects/desktop-material/discussions/226)
track this repair. Project discovery is unavailable because the active CLI
authorization lacks `read:project`; no Project state was changed.

The development compile, built-interface interaction, release, and integration
are not yet verified. An initial build overlapped the deliberate regression
mutation and was stopped; it is not evidence. The replacement compile uses the
restored source. The legacy headless HTTP endpoint refused connections; the
installed direct cheap headless CLI is available for the runtime phase.

複製暫存儲存庫而家會先登記，再排隊，進度唔會因為等候鎖而消失。
Windows 長路徑設定只影響今次 Git 操作同新儲存庫，唔會改全域設定。
五個檔案共 39 個測試通過；實際介面、發佈同整合證明仍然待辦。
