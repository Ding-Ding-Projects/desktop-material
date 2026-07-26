# Per-repository GitHub Packages explorer

Desktop Material exposes GitHub Packages beside **Releases** in the selected
repository's **Distribution** surface. The explorer keeps the repository's
chosen GitHub account and provider endpoint, lists only packages that GitHub
explicitly associates with that repository, and provides a native single-file
upload/download path for app-owned GitHub.com GHCR artifacts.

## Browse packages and versions

The first refresh obtains the repository's current numeric GitHub ID, then
loads the owner-scoped package endpoints for all six REST package types:
**npm**, **Maven**, **RubyGems**, **Docker**, **NuGet**, and **container**. It
uses the authenticated-user, organization, or public-user endpoint appropriate
to the selected owner. Because GitHub has no repository-scoped package-list
endpoint, Desktop Material retains a package only when the optional
`package.repository.id` exactly equals the freshly fetched repository ID.
Owner/name similarity is never accepted as a substitute; that avoids attaching
an unrelated package after a repository rename or transfer.

Each package row shows its ecosystem, visibility, version count, update time,
and a same-provider GitHub link when available. Selecting it loads versions,
including container tags, descriptions, licenses, and provider links. The
initial owner pages load together; **Load all owner pages** follows bounded
pagination for each type. Package pages are limited to 100 entries, 1,000 pages
per type, and 2 MiB of JSON per response. A safety-cap banner labels any
partial inventory instead of implying it is complete.

Package and version searches default to ordinary matching and also support
fuzzy, substring, and opt-in regular-expression modes, independent case
sensitivity, syntax feedback, and the full Regex Builder. Package search covers
name, type, visibility, and repository name. Version search covers digest/name,
tags, description, and license. Search mode is persisted; queries and sample
text stay local.

## Publish a GHCR file artifact

Native upload is intentionally narrow and available only for GitHub.com GHCR:

1. Review one regular local file and the lowercase
   `ghcr.io/owner/package` destination. The suggested package name is
   `<repository>-desktop-material-files` and remains editable.
2. **Confirm upload** stages a stable snapshot and publishes one OCI layer with
   artifact type `application/vnd.desktop-material.file.v1` and layer type
   `application/vnd.desktop-material.file.layer.v1`.
3. The manifest records the exact canonical repository URL in
   `org.opencontainers.image.source` and the Desktop Material file-format
   version. Every upload receives a new never-reused tag, but the durable result
   shown to the user is the immutable `repository@sha256:…` reference.
4. Desktop Material fetches that digest back and verifies the manifest,
   provenance, safe title, layer digest, and size before reporting success.

The explorer does not replace ecosystem publishing tools. npm, Maven,
RubyGems, NuGet, legacy Docker, and general-purpose container images remain
publish/install/download operations for their normal registry clients.

## Download and integrity

**Download file** is offered on GitHub.com `container` versions. The selected
version name must be an exact lowercase SHA-256 manifest digest; tags and other
mutable references are rejected. Before bytes leave the private transfer
workspace, Desktop Material verifies that the manifest has the exact app
artifact type, expected source repository, one safe Windows filename, one
expected layer type, and no subject. A non-app container image therefore fails
closed even though its metadata remains browsable.

ORAS pulls into an owned temporary directory with path traversal disabled.
Desktop Material requires exactly one regular non-symlink/reparse file, hashes
it locally, compares its size and digest with the verified manifest, and then
atomically creates the caller-selected destination. Existing destinations are
never overwritten. A successful result offers **Show in folder**.

## Authentication and security

- The explorer uses only the account explicitly associated with the current
  repository; it does not silently substitute another account on the host.
- The bundled/installed Windows `oras.exe` must match the app's pinned digest
  and is re-hashed before every command. ORAS runs hidden with no shell, no TTY,
  a bounded timeout, bounded output, and an isolated registry config and cache.
- The GitHub token is copied into mutable memory only for the operation, sent
  through `--password-stdin`, never placed in argv or an error, and zeroed with
  each command and again when the operation ends. No interactive registry login
  prompt is launched.
- Metadata JSON, pagination, strings, URLs, identifiers, tags, and response
  sizes are bounded and validated before entering UI state. Provider links open
  only when their origin matches the selected account's provider.
- Upload files and downloaded bytes are checked across open/read/copy
  boundaries. Temporary registry configuration, cache, manifests, and payloads
  are removed on success, failure, or cancellation.

## Failure and recovery

- A repository without a GitHub association, or without its selected account,
  receives an explicit availability message and no package request.
- A missing stable repository ID, invalid provider metadata, wrong package
  association, response cap, expired/insufficient package permission, or
  network error stays distinct from an empty result. Refresh retries metadata;
  already loaded bounded pages remain the source of filtering.
- Upload rejects unsafe filenames, redirected/non-regular or changing files,
  invalid package coordinates, an unavailable/untrusted ORAS binary, timeout,
  cancellation, and a post-publish manifest mismatch.
- Download rejects tags, the wrong repository provenance, non-app or multi-file
  manifests, unsafe paths, changed bytes, and an existing destination. A failed
  transfer never falls back to an unverified copy.

GitHub Actions caches are a separate inventory. GitHub's supported REST API and
`gh cache` commands provide list, usage, and delete operations but no cache
archive download operation. Desktop Material therefore shows **Download
unavailable** instead of using the private runner cache protocol. Publish or
select a workflow artifact when downloadable output is required; artifact
archives use GitHub's supported redirect flow and local digest reporting.

## Verification

The implementation is covered by the bounded package model/API tests, source
and interaction contracts for both explorer search surfaces, and offline GHCR
transfer tests. The transfer suite exercises exact manifest acceptance,
repository-provenance rejection, unique-tag upload, digest-only download,
atomic no-overwrite publication, cancellation, Windows title safety, hidden
non-shell execution, bounded output, stdin-only credentials, and secret-buffer
clearing.

```powershell
yarn test:unit app/test/unit/github-packages-test.ts
yarn test:unit app/test/unit/github-packages-api-test.ts
yarn test:unit app/test/unit/github-packages-ui-test.ts
yarn test:unit app/test/unit/github-container-file-transfer-test.ts
yarn tsc --noEmit --project tsconfig.json
```
