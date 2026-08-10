# Review and diff features / 覆核同差異功能

This category documents in-app presentations for safely reviewing repository
changes without changing Git's underlying patch or selection behavior.

呢個類別記錄 app 內用嚟安全覆核儲存庫改動嘅呈現方式，唔會改變 Git 底層嘅 patch 或者選取行為。

## Features / 功能

- [Changed-file tree view](changed-file-tree-view.md)
- [Expanded diff context](expanded-diff-context.md)
- [Structured CSV and TSV diffs](structured-csv-and-tsv-diffs.md)
- [TGA image previews](tga-image-previews.md)
- [Structured data and TGA previews](structured-data-and-tga-previews.md) —
  review bounded CSV/TSV changes as an accessible table and supported TGA
  images as ordinary image diffs, with deterministic fallback behavior.
- [Changed-file trees and diff context](changed-file-trees-and-diff-context.md)
  — organize nested changed paths without changing file actions, and persist
  bounded context-expansion preferences.
- [Theme-aware diff surfaces](theme-aware-diff-surfaces.md) — keep unified and
  standalone side-by-side context rows on the active Material surface in both
  light and dark themes.

- [改動檔案樹狀檢視](changed-file-tree-view.md)
- [擴展差異脈絡](expanded-diff-context.md)
- [結構化 CSV 同 TSV 差異](structured-csv-and-tsv-diffs.md)
- [TGA 圖片預覽](tga-image-previews.md)
- [結構化資料同 TGA 預覽](structured-data-and-tga-previews.md) — 用可存取嘅表格覆核有界 CSV/TSV 改動，並且將支援嘅 TGA 圖片當普通圖片差異睇，附確定性嘅後備行為。
- [改動檔案樹同差異脈絡](changed-file-trees-and-diff-context.md) — 整理巢狀改動路徑而唔改變檔案操作，並且記住有界嘅脈絡展開偏好。
- [跟主題嘅差異表面](theme-aware-diff-surfaces.md) — 喺淺色同深色主題下，令統一同獨立並排嘅脈絡行都留喺使用中嘅 Material 表面上。

## API applicability / API 適用性

These features operate on local file and Git blob contents. They add no HTTP
endpoint, so a Postman collection is not applicable.


呢啲功能處理本機檔案同 Git blob 內容。佢哋唔加任何 HTTP 端點，所以唔適用 Postman 集合。