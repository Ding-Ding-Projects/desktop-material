# Developer OAuth App

Because GitHub Desktop uses [OAuth web application flow](https://developer.github.com/v3/oauth/#web-application-flow)
to interact with the GitHub API and perform actions on behalf of a user, it
needs to be bundled with a Client ID and Secret.

For external contributors, we have bundled a developer OAuth application
with the Desktop application so that you can complete the sign in flow locally
without needing to configure your own application.

The built-in application uses this exact authorization callback URL:

```
x-github-client://oauth
```

It is a custom OS protocol callback, not an HTTP URL. Keep the value exact:
there is no trailing slash, query string, or `https://` prefix. The authorize
request and the token exchange both send this value explicitly, so the OAuth
application registration and the running build must agree.

The repository's CI and published release workflows intentionally use the
built-in classic OAuth client and its matching callback. They do not inject a
separate OAuth client into a release build, because pairing a different client
with this callback produces GitHub's `redirect_uri` error before sign-in.
Custom OAuth credentials remain supported for local or Enterprise builds only;
register `x-github-client://oauth` on that OAuth application before setting
`DESKTOP_OAUTH_CLIENT_ID` and `DESKTOP_OAUTH_CLIENT_SECRET`.

The running build requests these scopes in the authorize URL:

```
repo user workflow notifications read:org write:packages
```

OAuth application settings do not have a separate scope checklist; GitHub
shows and grants the scopes supplied by the authorize request. `repo` covers
repository content, issues, pull requests, releases, checks, rules, and
private-repository Actions access. `user` covers the signed-in identity and
profile data, `workflow` covers workflow-file updates, `notifications` covers
the GitHub inbox, `read:org` covers organization and team metadata, and
`write:packages` covers the GHCR package flow. Destructive and administrator
scopes are deliberately not requested.

These are listed in [app/app-info.ts](https://github.com/desktop/desktop/blob/85cf9dbae5055cc4f0de9fb4f7046cd32607e877/app/app-info.ts#L9-L10).

**DO NOT TRUST THIS CLIENT ID AND SECRET! THIS IS ONLY FOR TESTING PURPOSES!!**

The limitation with this developer application is that **this will not work
with GitHub Enterprise**. You will see  sign-in will fail on the OAuth callback
due to the credentials not being present there.

## Provide your own Client ID and Secret

The OAuth client ID and Client Secret are bundled into the application with
webpack. If you want to provide your own Client ID and Client Secret, set these
environment variables:

 - `DESKTOP_OAUTH_CLIENT_ID`
 - `DESKTOP_OAUTH_CLIENT_SECRET`
