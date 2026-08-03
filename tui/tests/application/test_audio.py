"""Bundled narration catalog, policy, queue, and Linux player contracts."""

from __future__ import annotations

import json
import shutil
import threading
from datetime import datetime
from pathlib import Path

import pytest

from desktop_material_tui.application.audio import (
    AudioClip,
    AudioError,
    AudioPolicy,
    LinuxAudioExecutor,
    NarrationManifest,
    SerializedNarrator,
    load_bundled_narration_manifest,
    plan_narration,
)


class FakeExecutor:
    def __init__(self, *, block: bool = False, fail: bool = False) -> None:
        self.block = block
        self.fail = fail
        self.played: list[AudioClip] = []
        self.started = threading.Event()

    def play(self, clip: AudioClip, cancel_event: threading.Event) -> bool:
        self.played.append(clip)
        self.started.set()
        if self.block:
            cancel_event.wait(5)
        return not self.fail and not cancel_event.is_set()


def _enabled(**changes: object) -> AudioPolicy:
    values: dict[str, object] = {
        "enabled": True,
        "language": "english",
        "reduced_sound": False,
        "quiet_hours_start": "",
        "quiet_hours_end": "",
        "yield_to_screen_reader": True,
        "english_funny_level": 1,
        "cantonese_funny_level": 1,
    }
    values.update(changes)
    return AudioPolicy(**values)  # type: ignore[arg-type]


def test_bundled_manifest_verifies_all_81_trilingual_event_assets() -> None:
    manifest = load_bundled_narration_manifest()

    assert len(manifest.events) == 81
    assert len({event.id for event in manifest.events}) == 81
    assert all(event.melody is not None for event in manifest.events)
    indexed = {
        name
        for event in manifest.events
        for name in (event.english.file, event.cantonese.file, event.melody)
        if name is not None
    }
    assert len(indexed) == 243
    assert all((manifest.directory / name).is_file() for name in indexed)


def test_copied_catalog_is_byte_identical_to_desktop_assets() -> None:
    manifest = load_bundled_narration_manifest()
    repository = Path(__file__).resolve().parents[3]
    desktop = repository / "app" / "static" / "audio"

    assert (manifest.directory / "manifest.json").read_bytes() == (
        desktop / "manifest.json"
    ).read_bytes()
    for event in manifest.events:
        for filename in (event.english.file, event.cantonese.file, event.melody):
            assert filename is not None
            assert (manifest.directory / filename).read_bytes() == (desktop / filename).read_bytes()


@pytest.mark.parametrize(
    ("language", "locales"),
    [
        ("english", ["en"]),
        ("cantonese", ["yue"]),
        ("both", ["en", "yue"]),
    ],
)
def test_plan_serializes_melody_then_selected_languages(
    language: str, locales: list[str]
) -> None:
    manifest = load_bundled_narration_manifest()
    policy = _enabled(
        language=language,
        english_funny_level=4,
        cantonese_funny_level=5,
    )

    plan = plan_narration(manifest, "commit-created", policy)

    assert plan.playable
    assert plan.clips[0].kind == "melody"
    voices = [clip for clip in plan.clips if clip.kind == "narration"]
    assert [clip.locale for clip in voices] == locales
    assert [clip.funny_level for clip in voices] == [
        4 if locale == "en" else 5 for locale in locales
    ]
    assert all(clip.text for clip in voices)


@pytest.mark.parametrize(
    ("policy", "screen_reader", "reason"),
    [
        (AudioPolicy(), False, "disabled"),
        (_enabled(reduced_sound=True), False, "Reduced-sound"),
        (_enabled(), True, "screen reader"),
        (
            _enabled(quiet_hours_start="22:00", quiet_hours_end="07:00"),
            False,
            "Quiet hours",
        ),
    ],
)
def test_policy_suppresses_optional_audio_before_playback(
    policy: AudioPolicy, screen_reader: bool, reason: str
) -> None:
    plan = plan_narration(
        load_bundled_narration_manifest(),
        "welcome",
        policy,
        now=datetime(2026, 8, 2, 23, 0),
        screen_reader_active=screen_reader,
    )

    assert not plan.playable
    assert reason.casefold() in plan.skipped_reason.casefold()


