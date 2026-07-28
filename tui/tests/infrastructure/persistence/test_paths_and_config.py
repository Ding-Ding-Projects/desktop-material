from __future__ import annotations

import os
from dataclasses import replace
from pathlib import Path

import pytest

from desktop_material_tui.infrastructure.persistence import (
    AppConfig,
    AppearanceConfig,
    ConfigError,
    ConfigStore,
    InteractionConfig,
    LanguageConfig,
    SearchConfig,
    XDGPaths,
)


def test_xdg_paths_use_absolute_overrides_and_private_app_directories(
    tmp_path: Path,
) -> None:
    paths = XDGPaths.discover(
        environment={
            "XDG_CONFIG_HOME": str(tmp_path / "cfg"),
            "XDG_DATA_HOME": str(tmp_path / "data"),
            "XDG_STATE_HOME": str(tmp_path / "state"),
            "XDG_CACHE_HOME": str(tmp_path / "cache"),
            "XDG_RUNTIME_DIR": str(tmp_path / "runtime"),
        },
        home=tmp_path / "home",
    ).ensure()

    assert paths.config_dir == tmp_path / "cfg" / "desktop-material-tui"
    assert paths.data_dir == tmp_path / "data" / "desktop-material-tui"
    assert paths.state_dir == tmp_path / "state" / "desktop-material-tui"
    assert paths.cache_dir == tmp_path / "cache" / "desktop-material-tui"
    assert paths.runtime_dir == tmp_path / "runtime" / "desktop-material-tui"
    assert paths.profile_history_root.is_dir()
    assert paths.lock_dir.is_dir()


def test_xdg_paths_ignore_relative_overrides(tmp_path: Path) -> None:
    paths = XDGPaths.discover(
        environment={
            "XDG_CONFIG_HOME": "relative/config",
            "XDG_RUNTIME_DIR": "relative/run",
        },
        home=tmp_path,
    )
    assert paths.config_dir == tmp_path / ".config" / "desktop-material-tui"
    assert paths.runtime_dir == (tmp_path / ".local" / "state" / "desktop-material-tui" / "run")


def test_config_round_trip_includes_settings_ui_fields(tmp_path: Path) -> None:
    paths = XDGPaths.discover(environment={}, home=tmp_path)
    store = ConfigStore(paths)
    expected = AppConfig(
        active_profile="work",
        appearance=AppearanceConfig(
            theme="dark",
            density="compact",
            accent="#123abc",
            unicode_borders=False,
            reduced_motion=True,
            element_overrides={
                "diff": {
                    "foreground": "#abcdef",
                    "background": "#102030",
                    "styles": ["bold", "heavy-border"],
                }
            },
        ),
        language=LanguageConfig(
            mode="bilingual",
            english_funny_level=2,
            cantonese_funny_level=5,
        ),
        interaction=InteractionConfig(
            mouse_enabled=True,
            confirm_destructive_actions=True,
            notification_timeout_seconds=9,
            editor="nvim",
            terminal="kitty",
            narrator_enabled=True,
            narrator_language="both",
            quiet_hours_start="22:30",
            quiet_hours_end="07:15",
            reduced_sound=True,
            yield_to_screen_reader=True,
        ),
        search=SearchConfig(
            default_mode="literal",
            case_sensitive=True,
            multiline=True,
        ),
    )

    store.save(expected)

    assert store.load() == expected
    assert paths.config_file.read_bytes().startswith(b"schema_version = 1")
    assert not list(paths.config_dir.glob("*.tmp"))
    if os.name != "nt":
        assert paths.config_file.stat().st_mode & 0o777 == 0o600


def test_config_missing_new_fields_uses_safe_defaults(tmp_path: Path) -> None:
    paths = XDGPaths.discover(environment={}, home=tmp_path).ensure()
    paths.config_file.write_text(
        'schema_version = 1\nactive_profile = "local"\n[interaction]\nmouse_enabled = false\n',
        encoding="utf-8",
    )

    loaded = ConfigStore(paths).load()

    assert loaded.interaction.mouse_enabled is False
    assert loaded.interaction.editor == "auto"
    assert loaded.interaction.terminal == "auto"
    assert loaded.interaction.narrator_enabled is False
    assert loaded.interaction.narrator_language == "english"
    assert loaded.interaction.quiet_hours_start == ""
    assert loaded.interaction.reduced_sound is False
    assert loaded.interaction.yield_to_screen_reader is True
    assert loaded.appearance.element_overrides == {}


def test_config_rejects_invalid_element_appearance(tmp_path: Path) -> None:
    store = ConfigStore(XDGPaths.discover(environment={}, home=tmp_path))
    appearance = AppearanceConfig(
        element_overrides={
            "unknown": {
                "foreground": "red",
                "background": "",
                "styles": ["blink"],
            }
        }
    )

    with pytest.raises(ConfigError):
        store.save(AppConfig(appearance=appearance))


@pytest.mark.parametrize(
    "interaction",
    [
        InteractionConfig(quiet_hours_start="22:00"),
        InteractionConfig(quiet_hours_start="25:00", quiet_hours_end="07:00"),
        InteractionConfig(narrator_language="klingon"),
        InteractionConfig(terminal="bad\ncommand"),
    ],
)
def test_config_rejects_unsafe_interaction_values(
    tmp_path: Path,
    interaction: InteractionConfig,
) -> None:
    store = ConfigStore(XDGPaths.discover(environment={}, home=tmp_path))
    with pytest.raises(ConfigError):
        store.save(AppConfig(interaction=interaction))


def test_config_load_or_default_does_not_overwrite_corrupt_file(tmp_path: Path) -> None:
    paths = XDGPaths.discover(environment={}, home=tmp_path).ensure()
    corrupt = b"not = [valid"
    paths.config_file.write_bytes(corrupt)

    loaded = ConfigStore(paths).load_or_default()

    assert loaded == AppConfig()
    assert paths.config_file.read_bytes() == corrupt


def test_locked_update_round_trips_one_typed_revision(tmp_path: Path) -> None:
    store = ConfigStore(XDGPaths.discover(environment={}, home=tmp_path))
    store.save(AppConfig())

    updated = store.update(
        lambda config: replace(
            config,
            language=replace(config.language, mode="cantonese"),
        )
    )

    assert updated.language.mode == "cantonese"
    assert store.load() == updated
