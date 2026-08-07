# Original GitHub OAuth release proof — 2026-08-06

This dated acceptance proves the real production Windows bundle uses Desktop
Material's original registered GitHub OAuth application and the exact
`x-github-client://oauth` callback. It is runtime evidence for source
`0e6273b46555d5fd683461db3560190d4d97a51e`, which contains implementation
commit `6f84c4f6ce7318ce999b7a2392404b5650f40e2a`.

## Result

- The focused OAuth wiring test passed **1/1**.
- The exact production build completed successfully in **672.05 seconds**.
- Built artifacts contained the original client configuration and callback,
  with no unresolved placeholder and no workflow secret override.
- A real off-screen application launch painted the startup UI, opened the
  app-owned browser, and reached the provider authorization page without the
  reported `redirect_uri` warning.
- The captured page had empty sign-in fields and disclosed no account,
  credential, token, code, repository, or organization data.

![Real internal GitHub authorization page opened by the production Desktop Material build without a redirect URI warning](../../assets/screenshots/material-original-github-oauth-release-20260806.png)

The accepted PNG is 1,160×780 and 59,122 bytes. Its SHA-256 is
`2da2b2b2f61dc64ee59043a029e82bff70651add7f6d1f55e608790e29c6793d`.

## Method and cleanup

The production build ran with packaging skipped so the acceptance could inspect
the exact renderer and main-process artifacts before release packaging. The
application then launched directly on a uniquely named off-screen Win32
desktop through the repository's cheap Lowlevel MCP route. Chromium DevTools
Protocol drove only the built application's internal browser window; the
operator's visible desktop and input focus were untouched.

The owned application process was terminated after the background native-close
focus guard refused the close request. The verifier confirmed zero remaining
owned windows and closed the named desktop. No authorization state or temporary
profile was published.

## Scope and remaining gate

This receipt proves OAuth runtime wiring and the absence of the reported
provider warning. It does not claim a signed installer, a published release, or
remote CI success. Those remain separate exact-commit release gates.

## Suggested articles

- [App capture fixture](../../technical/app-capture-fixture.md)
- [Supply-chain and CI hardening](../../features/quality-and-reliability/supply-chain-and-ci-hardening.md)
- [Verification records](../README.md)
