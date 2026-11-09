# Local file converter

Desktop Material is establishing a local file-converter workspace for files a
person chooses from their own machine. The workspace must identify source bytes
before offering a target, show only conversions backed by a verified local
adapter, and preserve the source file throughout the operation.

The first foundation is intentionally narrow but reachable in **Repository
tools → Local file converter**. It provides a categorized adapter catalog, a
persisted local queue, and privileged byte-signature inspection for user-picked
regular files. It does not claim that a disabled adapter, a conversion target,
or an active conversion is already available or verified.

All eight required categories are visible: Documents/PDF, Images, Audio, Video,
Archives, Structured Data/Spreadsheets, Code/Text, and Binary Encodings. At
this checkpoint every adapter is explicitly unavailable because this installed
application declares no bundled offline conversion engine. PDF inspect, split,
merge, extract, reorder, rotate, and metadata operations therefore remain
visible but disabled with that exact dependency reason.

## Intended workflow

1. Choose a local source through the native file picker.
2. Inspect bounded source bytes rather than trusting the filename extension.
3. Show compatible target formats from the installed-adapter catalog, including
   unavailable entries with their specific missing local dependency.
4. Explain any lossy or metadata-changing effect before the user confirms.
5. Write a validated result to a chosen output location without overwriting an
   existing file silently.
6. Report each queue item as converted, skipped, cancelled, or failed; never
   call a partial batch successful as a whole.

The source file stays unchanged. Conversion is local-only: the converter must
not upload source bytes, output bytes, source paths, or conversion metadata.

## Safety and capability boundaries

An adapter is enabled only when its required executable or library is bundled
with the installed application and its output can be validated. A type that is
known but unavailable remains visible with the exact adapter/dependency gap;
the converter does not guess a target, consult `PATH`, or fall back to a
network service.

Every conversion is bounded by the adapter's safe input, decoded-content,
output, CPU-time, memory, and temporary-storage limits. Unsupported,
malformed, encrypted-without-user-access, or limit-exceeding inputs are left
untouched and receive an explicit status. Outputs are written atomically and
validated before being offered to the user.

Destructive overwrite is a separate decision: it requires the application's
existing destructive-action confirmation rather than being implied by choosing
the same output name.

## User-facing language and accessibility

The shared localization catalog provides the converter's foundational labels
for source selection, adapter discovery, target selection, loss review, local
privacy, queue states, progress, and failure. The workspace must render them in
English, playful Hong Kong-style Cantonese, and bilingual language modes while
keeping source names, formats, byte counts, paths, and operation outcomes
factual.

The completed surface must be keyboard reachable, expose changing queue
progress and status to assistive technology, retain visible focus, and reflow
at narrow widths and high display scale. Its adapter search uses the existing
plain-text-first search convention with the adjacent bounded regex builder.

## Status and verification

This converter foundation was added in the August 21, 2026 ultra-speed lane.
No tests, type checks, builds, packaged interaction, captures, or runtime
converter verification were run in that lane. The generated offline
documentation browser bundle also remains stale until its normal generator
runs.

Before the feature can be described as complete, it needs focused adapter and
queue tests, deliberate negative cases for unbundled adapters and invalid
outputs, accessible built-artifact interaction, and real capture evidence for
source selection, loss disclosure, active conversion, cancellation, partial
batch results, and safe overwrite refusal.

## API applicability

The converter works on local selected files and bundled adapters. It adds no
HTTP endpoint, so a Postman collection is not applicable.

## Quick convert: drop files or folders (November 9, 2026)

The first working adapter is **Base64 text beside the original**, under Binary
Encodings.

- Drop files or folders on **Quick convert** in **Repository tools → Local file
  converter**, or use **Choose files**. The drop is claimed by the converter,
  so a dropped folder is not added as a repository.
- Every regular file is encoded to `name.ext.base64.txt` in the folder it was
  dragged from. A `name.ext.base64.txt` file is decoded back to `name.ext`.
- Folders are expanded. **Include subfolders** (on by default) decides whether
  nested folders are walked; a dropped folder itself is always opened. One drop
  takes at most 5,000 files and says so when it stops there.
- Nothing is overwritten, moved or uploaded. When the result name is taken a
  number is added, for example `data (1).bin` or `photo.png (1).base64.txt`.
- Each result is written to a temporary file, checked, and only then published.
  Encoding is checked by decoding the result and comparing SHA-256 with the
  source. Decoding is strict: whitespace is ignored, and any other character,
  padding before the end or an incomplete length is refused with its offset.
- One failed file never stops the rest. Links, unfinished `.partial` files and
  (when the box is off) subfolders are listed as skipped with the reason.

Conversions run one after another in the privileged process
(`app/src/main-process/file-converter-drop.ts`); the rules are in
`app/src/lib/file-converter-drop.ts`. Other categories still have no adapter
and are not offered.

Verification: `app/test/unit/file-converter-drop-test.ts` (7 tests, including a
real round trip on disk) and
`app/test/unit/ui/file-converter-quick-convert-test.tsx` pass on Linux, and the
TypeScript check passes. The built Windows application has not been checked and
no capture exists yet.

廣東話：將檔案或者成個資料夾掟落「Quick convert」，每個檔案會喺原本個資料夾變成
Base64 文字檔，`.base64.txt` 掟返落去就還原。唔會覆蓋、搬走或者上載任何嘢；撞名就
加號碼。暫時得 Base64 呢個轉換器係真正用得。