def test_quiet_hours_handle_daytime_overnight_and_equal_bounds() -> None:
    daytime = _enabled(quiet_hours_start="09:00", quiet_hours_end="17:00")
    overnight = _enabled(quiet_hours_start="22:00", quiet_hours_end="07:00")
    all_day = _enabled(quiet_hours_start="12:00", quiet_hours_end="12:00")

    assert daytime.is_quiet(datetime(2026, 8, 2, 10, 0))
    assert not daytime.is_quiet(datetime(2026, 8, 2, 18, 0))
    assert overnight.is_quiet(datetime(2026, 8, 2, 23, 0))
    assert overnight.is_quiet(datetime(2026, 8, 2, 6, 59))
    assert not overnight.is_quiet(datetime(2026, 8, 2, 12, 0))
    assert all_day.is_quiet(datetime(2026, 8, 2, 8, 0))


@pytest.mark.parametrize(
    "policy",
    [
        _enabled(language="unknown"),
        _enabled(english_funny_level=0),
        _enabled(cantonese_funny_level=6),
        _enabled(quiet_hours_start="22:00", quiet_hours_end=""),
        _enabled(quiet_hours_start="25:00", quiet_hours_end="07:00"),
    ],
)
def test_invalid_policy_fails_closed(policy: AudioPolicy) -> None:
    with pytest.raises(AudioError):
        policy.validate()


def test_missing_event_is_an_honest_non_playable_plan() -> None:
    plan = plan_narration(
        load_bundled_narration_manifest(), "missing-event", _enabled()
    )
    assert not plan.playable
    assert "unavailable" in plan.skipped_reason


def test_manifest_rejects_traversal_duplicates_missing_and_invalid_headers(
    tmp_path: Path,
) -> None:
    source = load_bundled_narration_manifest()
    event = source.by_id("welcome")
    assert event is not None
    assert event.melody is not None
    for filename in (event.english.file, event.cantonese.file, event.melody):
        shutil.copyfile(source.directory / filename, tmp_path / filename)
    base = {
        "events": [
            {
                "id": "welcome",
                "category": "info",
                "en": {
                    "text": "Welcome",
                    "voice": "English",
                    "file": event.english.file,
                },
                "yue": {
                    "text": "歡迎",
                    "voice": "Cantonese",
                    "file": event.cantonese.file,
                },
                "melody": event.melody,
            }
        ]
    }
    (tmp_path / "manifest.json").write_text(json.dumps(base), encoding="utf-8")
    assert len(load_bundled_narration_manifest(tmp_path).events) == 1

    base["events"][0]["melody"] = "../outside.wav"
    (tmp_path / "manifest.json").write_text(json.dumps(base), encoding="utf-8")
    with pytest.raises(AudioError, match="asset name"):
        load_bundled_narration_manifest(tmp_path)

    base["events"][0]["melody"] = event.melody
    (tmp_path / event.melody).write_bytes(b"not a wave")
    (tmp_path / "manifest.json").write_text(json.dumps(base), encoding="utf-8")
    with pytest.raises(AudioError, match="invalid header"):
        load_bundled_narration_manifest(tmp_path)


@pytest.mark.parametrize(
    ("executable", "expected"),
    [
        ("/usr/bin/ffplay", ("-nodisp", "-autoexit", "-loglevel", "quiet", "--")),
        ("/usr/bin/mpv", ("--no-video", "--really-quiet", "--")),
        ("/usr/bin/cvlc", ("--intf", "dummy", "--play-and-exit")),
        ("/usr/bin/play", ("-q",)),
    ],
)
def test_linux_player_commands_are_explicit_argv(
    executable: str, expected: tuple[str, ...]
) -> None:
    path = Path("audio name.mp3").resolve()
    command = LinuxAudioExecutor(executable).command_for(path)

    assert command.argv[0] == executable
    assert command.argv[1 : 1 + len(expected)] == expected
    assert command.argv[-1] == str(path)
    assert "shell" not in command.label.casefold()


