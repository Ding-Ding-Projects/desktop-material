# Isolated provider-authored markup rendering

Provider-authored Markdown is rendered as formatted content rather than
printed as source text. One shared renderer serves release notes, pull request
content, comments, summaries, and offline documentation. The renderer remains
isolated from the privileges of the surrounding application.

## Behavior

`SandboxedMarkdown` parses GitHub-flavored Markdown with line breaks, sanitizes
the resulting HTML, embeds it in a sandboxed same-origin data-URL iframe, and
loads the bundled local Markdown stylesheet. A base URL resolves relative
links, the shared emoji map resolves supported shortcodes, and callers provide
an accessible region label.

Only HTTP and HTTPS links reach the caller's navigation callback. Images are
bounded to their container. Theme variables and the user's underline-links
choice are copied into the isolated stylesheet. Provider-specific node filters
run after the document is current and owned by the latest render generation.

The Linux terminal edition uses Textual's local Markdown widget for the same
formatted headings, lists, links, and code outcome. Documentation source is
converted into the static hub and offline bundle at build time, so pages remain
readable without client-side Markdown execution.

## Configuration

Callers provide Markdown, optional base URL, emoji map, provider context,
repository identity, link callback, accessible label, underline preference,
and optional trusted application-owned CSS. Provider content cannot supply CSS
or executable script.

## Failure modes and recovery

- A missing bundled stylesheet degrades appearance without dropping content.
- A superseded render cannot initialize or resize the newest document.
- Unmount cancels animation-frame polling, document listeners, and debounced
  scroll work.
- An unsafe link is prevented and is not sent to the navigation callback.
- Empty provider content is represented by the owning surface's factual empty
  state instead of an empty loading frame.

## Security considerations

HTML is sanitized before it enters the iframe. The iframe has no script
permission. Provider-authored CSS is not accepted. Link handling validates the
protocol. The renderer reads one bundled stylesheet and makes no network
request. Repository and provider filters receive typed context rather than
arbitrary application privileges.

## Verification

`sandboxed-markdown-lifecycle-test.tsx` covers repeated reloads, latest-render
ownership, deferred document initialization, unmount cancellation, link and
tooltip setup ownership, and stale work refusal. Release-note and documentation
wiring tests prove real consumers use the shared renderer instead of printing
Markdown source. The terminal and static-page implementations are covered by
their existing UI and documentation-generation tests.

Built-application interaction and current visual capture remain separate
evidence dimensions in the universal-feature inventory.

## Suggested articles

- [Offline documentation browser](offline-documentation-browser.md)
- [Shared-link preview graphic](shared-link-embed.md)
- [Universal-feature completeness inventory](universal-feature-completeness-inventory.md)
