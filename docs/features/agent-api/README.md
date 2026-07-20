# Agent API

Desktop Material's Agent API is the product-owned HTTP surface for trusted
automation clients. It exposes the same versioned command contract through
REST and MCP, with a local-only mode by default and separately enabled remote
access modes.

- [Local Agent HTTP API](local-agent-http-api.md) — connection, endpoint,
  command, persistence, failure, security, and verification contracts.
- [Agent API Postman
  collection](desktop-material-agent-api.postman_collection.json) — executable
  requests for every shipped HTTP route and every static command.
- [Project-wide Postman
  collection](../../postman/desktop-material.postman_collection.json) — the
  master collection. The Agent API is currently the only product-owned HTTP
  API; provider integrations do not add Desktop Material endpoints.

The checked-in collections contain no token, pairing code, credential, or
machine-specific path. Supply private values only through an unexported local
Postman environment.