def test_unknown_or_missing_player_fails_without_spawning() -> None:
    missing = LinuxAudioExecutor("")
    assert not missing.available
    with pytest.raises(AudioError, match="No supported"):
        missing.command_for(Path("clip.mp3"))
    with pytest.raises(AudioError, match="unsupported"):
        LinuxAudioExecutor("/usr/bin/mystery-player").command_for(Path("clip.mp3"))


def test_serialized_narrator_never_overlaps_and_keeps_language_order() -> None:
    manifest = load_bundled_narration_manifest()
    executor = FakeExecutor()
    narrator = SerializedNarrator(
        manifest,
        executor=executor,
        policy_provider=lambda: _enabled(language="both"),
        category_cooldown_seconds=0,
        debounce_seconds=0.15,
    )
    try:
        narrator.enqueue("welcome")
        assert narrator.wait_idle()
    finally:
        narrator.close()

    assert [clip.kind for clip in executor.played] == ["melody", "narration", "narration"]
    assert [clip.locale for clip in executor.played[1:]] == ["en", "yue"]
    assert narrator.history()[-1].status == "done"
    assert narrator.history()[-1].played_clips == 3


def test_newer_queued_event_replaces_same_category_during_debounce() -> None:
    manifest = load_bundled_narration_manifest()
    executor = FakeExecutor()
    narrator = SerializedNarrator(
        manifest,
        executor=executor,
        policy_provider=lambda: _enabled(),
        category_cooldown_seconds=0,
        debounce_seconds=0.3,
    )
    try:
        narrator.enqueue("welcome", include_melody=False)
        narrator.enqueue("up-to-date", include_melody=False)
        assert narrator.wait_idle()
    finally:
        narrator.close()

    assert [clip.event_id for clip in executor.played] == ["up-to-date"]


def test_category_cooldown_skips_repeated_low_signal_events() -> None:
    manifest = load_bundled_narration_manifest()
    executor = FakeExecutor()
    narrator = SerializedNarrator(
        manifest,
        executor=executor,
        policy_provider=lambda: _enabled(),
        category_cooldown_seconds=30,
        debounce_seconds=0.15,
    )
    try:
        narrator.enqueue("commit-created", include_melody=False)
        assert narrator.wait_idle()
        skipped = narrator.enqueue("push-complete", include_melody=False)
    finally:
        narrator.close()

    assert not skipped.playable
    assert "cooldown" in skipped.skipped_reason
    assert [clip.event_id for clip in executor.played] == ["commit-created"]


def test_close_cancels_active_player_and_worker_exits() -> None:
    manifest = load_bundled_narration_manifest()
    executor = FakeExecutor(block=True)
    narrator = SerializedNarrator(
        manifest,
        executor=executor,
        policy_provider=lambda: _enabled(),
        category_cooldown_seconds=0,
        debounce_seconds=0.15,
    )
    narrator.enqueue("welcome", include_melody=False)
    assert executor.started.wait(2)

    narrator.close()

    assert narrator.history()[-1].status == "cancelled"


def test_disabled_enqueue_never_calls_player_and_records_skip() -> None:
    manifest: NarrationManifest = load_bundled_narration_manifest()
    executor = FakeExecutor()
    narrator = SerializedNarrator(
        manifest,
        executor=executor,
        policy_provider=AudioPolicy,
    )
    try:
        plan = narrator.enqueue("welcome")
        assert narrator.wait_idle()
    finally:
        narrator.close()

    assert not plan.playable
    assert executor.played == []
    assert narrator.history()[-1].status == "skipped"
