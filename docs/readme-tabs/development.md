[Overview](../../README.md) · [Install](install.md) · [Features](features.md) · [Complete list](complete-feature-list.md) · [Screenshots](screenshots.md) · [Roadmap & receipts](roadmap-and-receipts.md) · **Development**

[總覽](../../README.md) · [安裝](install.md) · [功能](features.md) · [完整清單](complete-feature-list.md) · [截圖](screenshots.md) · [路線圖同憑證](roadmap-and-receipts.md) · **開發**

<sub>Tabbed README — GitHub can't run scripts, so each tab above is a separate page.</sub>

<sub>分頁式 README — GitHub 唔行得 script，所以上面每個分頁都係獨立一版。</sub>

# Development / 開發

## Building / 建置

Full instructions live in [`docs/contributing/setup.md`](../contributing/setup.md). In short, with Node 24.15.0:

完整指示喺 [`docs/contributing/setup.md`](../contributing/setup.md)。簡短講，用 Node 24.15.0：

```
yarn && yarn build:dev && yarn start
```

For historical reproduction only, the archived July 27 Linux TUI prototype
used this locked Python project:

純粹為咗重現歷史，封存低嘅 7 月 27 日 Linux TUI 原型用嘅係呢個鎖定咗嘅 Python 項目：

```bash
cd tui
uv sync --locked --extra dev
uv run pytest
uv run desktop-material-tui
```

Its archived contributor, package, interaction, and verification record is in
the [historical Linux TUI documentation](../features/linux-tui/README.md).
Those lanes are not current supported-product or Windows-release gates.


佢封存嘅貢獻者、套件、互動同驗證紀錄喺 [歷史 Linux TUI 文件](../features/linux-tui/README.md)。嗰啲線道唔係目前支援產品或者 Windows 發佈嘅關卡。