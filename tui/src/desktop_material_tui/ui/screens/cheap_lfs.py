"""Mouse- and keyboard-complete Cheap LFS manager."""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Sequence
from typing import Any, ClassVar

from textual import on, work
from textual.app import ComposeResult
from textual.binding import BindingType
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.widgets import Button, Checkbox, DataTable, Input, Label, Static, TextArea
from textual.worker import Worker

from ...application.cheap_lfs import (
    CheapLfsInventoryEntry,
    CheapLfsRestorePlan,
    CheapLfsService,
    CheapLfsTrackPlan,
)
from ...application.search import RegexFlags, SearchMode, SearchService
from ..action_flight import single_flight_actions
from ..i18n import Translator, get_translator
from ..widgets.responsive_layout import ScrollableToolbar
from ..widgets.search_bar import SearchBar, SearchState
from .dialogs import DecisionDialog
from .repository_panes import RepositoryPane


class CheapLfsPane(RepositoryPane):
    """Inventory, preview, track, verify, and restore canonical v1 pointers."""

    BINDINGS: ClassVar[list[BindingType]] = [("f6", "reload", "Refresh Cheap LFS")]

    def __init__(self, *children: Any, **kwargs: Any) -> None:
        super().__init__(*children, **kwargs)
        self.cheap_lfs: CheapLfsService | None = None
        self.entries: list[CheapLfsInventoryEntry] = []
        self._visible_entries: list[CheapLfsInventoryEntry] = []
        self._pending_track: CheapLfsTrackPlan | None = None
        self._pending_restore: CheapLfsRestorePlan | None = None
        self._translator: Translator = get_translator()
        self.mutation_active = False
        self.mutation_operation = ""

    def compose(self) -> ComposeResult:
        yield SearchBar(
            surface_id="cheap-lfs-inventory",
            placeholder=self._t("cheap_lfs.filter"),
            id="cheap-lfs-search",
        )
        with ScrollableToolbar():
            yield Button(self._t("cheap_lfs.refresh"), id="cheap-lfs-refresh")
            yield Button(
                self._t("cheap_lfs.preview"),
                id="cheap-lfs-preview",
                variant="primary",
            )
            yield Button(self._t("cheap_lfs.track"), id="cheap-lfs-track")
            yield Button(self._t("cheap_lfs.verify"), id="cheap-lfs-verify")
            yield Button(self._t("cheap_lfs.restore"), id="cheap-lfs-restore")
        yield DataTable(
            cursor_type="row",
            zebra_stripes=True,
            id="cheap-lfs-table",
            classes="cheap-lfs-table",
        )
        with VerticalScroll(classes="form-panel cheap-lfs-form"):
            with Horizontal(classes="cheap-lfs-fields"):
                with Vertical(classes="cheap-lfs-field"):
                    yield Label(
                        self._t("cheap_lfs.path"),
                        id="cheap-lfs-path-label",
                        classes="field-label",
                    )
                    yield Input(
                        placeholder="artifacts/model.bin",
                        id="cheap-lfs-path",
                        select_on_focus=False,
                    )
                with Vertical(classes="cheap-lfs-field"):
                    yield Label(
                        self._t("cheap_lfs.tag"),
                        id="cheap-lfs-tag-label",
                        classes="field-label",
                    )
                    yield Input(
                        value="assets",
                        placeholder="assets",
                        id="cheap-lfs-tag",
                        select_on_focus=False,
                    )
                with Vertical(classes="cheap-lfs-field"):
                    yield Label(
                        self._t("cheap_lfs.repository"),
                        id="cheap-lfs-repo-label",
                        classes="field-label",
                    )
                    yield Input(
                        placeholder="OWNER/NAME (optional)",
                        id="cheap-lfs-repo",
                        select_on_focus=False,
                    )
            yield Checkbox(
                self._t("cheap_lfs.fetch_verify"),
                id="cheap-lfs-fetch-verify",
            )
            yield TextArea(
                self._t("cheap_lfs.intro"),
                read_only=True,
                soft_wrap=True,
                tab_behavior="focus",
                id="cheap-lfs-plan",
                classes="cheap-lfs-plan",
            )
            yield Static(
                self._t("cheap_lfs.scope"),
                id="cheap-lfs-provider-scope",
                classes="help-copy",
            )

    def on_mount(self) -> None:
        self._reset_columns()

    def localize(self, translator: Translator) -> None:
        """Apply persisted English, Cantonese, or compact bilingual copy."""

        self._translator = translator
        button_keys = {
            "#cheap-lfs-refresh": "cheap_lfs.refresh",
            "#cheap-lfs-preview": "cheap_lfs.preview",
            "#cheap-lfs-track": "cheap_lfs.track",
            "#cheap-lfs-verify": "cheap_lfs.verify",
            "#cheap-lfs-restore": "cheap_lfs.restore",
        }
        for selector, key in button_keys.items():
            self.query_one(selector, Button).label = self._t(key)
        label_keys = {
            "#cheap-lfs-path-label": "cheap_lfs.path",
            "#cheap-lfs-tag-label": "cheap_lfs.tag",
            "#cheap-lfs-repo-label": "cheap_lfs.repository",
        }
        for selector, key in label_keys.items():
            self.query_one(selector, Label).update(self._t(key))
        self.query_one("#cheap-lfs-fetch-verify", Checkbox).label = self._t(
            "cheap_lfs.fetch_verify"
        )
        self.query_one("#cheap-lfs-provider-scope", Static).update(self._t("cheap_lfs.scope"))
        search = self.query_one("#cheap-lfs-search", SearchBar)
        search.placeholder = self._t("cheap_lfs.filter")
        search.query_one(Input).placeholder = self._t("cheap_lfs.filter")
        self._reset_columns()

    def _reset_columns(self) -> None:
        table = self.query_one("#cheap-lfs-table", DataTable)
        table.clear(columns=True)
        table.add_columns(
            self._t("cheap_lfs.column.path"),
            self._t("cheap_lfs.column.state"),
            self._t("cheap_lfs.column.bytes"),
            self._t("cheap_lfs.column.assets"),
            self._t("cheap_lfs.column.cached"),
            self._t("cheap_lfs.column.release"),
            self._t("cheap_lfs.column.sha"),
        )
        if self._visible_entries:
            self._render_entries(self._visible_entries)

    def bind_repository(self, service: Any | None) -> None:
        self.service = service
        self.cheap_lfs = None
        self.entries = []
        self._visible_entries = []
        # Repository binding can happen while Textual is still mounting this
        # pane's composed children. Defer the worker until the next completed
        # refresh so its table and search-bar queries are always mount-safe.
        self.call_after_refresh(self.reload)

    @work(exclusive=True, group="cheap-lfs-load")
    async def reload(self) -> None:
        await self._load_entries()

    async def _load_entries(self) -> None:
        table = self.query_one("#cheap-lfs-table", DataTable)
        if self.service is None:
            table.clear()
            self._set_detail(self._t("cheap_lfs.open_repository"))
            return
        try:
            cheap_lfs = self.cheap_lfs
            if cheap_lfs is None:
                cheap_lfs = await asyncio.to_thread(CheapLfsService, self.service.path)
                self.cheap_lfs = cheap_lfs
            entries = await asyncio.to_thread(cheap_lfs.status)
        except Exception as error:
            self._set_error_detail(error)
            self._error(self._t("cheap_lfs.error.refresh"), error)
            return
        self.entries = list(entries)
        self._render_entries(self._filter_entries(self._search_state()))
        if not self.entries:
            self._set_detail(self._t("cheap_lfs.empty"))

    def _search_state(self) -> SearchState:
        return self.query_one("#cheap-lfs-search", SearchBar).state

    def _filter_entries(self, state: SearchState) -> list[CheapLfsInventoryEntry]:
        try:
            mode = SearchMode(state.mode)
        except ValueError:
            mode = SearchMode.LITERAL
        result = SearchService().search(
            self.entries,
            state.query,
            mode=mode,
            flags=RegexFlags(
                ignore_case=not state.case_sensitive or "i" in state.flags,
                multiline="m" in state.flags,
                dot_all="s" in state.flags,
            ),
            get_text=lambda entry: (
                entry.relative_path,
                entry.state,
                entry.release_tag,
                entry.sha256,
                entry.detail,
            ),
        )
        return list(result.items if result.error is None else self.entries)

    def _render_entries(self, entries: Sequence[CheapLfsInventoryEntry]) -> None:
        self._visible_entries = list(entries)
        table = self.query_one("#cheap-lfs-table", DataTable)
        table.clear()
        for index, entry in enumerate(entries):
            table.add_row(
                entry.relative_path,
                self._entry_state(entry.state),
                str(entry.size_in_bytes),
                str(entry.asset_count),
                f"{entry.cached_parts}/{entry.asset_count}",
                entry.release_tag or "—",
                (entry.sha256[:12] if entry.sha256 else self._t("cheap_lfs.preview_required")),
                key=str(index),
            )

    @on(SearchBar.Changed, "#cheap-lfs-search")
    def _search_changed(self, event: SearchBar.Changed) -> None:
        self._render_entries(self._filter_entries(event.state))

    @on(DataTable.RowSelected, "#cheap-lfs-table")
    def _row_selected(self, event: DataTable.RowSelected) -> None:
        try:
            index = int(str(event.row_key.value))
            entry = self._visible_entries[index]
        except (IndexError, TypeError, ValueError):
            return
        self.query_one("#cheap-lfs-path", Input).value = entry.relative_path
        if entry.release_tag:
            self.query_one("#cheap-lfs-tag", Input).value = entry.release_tag
        self._set_detail(self._entry_detail(entry))

    def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id
        actions: dict[str, Callable[[], object]] = {
            "cheap-lfs-refresh": self.reload,
            "cheap-lfs-preview": self._preview_track,
            "cheap-lfs-track": self._confirm_track,
            "cheap-lfs-verify": self._verify,
            "cheap-lfs-restore": self._confirm_restore,
        }
        if button_id is not None and (action := actions.get(button_id)) is not None:
            single_flight_actions.start(
                self, event.button, f"cheap-lfs:{button_id}", action
            )

    def _values(self) -> tuple[str, str, str | None]:
        path = self.query_one("#cheap-lfs-path", Input).value.strip()
        tag = self.query_one("#cheap-lfs-tag", Input).value.strip()
        raw_repository = self.query_one("#cheap-lfs-repo", Input).value.strip()
        if not path:
            self.query_one("#cheap-lfs-path", Input).focus()
            raise ValueError(self._t("cheap_lfs.enter_path"))
        if not tag:
            self.query_one("#cheap-lfs-tag", Input).focus()
            raise ValueError(self._t("cheap_lfs.enter_tag"))
        return path, tag, raw_repository or None

    @work(exclusive=True, group="cheap-lfs-plan")
    async def _preview_track(self) -> None:
        cheap_lfs = self.cheap_lfs
        if cheap_lfs is None:
            self.app.notify(
                self._t("cheap_lfs.open_repository"),
                title=self._t("cheap_lfs.title"),
                severity="warning",
            )
            return
        try:
            path, tag, repository = self._values()
            self._set_detail(self._t("cheap_lfs.hashing"))
            plan = await asyncio.to_thread(
                cheap_lfs.preview_track,
                path,
                release_tag=tag,
                repository_slug=repository,
            )
        except Exception as error:
            self._error(self._t("cheap_lfs.error.preview"), error)
            self._set_error_detail(error)
            return
        self._pending_track = plan
        self._set_detail(self._track_plan_text(plan))
        self.app.notify(
            self._t("cheap_lfs.preview_ready"),
            title=self._t("cheap_lfs.title"),
        )

    @work(exclusive=True, group="cheap-lfs-confirm")
    async def _prepare_track_confirmation(self) -> None:
        cheap_lfs = self.cheap_lfs
        if cheap_lfs is None:
            return
        try:
            path, tag, repository = self._values()
            plan = await asyncio.to_thread(
                cheap_lfs.preview_track,
                path,
                release_tag=tag,
                repository_slug=repository,
            )
        except Exception as error:
            self._error(self._t("cheap_lfs.error.preview"), error)
            return
        self._pending_track = plan
        self._set_detail(self._track_plan_text(plan))
        self.app.push_screen(
            DecisionDialog(
                self._t("cheap_lfs.track_dialog"),
                self._track_plan_text(plan),
                confirm_label=self._t("cheap_lfs.track_confirm"),
                cancel_label=self._t("common.cancel"),
                destructive=True,
                typed_confirmation="track",
                typed_prompt=self._t(
                    "cheap_lfs.confirm_prompt",
                    word="track",
                ),
            ),
            self._track_decision,
        )

    def _confirm_track(self) -> None:
        self._prepare_track_confirmation()

    def _track_decision(self, confirmed: bool | None) -> None:
        if (
            confirmed
            and self._pending_track is not None
            and self._begin_mutation(self._t("cheap_lfs.operation.track"))
        ):
            self._execute_track(self._pending_track)

    @work(group="cheap-lfs-mutate")
    async def _execute_track(self, plan: CheapLfsTrackPlan) -> None:
        cheap_lfs = self.cheap_lfs
        if cheap_lfs is None:
            self._end_mutation()
            return
        try:
            self._set_detail(self._t("cheap_lfs.uploading"))
            try:
                receipt = await asyncio.to_thread(
                    cheap_lfs.track,
                    plan,
                    confirmed=True,
                )
            except Exception as error:
                self._error(self._t("cheap_lfs.error.track"), error)
                self._set_error_detail(error)
                return
            await self._load_entries()
            self._set_detail(
                f"{self._t('cheap_lfs.track_complete')}\n"
                f"{self._t('cheap_lfs.pointer')}: {receipt.pointer_path}\n"
                f"{self._t('cheap_lfs.uploaded')}: "
                f"{len(receipt.uploaded_assets)}\n"
                f"{self._t('cheap_lfs.reused')}: {len(receipt.reused_assets)}\n"
                f"{self._t('cheap_lfs.recovery_copy')}: {receipt.recovery_path}"
            )
            self.app.notify(
                self._t("cheap_lfs.tracked_notice", path=receipt.relative_path),
                title=self._t("cheap_lfs.title"),
            )
        finally:
            self._end_mutation()

    @work(exclusive=True, group="cheap-lfs-verify")
    async def _verify(self) -> None:
        cheap_lfs = self.cheap_lfs
        if cheap_lfs is None:
            return
        try:
            path, _tag, repository = self._values()
            fetch = self.query_one("#cheap-lfs-fetch-verify", Checkbox).value
            entry = await asyncio.to_thread(
                cheap_lfs.verify,
                path,
                fetch_missing=fetch,
                repository_slug=repository,
            )
        except Exception as error:
            self._error(self._t("cheap_lfs.error.verify"), error)
            self._set_error_detail(error)
            return
        self._set_detail(self._entry_detail(entry))
        self.app.notify(
            (
                self._t("cheap_lfs.verify_complete")
                if entry.verified
                else self._t("cheap_lfs.verify_partial")
            ),
            title=self._t("cheap_lfs.verification_title"),
            severity="information" if entry.verified else "warning",
        )

    @work(exclusive=True, group="cheap-lfs-confirm")
    async def _prepare_restore_confirmation(self) -> None:
        cheap_lfs = self.cheap_lfs
        if cheap_lfs is None:
            return
        try:
            path, _tag, repository = self._values()
            plan = await asyncio.to_thread(
                cheap_lfs.preview_restore,
                path,
                repository_slug=repository,
            )
        except Exception as error:
            self._error(self._t("cheap_lfs.error.restore_preview"), error)
            return
        self._pending_restore = plan
        self._set_detail(self._restore_plan_text(plan))
        self.app.push_screen(
            DecisionDialog(
                self._t("cheap_lfs.restore_dialog"),
                self._restore_plan_text(plan),
                confirm_label=self._t("cheap_lfs.restore_confirm"),
                cancel_label=self._t("common.cancel"),
                destructive=True,
                typed_confirmation="restore",
                typed_prompt=self._t(
                    "cheap_lfs.confirm_prompt",
                    word="restore",
                ),
            ),
            self._restore_decision,
        )

    def _confirm_restore(self) -> None:
        self._prepare_restore_confirmation()

    def _restore_decision(self, confirmed: bool | None) -> None:
        if (
            confirmed
            and self._pending_restore is not None
            and self._begin_mutation(self._t("cheap_lfs.operation.restore"))
        ):
            self._execute_restore(self._pending_restore)

    @work(group="cheap-lfs-mutate")
    async def _execute_restore(self, plan: CheapLfsRestorePlan) -> None:
        cheap_lfs = self.cheap_lfs
        if cheap_lfs is None:
            self._end_mutation()
            return
        try:
            self._set_detail(self._t("cheap_lfs.downloading"))
            try:
                receipt = await asyncio.to_thread(
                    cheap_lfs.restore,
                    plan,
                    confirmed=True,
                )
            except Exception as error:
                self._error(self._t("cheap_lfs.error.restore"), error)
                self._set_error_detail(error)
                return
            await self._load_entries()
            self._set_detail(
                f"{self._t('cheap_lfs.restore_complete')}\n"
                f"{self._t('cheap_lfs.payload')}: {receipt.restored_path}\n"
                f"{self._t('cheap_lfs.column.bytes')}: {receipt.size_in_bytes}\n"
                f"SHA-256: {receipt.sha256}\n"
                f"{self._t('cheap_lfs.downloaded')}: "
                f"{len(receipt.downloaded_assets)}\n"
                f"{self._t('cheap_lfs.recovery_pointer')}: "
                f"{receipt.recovery_path}"
            )
            self.app.notify(
                self._t("cheap_lfs.restored_notice", path=receipt.relative_path),
                title=self._t("cheap_lfs.title"),
            )
        finally:
            self._end_mutation()

    def _set_detail(self, value: str) -> None:
        self.query_one("#cheap-lfs-plan", TextArea).text = value

    def _set_error_detail(self, error: Exception) -> None:
        self._set_detail(
            self._t(
                "cheap_lfs.error.detail",
                reason=str(error),
            )
        )

    def _begin_mutation(self, operation: str) -> bool:
        if self.mutation_active:
            self.app.notify(
                self.mutation_warning(),
                title=self._t("cheap_lfs.title"),
                severity="warning",
                timeout=600,
            )
            return False
        self.mutation_active = True
        self.mutation_operation = operation
        for selector in ("#cheap-lfs-track", "#cheap-lfs-restore"):
            self.query_one(selector, Button).disabled = True
        return True

    def _end_mutation(self) -> None:
        self.mutation_active = False
        self.mutation_operation = ""
        for selector in ("#cheap-lfs-track", "#cheap-lfs-restore"):
            self.query_one(selector, Button).disabled = False

    def mutation_warning(self) -> str:
        operation = self.mutation_operation or self._t("cheap_lfs.operation.transfer")
        return self._t("cheap_lfs.mutation_active", operation=operation)

    def _t(self, key: str, **parameters: object) -> str:
        return self._translator.t(key, **parameters)

    def _entry_state(self, state: str) -> str:
        return self._t(
            {
                "auto-pin-candidate": "cheap_lfs.state.candidate",
                "pointer": "cheap_lfs.state.pointer",
            }.get(state, "cheap_lfs.state.unknown"),
            state=state,
        )

    def _entry_detail_text(self, entry: CheapLfsInventoryEntry) -> str:
        if entry.state == "auto-pin-candidate":
            return self._t("cheap_lfs.detail.candidate")
        if entry.verified is True:
            return self._t("cheap_lfs.detail.cache_verified")
        if entry.verified is False:
            return self._t("cheap_lfs.detail.cache_missing")
        return entry.detail

    def _entry_detail(self, entry: CheapLfsInventoryEntry) -> str:
        return (
            f"{self._t('cheap_lfs.column.path')}: {entry.relative_path}\n"
            f"{self._t('cheap_lfs.column.state')}: "
            f"{self._entry_state(entry.state)}\n"
            f"{self._t('cheap_lfs.column.bytes')}: {entry.size_in_bytes}\n"
            f"{self._t('cheap_lfs.column.release')}: "
            f"{entry.release_tag or self._t('cheap_lfs.not_planned')}\n"
            f"{self._t('cheap_lfs.column.assets')}: {entry.asset_count}\n"
            f"{self._t('cheap_lfs.column.cached')}: "
            f"{entry.cached_parts}/{entry.asset_count}\n"
            f"{self._t('cheap_lfs.column.sha')}: "
            f"{entry.sha256 or self._t('cheap_lfs.preview_required')}\n"
            f"{self._entry_detail_text(entry)}"
        )

    def _track_plan_text(self, plan: CheapLfsTrackPlan) -> str:
        assets = "\n".join(
            f"- {part.asset_name}: {part.length} "
            f"{self._t('cheap_lfs.bytes_lower')} sha256:{part.sha256}"
            for part in plan.parts
        )
        return (
            f"{self._t('cheap_lfs.plan.local')}\n"
            f"{self._t('cheap_lfs.repository')}: {plan.repository_slug}\n"
            f"{self._t('cheap_lfs.column.path')}: {plan.relative_path}\n"
            f"{self._t('cheap_lfs.column.release')}: {plan.release_tag}\n"
            f"{self._t('cheap_lfs.column.bytes')}: {plan.size_in_bytes}\n"
            f"SHA-256: {plan.sha256}\n"
            f"{self._t('cheap_lfs.plan.provider')}\n"
            f"{self._t('cheap_lfs.column.assets')}:\n{assets}\n"
            f"{self._t('cheap_lfs.plan.effects')}"
        )

    def _restore_plan_text(self, plan: CheapLfsRestorePlan) -> str:
        downloads = (
            "\n".join(f"- {name}" for name in plan.download_assets)
            if plan.download_assets
            else f"- {self._t('cheap_lfs.restore_no_download')}"
        )
        return (
            f"{self._t('cheap_lfs.column.path')}: {plan.relative_path}\n"
            f"{self._t('cheap_lfs.column.release')}: {plan.pointer.release_tag}\n"
            f"{self._t('cheap_lfs.column.bytes')}: {plan.pointer.size_in_bytes}\n"
            f"SHA-256: {plan.pointer.sha256}\n"
            f"{self._t('cheap_lfs.column.cached')}: {plan.cached_parts}\n"
            f"{self._t('cheap_lfs.provider_downloads')}:\n{downloads}\n"
            f"{self._t('cheap_lfs.restore_effect')}"
        )

    def action_reload(self) -> Worker[None] | None:
        return self.reload()
