# Minecraft web panel design (November 9, 2026)

The checked-in record of the design canvas for the Minecraft management web
panel that Desktop Material hosts in Docker. It is kept apart from
`design/motion-and-polish/` because the panel is its own web app.

Open `Main.dc.html` beside `support.js` in a browser. `frames/` holds renders at
1280 px and 390 px taken locally from this exact file.

This is a design. Nothing here is implemented, verified or shipped behaviour.

`Main.dc.html` specifies:

- **Where the panel can be reached:** home network only, a free Cloudflare
  quick tunnel started with one click, or a named tunnel on the owner's own
  domain. The quick tunnel's real limits are stated on the surface: a random
  link that changes on every start, no uptime guarantee, at most 200 requests
  at once, and no Server-Sent Events, so the console streams over a WebSocket.
- **Pairing with a changing link:** every new quick-tunnel link is a new
  address, so devices pair again with a one-time code.
- **Discord webhook:** posts the link, posts again automatically when the link
  changes (optionally updating the earlier message), and can announce when the
  panel goes offline. At the owner's request it also sends a pairing code with
  the link and a fresh one on demand: each code works once, for 10 minutes. The
  surface states the trade-off plainly: anyone who can read that channel can
  pair a device, and pairings can be revoked. The webhook address stays in
  Windows Credential Manager.
- **The full panel:** dashboard, console, players, files, configuration,
  plugins, backups, schedules and audit log, in place of a console only.

Open questions for implementation: where the tunnel helper is obtained and how
its signature is verified, and whether the earlier home-network-only promise in
`design/motion-and-polish/Minecraft.dc.html` should be reworded now that a
public link is an option.
