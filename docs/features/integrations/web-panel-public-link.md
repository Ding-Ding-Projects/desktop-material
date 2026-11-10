# Web panel public link and Discord webhook (groundwork) / 網頁面板公開連結同 Discord（底層）

> [!IMPORTANT]
> This is groundwork only. The rules below exist and are tested, but nothing
> starts a tunnel or sends a message yet, because the Minecraft server manager
> and its web panel that they belong to are not built. There is no screen for
> this in the app. The design is in `design/minecraft-web-panel/`.

呢度只係底層規則，有測試，但未有畫面、未會真係開隧道或者發訊息，因為佢哋要跟住嘅
Minecraft 伺服器管理器同網頁面板仲未起好。

## What exists

- `app/src/lib/web-panel/quick-tunnel.ts`: the arguments for a free Cloudflare
  quick tunnel to this computer's loopback, finding the public
  `https://….trycloudflare.com` address in the helper's output, and the
  stopped, starting, running and failed states.
- `app/src/lib/web-panel/discord-webhook.ts`: checks a Discord webhook address,
  writes the message (link, optional one-use pairing code, no mentions), decides
  whether a change needs a new message, an edit of the earlier one or nothing,
  and sends it through an injected `fetch`.

## Behaviour the rules encode

- A quick tunnel's link is random and changes on every start. A new link is
  announced again automatically when that switch is on, by editing the earlier
  message or posting a new one.
- **Send now** always sends. An offline notice is sent only when asked for.
- If the earlier message was deleted in Discord, a new one is posted instead.
- A failure never stops the panel, keeps the previous state so the next change
  retries, and never includes the webhook address in an error.

## Security considerations

- The webhook address is a credential. The caller must keep it in the
  operating-system vault; it is never written to messages, errors or state.
- Sending the pairing code to the same channel as the link means anyone who can
  read that channel can pair a device. The design states this on the surface.
- A public link puts the sign-in page on the internet. Pairing remains
  mandatory.

## Verification

`app/test/unit/web-panel-hosting-test.ts`: 9 tests pass on Linux, and the
TypeScript check passes. Nothing here has run against Cloudflare or Discord.
