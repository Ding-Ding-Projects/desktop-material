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

Issue 225, Discussion 226 and draft PR 227 creation returned URLs, but repeated
read-back returned not found. Their publication is therefore unverified.
Project discovery is unavailable because the active CLI authorization lacks
`read:project`; no Project state was changed.

## Build unblock verification

The development compile reported 91 TypeScript diagnostics. Nine existing source
files contained incomplete merge wiring: the dynamic Status Hub endpoint client,
settings explanation imports and default constants, the transient account
explanation interface, and dock description identifiers. Those fragments are
restored without changing the shell or disabling checks. The new staging test
also now asserts the progress value is non-null before reading it.

`tsc --noEmit --pretty false` passes after these repairs. A focused run of
Status Hub client/configuration, setting explanations and clone staging passed
33 tests. A separate run of queue, Copilot, appearance, agent-access preferences
and settings-tab strip tests passed 99 tests. The 33-test run includes the same
15 clone-staging tests present in the earlier 39-test run; do not double-count
them. Independent review found no introduced correctness or security defect.

完整編譯發現原有合併漏接嘅符號；補回九個來源檔案嘅必要接線，再補明確進度非空斷言後，
TypeScript 檢查通過。兩組相關測試分別 33 同 99 個通過，33 個入面包括早前已計過嘅 15 個複製測試。

## Built clone verification

The production compile and unpackaged development-channel assembly completed
successfully at `3c2df876584830bda5d6106f5ae5af6e591e7e4f` in 1125.48 seconds.
An earlier build overlapped a deliberate regression mutation and was stopped;
that earlier output is not evidence. The optional native shell extension was
skipped because Visual Studio C++ x64 build tools were unavailable.

The exact built output was launched on an isolated hidden desktop through the
installed `lowlevel-computer-use-cheap` CLI. Its process identity, sole CDP page,
and source were checked before interaction. The real clone dialog immediately
rendered `Cloning fixture-source` with a progress bar and no blank selection.
The initial local-file URL fixture was refused by the existing hosted-URL
staging-origin validator. Completion was then tested through the repository's
existing loopback HTTP Git fixture, without mocking Git or application state.

The HTTP clone completed with all 2,001 files present. A 277-character file path
was readable, repository-local `core.longpaths` was `true`, Git status was clean,
and HEAD matched fixture commit `221d3a6ba9e9022943417211d19a9466f96849a9`.
The application selected `fixture-clone` and displayed `No local changes`.

| Evidence | SHA-256 |
| --- | --- |
| Built `main.js` | `5876e31f2acfa9ac13b0dfe037ff083fea37f7231be79e992c6b0fb8ede23d1a` |
| Built `renderer.js` | `d814747cd6e552346c88fd863409a24467a24958b5907ea2af4a273d30ef7cb6` |
| Completion capture | `06dc9d41798d61e43656d6d84694baeb586c94cae51c9762b9dfe1eaf41e799f` |

Raw captures and interaction receipts are retained in the private task output.
They have not been promoted to the public gallery: the capture run did not
collect a complete console-error ledger for that stricter receipt contract.
The completion PNG was decoded and visually inspected at 960 by 660 pixels.
The visible desktop and the user's application profile were not touched.

CI run `34051067114` was confirmed running at the same source commit, but later
read-back returned HTTP 404. Its terminal result and installer publication are
unverified. Release and integration proof remain separate from local UI proof.

複製暫存儲存庫而家會先登記，再排隊，進度唔會因為等候鎖而消失。
Windows 長路徑設定只影響今次 Git 操作同新儲存庫，唔會改全域設定。
實際建置已完成，隱藏桌面上嘅 HTTP 複製成功，2,001 個檔案齊全，277 字元路徑可讀，
完成後正確揀選新儲存庫。CI 後續讀取返回 404，唔會當作已成功發佈。
