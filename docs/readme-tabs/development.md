[Overview](../../README.md) · [Install](install.md) · [Features](features.md) · [Complete list](complete-feature-list.md) · [Screenshots](screenshots.md) · [Roadmap & receipts](roadmap-and-receipts.md) · **Development**

<sub>Tabbed README — GitHub can't run scripts, so each tab above is a separate page.</sub>

# Development

## Building

Full instructions live in [`docs/contributing/setup.md`](../contributing/setup.md). In short, with Node 24.15.0:

```
yarn && yarn build:dev && yarn start
```

For historical reproduction only, the archived July 27 Linux TUI prototype
used this locked Python project:

```bash
cd tui
uv sync --locked --extra dev
uv run pytest
uv run desktop-material-tui
```

Its archived contributor, package, interaction, and verification record is in
the [historical Linux TUI documentation](../features/linux-tui/README.md).
Those lanes are not current supported-product or Windows-release gates.
