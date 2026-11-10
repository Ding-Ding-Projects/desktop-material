# About: build commit and the free note / 關於：組建來源同免費聲明

**Help → About Desktop Material** now says which commit the running build was
made from, and states that the app is free.

「Help → About Desktop Material」而家會講呢個組建係由邊個 commit 整出嚟，同埋寫明
呢個 app 係免費。

## What it shows

- `Built from commit <first ten characters>.` under the version, selectable so
  it can be copied into a report. If the build did not record a commit, it says
  so instead of showing a made-up value.
- `Free, and it stays free: no ads, no upgrade prompts, no review nags.
  Desktop Material builds on GitHub Desktop by GitHub and its contributors.`

## Not built

The release's dim sum code name is not shown. The release workflow picks that
name when it publishes, after the app has been built, so the build cannot
carry its own name. The time the build was made is not recorded either.

## Verification

`build-provenance-test.ts` passes on Linux and the TypeScript check passes.
Not yet seen in a running build.
