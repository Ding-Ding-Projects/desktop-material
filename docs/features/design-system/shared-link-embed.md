# Shared-link preview graphic

Desktop Material publishes one product-specific social preview at the
repository root and one byte-identical served copy for the documentation site.
The image shows the real built repository changes workspace beside the product
name. It is generated locally from a checked-in real capture rather than a
mockup, stock image, remote asset, or runtime download.

## Behavior

`script/generate-social-preview.ps1` reads the real
`material-workspace-changes.png` capture, renders a 1280 by 640 branded card,
writes `social-preview.png` at the repository root, and copies the exact bytes
to `docs/assets/social-preview.png`. The script compares SHA-256 hashes and
fails when the copies differ.

The documentation hub and every generated screenshot page serve static Open
Graph metadata in their HTML. Crawlers do not need JavaScript. Each page
includes title, description, canonical HTTPS URL, type, site name, absolute
HTTPS image URL, dimensions, meaningful image alternative text,
`summary_large_image`, and a theme color.

The repository-root image is the source a maintainer uploads in repository
settings. GitHub does not expose social-preview upload through the supported
CLI or public API, so committing the image and serving page metadata do not by
themselves prove that repository setting was updated.

## Configuration

The public documentation origin is
`https://ding-ding-projects.github.io/desktop-material/`. The served image URL
is stable at `/desktop-material/assets/social-preview.png`. Change the URL when
the graphic changes meaningfully so external crawler caches cannot retain an
older picture indefinitely.

## Failure modes and recovery

- A missing source capture stops generation.
- A root/served byte mismatch stops generation.
- A wrong PNG signature or dimensions turns the focused test red.
- A page missing any required metadata field turns the page inventory red.
- A relative or non-HTTPS image URL turns the focused test red.
- A deployment that has not completed remains unverified until the live page
  and image are fetched without credentials.

Regenerate both images with the committed script, regenerate screenshot pages,
run the focused tests, and then verify the deployed response rather than
editing either PNG by hand.

## Security considerations

The generator has no network access and reads one checked-in capture. The
source and result contain fixture data only. The image URL is public and
credential-free. Metadata contains no user path, account identity, secret,
signed URL, or private runtime state.

## Verification

`script/social-preview-test.mjs` verifies byte identity, PNG signature, exact
1280 by 640 dimensions, a meaningful minimum file size, and complete static
metadata on all 131 HTML pages. Its mutation loop removes each required field
and proves the check turns red. The capture-plan contract independently proves
the source screenshot belongs to the checked-in real capture inventory.

Live deployment verification must additionally fetch every page class and the
absolute image URL without credentials and confirm successful image bytes.

## Suggested articles

- [The Material Design 3 site](material-design-3-site.md)
- [Universal-feature completeness inventory](universal-feature-completeness-inventory.md)
- [Offline documentation browser](offline-documentation-browser.md)
