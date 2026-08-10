# Agent API / Agent API

Desktop Material's Agent API is the product-owned HTTP surface for trusted
automation clients. It exposes the same versioned command contract through
REST and MCP, with a local-only mode by default and separately enabled remote
access modes.

Desktop Material 嘅 Agent API 係產品自己擁有嘅 HTTP 介面，俾受信任嘅自動化客戶端用。佢用 REST 同 MCP 提供同一套有版本嘅命令契約，預設淨係本機模式，遠端存取模式要另外開啟。

- [Local Agent HTTP API](local-agent-http-api.md) — connection, endpoint,
  command, persistence, failure, security, and verification contracts.
- [Agent API Postman
  collection](desktop-material-agent-api.postman_collection.json) — executable
  requests for every shipped HTTP route and every static command.
- [Project-wide Postman
  collection](../../postman/desktop-material.postman_collection.json) — the
  master collection, including this API and the self-hosted diagnostic-log
  service. Provider integrations do not add Desktop Material endpoints.

- [本機 Agent HTTP API](local-agent-http-api.md) — 連線、端點、命令、持久化、失敗、保安同驗證契約。
- [Agent API Postman 集合](desktop-material-agent-api.postman_collection.json) — 每一條已出貨 HTTP 路由同每一個靜態命令嘅可執行請求。
- [全項目 Postman 集合](../../postman/desktop-material.postman_collection.json) — 主集合，包括呢個 API 同自架診斷記錄服務。供應方整合唔會加 Desktop Material 端點。

The checked-in collections contain no token, pairing code, credential, or
machine-specific path. Supply private values only through an unexported local
Postman environment.


簽入嘅集合入面冇任何 token、配對碼、憑證或者機器專有路徑。私密值淨係應該經一個唔匯出嘅本機 Postman 環境提供。