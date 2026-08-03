# Linux TUI local agent transport

Desktop Material's Linux TUI includes a private transport for its
repository-bound agent command catalog. It is off by default. The application
must pass an explicit `opt_in=True` when a user enables the server; merely
constructing the server does not open a socket or create a connection file.

## Behavior and configuration

An enabled server binds IPv4 address `127.0.0.1` and asks the operating system
for a random port. It writes a small owner-private connection file containing
the ephemeral endpoint, instance identifier, and random bearer capability. The
shipped client reloads that file for each request, so **Rotate token** can
invalidate the old capability without restarting the TUI. Stopping the server
removes the file only when it still belongs to that server instance.

The client and CLI never display the bearer capability. Use the CLI with the
connection file path selected by the application:

```console
python -m desktop_material_tui.agent_cli --connection-file PATH info
python -m desktop_material_tui.agent_cli --connection-file PATH tools
python -m desktop_material_tui.agent_cli --connection-file PATH call get-status
python -m desktop_material_tui.agent_cli --connection-file PATH stdio
```

The `stdio` command accepts one sessionless MCP JSON-RPC object per line and
returns one JSON object per line. Each input line is limited to 64 KiB. A
reviewed mutation capability can be read from one private stdin line with
`call --review-token-stdin`; it is never accepted on the command line or
rendered in output.

## HTTP and MCP contract

All requests require `Authorization: Bearer …` and the exact loopback `Host`
header from the connection record.

- `GET /v1/info` returns protocol version 1, transport metadata, and the closed
  command catalog. It never returns the bearer capability or connection path.
- `POST /v1/command` accepts `{ "name": "…", "arguments": { … } }` and an
  optional `reviewToken` previously minted by the visible TUI mutation review.
- `POST /mcp` accepts sessionless MCP `initialize`, `ping`, `tools/list`, and
  `tools/call` methods. A reviewed call carries its capability only in
  `params._meta.desktopMaterialReviewToken`.

Mutation preview and approval are intentionally absent from every transport.
An agent may discover a mutating tool, but only the visible TUI can mint the
single-use, short-lived capability for its exact reviewed arguments. Reusing a
capability or changing an argument fails closed.

The adjacent
[`desktop-material-tui-agent.postman_collection.json`](desktop-material-tui-agent.postman_collection.json)
is an executable route template. Its base URL uses unreachable port `0`, and
its secret variables are empty. Keep live values in a private, unexported
Postman environment; never commit or share a connection file or capability.

## Failure modes

- `400` rejects an invalid host, JSON shape, undeclared field, pathological
  nesting, duplicate length, or credential-shaped command argument.
- `401` means the bearer capability is absent, stale, or invalid. Reload the
  connection file through the client after a token rotation.
- `403` rejects browser-originated requests and unreviewed mutations.
- `404` means the path is not part of the local contract.
- `413` rejects a body larger than 64 KiB; `415` requires
  `application/json`.
- `503` means the bounded request pool is full. Retry later rather than opening
  parallel connections in a loop.

The client refuses redirects, proxies, non-loopback connection records,
symlinked or non-private records, malformed JSON, non-JSON responses, and
responses exceeding its configured bound.

## Security considerations

This is a same-user local capability, not a network service. The server rejects
`Origin`, `Referer`, cookies, fetch-metadata headers, browser user agents,
transfer encoding, and any host other than its exact random loopback endpoint.
It sends no CORS permission, emits no request log, bounds active request
threads, and closes every response. Both successful results and errors pass
through the command catalog's bounded redaction layer before serialization.

Do not bind the transport to a LAN address, forward its port, put its bearer
capability into an argument or URL, or use the connection file as a general
credential store. Provider credentials remain outside the command catalog and
credential-shaped arguments are refused.

## Verification

Focused tests in `tests/infrastructure/test_agent_server.py`,
`tests/application/test_agent_client.py`, and `tests/test_agent_cli.py` exercise
explicit opt-in, random loopback binding, private-file lifecycle, token
rotation and replay, hostile Host and browser headers, body and concurrency
bounds, REST and MCP routing, result/error redaction, redirect refusal,
connection-file attacks, NDJSON bounds, and CLI non-disclosure.

## Suggested articles

- [Linux TUI architecture and persistence](../../../docs/features/linux-tui/architecture-and-persistence.md)
- [Linux TUI security and failure modes](../../../docs/features/linux-tui/security-and-failure-modes.md)
- [Desktop application Agent API](../../../docs/features/agent-api/local-agent-http-api.md)

