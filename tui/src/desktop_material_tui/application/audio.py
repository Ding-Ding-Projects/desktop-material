"""Bundled narration, melody cues, and serialized Linux audio playback.

All media comes byte-for-byte from the repository's tracked desktop catalog.
Playback is optional and off by default.  A single worker serializes melody,
English, and Hong Kong Cantonese clips, replaces superseded queued events, and
never lets narration overlap.  Quiet hours, reduced-sound mode, and an active
screen reader suppress optional playback before a child process is started.
"""

from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import threading
import time
from collections import deque
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
from datetime import time as clock_time
from pathlib import Path, PurePath
from typing import Literal, Protocol

NarrationLanguage = Literal["english", "cantonese", "both"]
NarrationLocale = Literal["en", "yue"]
AudioKind = Literal["melody", "narration"]

_MAX_MANIFEST_BYTES = 2 * 1_024 * 1_024
_MAX_EVENTS = 512
_MAX_TEXT = 4_096
_MAX_QUEUE = 32
_MIN_DEBOUNCE_SECONDS = 0.15
_MAX_COOLDOWN_SECONDS = 60 * 60.0


class AudioError(RuntimeError):
    """The bundled catalog or a playback request was unsafe or malformed."""


@dataclass(frozen=True)
class NarrationVoiceAsset:
    text: str
    voice: str
    file: str


@dataclass(frozen=True)
class NarrationEvent:
    id: str
    category: str
    english: NarrationVoiceAsset
    cantonese: NarrationVoiceAsset
    melody: str | None


@dataclass(frozen=True)
class NarrationManifest:
    events: tuple[NarrationEvent, ...]
    directory: Path

    def by_id(self, event_id: str) -> NarrationEvent | None:
        return next((event for event in self.events if event.id == event_id), None)


@dataclass(frozen=True)
class AudioPolicy:
    enabled: bool = False
    language: NarrationLanguage = "english"
    reduced_sound: bool = False
    quiet_hours_start: str = ""
    quiet_hours_end: str = ""
    yield_to_screen_reader: bool = True
    english_funny_level: int = 1
    cantonese_funny_level: int = 1

    def validate(self) -> None:
        if self.language not in {"english", "cantonese", "both"}:
            raise AudioError("Narrator language is invalid")
        if not 1 <= self.english_funny_level <= 5:
            raise AudioError("English funny level must be between 1 and 5")
        if not 1 <= self.cantonese_funny_level <= 5:
            raise AudioError("Cantonese funny level must be between 1 and 5")
        if bool(self.quiet_hours_start) != bool(self.quiet_hours_end):
            raise AudioError("Quiet hours must provide both a start and an end")
        if self.quiet_hours_start:
            _parse_clock(self.quiet_hours_start)
            _parse_clock(self.quiet_hours_end)

    def is_quiet(self, now: datetime) -> bool:
        self.validate()
        if not self.quiet_hours_start:
            return False
        start = _parse_clock(self.quiet_hours_start)
        end = _parse_clock(self.quiet_hours_end)
        current = now.timetz().replace(tzinfo=None)
        if start == end:
            return True
        if start < end:
            return start <= current < end
        return current >= start or current < end


@dataclass(frozen=True)
class AudioClip:
    event_id: str
    category: str
    kind: AudioKind
    path: Path
    locale: NarrationLocale | None = None
    text: str = ""
    funny_level: int = 1


@dataclass(frozen=True)
class NarrationPlan:
    event_id: str
    category: str
    clips: tuple[AudioClip, ...]
    skipped_reason: str = ""

    @property
    def playable(self) -> bool:
        return bool(self.clips) and not self.skipped_reason


@dataclass(frozen=True)
class PlaybackCommand:
    argv: tuple[str, ...]
    label: str


@dataclass(frozen=True)
class PlaybackRecord:
    event_id: str
    category: str
    played_clips: int
    status: Literal["done", "skipped", "cancelled", "failed"]
    detail: str


class ClipExecutor(Protocol):
    def play(self, clip: AudioClip, cancel_event: threading.Event) -> bool:
        """Play one clip synchronously; return false on unavailable/failed playback."""


def load_bundled_narration_manifest(directory: Path | None = None) -> NarrationManifest:
    """Load and strictly verify every indexed, repository-tracked audio file."""

    root = directory or Path(__file__).resolve().parents[1] / "assets" / "audio"
    root = root.resolve()
    manifest_path = root / "manifest.json"
    try:
        if manifest_path.stat().st_size > _MAX_MANIFEST_BYTES:
            raise AudioError("Narration manifest exceeds its size bound")
        document = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise AudioError(f"Could not load bundled narration manifest: {error}") from error
    if not isinstance(document, dict) or not isinstance(document.get("events"), list):
        raise AudioError("Narration manifest is malformed")
    raw_events = document["events"]
    if not raw_events or len(raw_events) > _MAX_EVENTS:
        raise AudioError("Narration event count is invalid")
    events: list[NarrationEvent] = []
    identifiers: set[str] = set()
    files: set[str] = set()
    for raw in raw_events:
        if not isinstance(raw, dict):
            raise AudioError("Narration event is malformed")
        event_id = _safe_identifier(raw.get("id"), "event id")
        if event_id in identifiers:
            raise AudioError("Narration event id is duplicated")
        identifiers.add(event_id)
        category = _safe_identifier(raw.get("category", "info"), "category")
        english = _parse_voice(raw.get("en"), root, files)
        cantonese = _parse_voice(raw.get("yue"), root, files)
        melody_raw = raw.get("melody")
        melody = None
        if melody_raw is not None:
            melody = _safe_asset_name(melody_raw, ".wav")
            _verify_asset(root, melody, files)
        events.append(NarrationEvent(event_id, category, english, cantonese, melody))
    return NarrationManifest(tuple(events), root)


def plan_narration(
    manifest: NarrationManifest,
    event_id: str,
    policy: AudioPolicy,
    *,
    now: datetime | None = None,
    screen_reader_active: bool = False,
    include_melody: bool = True,
) -> NarrationPlan:
    """Build a deterministic melody → English → Cantonese serialized plan."""

    policy.validate()
    event = manifest.by_id(event_id)
    category = event.category if event is not None else "unknown"
    if event is None:
        return NarrationPlan(event_id, category, (), "Narration event is unavailable.")
    if not policy.enabled:
        return NarrationPlan(event_id, category, (), "Narrator is disabled.")
    if policy.reduced_sound:
        return NarrationPlan(event_id, category, (), "Reduced-sound mode is active.")
    if policy.yield_to_screen_reader and screen_reader_active:
        return NarrationPlan(event_id, category, (), "An active screen reader owns speech.")
    if policy.is_quiet(now or datetime.now().astimezone()):
        return NarrationPlan(event_id, category, (), "Quiet hours are active.")
    clips: list[AudioClip] = []
    if include_melody and event.melody is not None:
        clips.append(
            AudioClip(event.id, event.category, "melody", manifest.directory / event.melody)
        )
    if policy.language == "both":
        locales: tuple[NarrationLocale, ...] = ("en", "yue")
    elif policy.language == "cantonese":
        locales = ("yue",)
    else:
        locales = ("en",)
    for locale in locales:
        voice = event.english if locale == "en" else event.cantonese
        funny_level = (
            policy.english_funny_level if locale == "en" else policy.cantonese_funny_level
        )
        clips.append(
            AudioClip(
                event.id,
                event.category,
                "narration",
                manifest.directory / voice.file,
                locale,
                voice.text,
                funny_level,
            )
        )
    return NarrationPlan(event.id, event.category, tuple(clips))


class LinuxAudioExecutor:
    """Detect one conventional Linux media player and invoke it without a shell."""

    def __init__(self, executable: str | Path | None = None) -> None:
        self.executable = os.fspath(executable) if executable is not None else self._detect()

    @property
    def available(self) -> bool:
        return bool(self.executable)

    def command_for(self, path: Path) -> PlaybackCommand:
        if not self.executable:
            raise AudioError("No supported audio player was found")
        executable = self.executable
        name = Path(executable).name.casefold()
        argv: tuple[str, ...]
        if name in {"ffplay", "ffplay.exe"}:
            argv = (executable, "-nodisp", "-autoexit", "-loglevel", "quiet", "--", str(path))
        elif name in {"mpv", "mpv.exe"}:
            argv = (executable, "--no-video", "--really-quiet", "--", str(path))
        elif name in {"cvlc", "vlc", "vlc.exe"}:
            argv = (executable, "--intf", "dummy", "--play-and-exit", str(path))
        elif name in {"play", "play.exe"}:
            argv = (executable, "-q", str(path))
        else:
            raise AudioError("Configured audio player is unsupported")
        return PlaybackCommand(argv, f"Play bundled {path.suffix.lower()} audio")

    def play(self, clip: AudioClip, cancel_event: threading.Event) -> bool:
        if not self.available:
            return False
        command = self.command_for(clip.path)
        try:
            process: subprocess.Popen[bytes] = subprocess.Popen(  # noqa: S603
                command.argv,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                shell=False,
                start_new_session=os.name == "posix",
                creationflags=(
                    getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
                    if os.name == "nt"
                    else 0
                ),
            )
        except (OSError, ValueError):
            return False
        while process.poll() is None:
            if cancel_event.wait(0.05):
                self._terminate(process)
                return False
        return process.returncode == 0

    @staticmethod
    def _detect() -> str:
        for candidate in ("ffplay", "mpv", "cvlc", "play"):
            executable = shutil.which(candidate)
            if executable is not None:
                return executable
        return ""

    @staticmethod
    def _terminate(process: subprocess.Popen[bytes]) -> None:
        if process.poll() is not None:
            return
        try:
            if os.name == "posix" and hasattr(os, "killpg"):
                os.killpg(process.pid, signal.SIGTERM)
            else:
                process.terminate()
            process.wait(timeout=1)
        except (OSError, ProcessLookupError, subprocess.TimeoutExpired):
            try:
                if os.name == "posix" and hasattr(os, "killpg"):
                    os.killpg(process.pid, getattr(signal, "SIGKILL", signal.SIGTERM))
                else:
                    process.kill()
            except (OSError, ProcessLookupError):
                pass


class SerializedNarrator:
    """One-worker narrator with replacement, debounce, cooldown, and cleanup."""

    def __init__(
        self,
        manifest: NarrationManifest,
        *,
        executor: ClipExecutor | None = None,
        policy_provider: Callable[[], AudioPolicy] | None = None,
        screen_reader_active: Callable[[], bool] | None = None,
        now: Callable[[], datetime] | None = None,
        monotonic: Callable[[], float] | None = None,
        category_cooldown_seconds: float = 2.0,
        debounce_seconds: float = 0.2,
    ) -> None:
        if not 0 <= category_cooldown_seconds <= _MAX_COOLDOWN_SECONDS:
            raise AudioError("Narrator category cooldown is invalid")
        if not _MIN_DEBOUNCE_SECONDS <= debounce_seconds <= 10.0:
            raise AudioError("Narrator debounce is invalid")
        self.manifest = manifest
        self.executor = executor or LinuxAudioExecutor()
        self.policy_provider = policy_provider or AudioPolicy
        self.screen_reader_active = screen_reader_active or (lambda: False)
        self.now = now or (lambda: datetime.now().astimezone())
        self.monotonic = monotonic or time.monotonic
        self.category_cooldown_seconds = category_cooldown_seconds
        self.debounce_seconds = debounce_seconds
        self._queue: deque[tuple[float, NarrationPlan]] = deque()
        self._history: deque[PlaybackRecord] = deque(maxlen=256)
        self._last_category: dict[str, float] = {}
        self._condition = threading.Condition()
        self._closed = False
        self._active = False
        self._cancel_current = threading.Event()
        self._thread = threading.Thread(target=self._worker, name="dmt-narrator", daemon=True)
        self._thread.start()

    def enqueue(self, event_id: str, *, include_melody: bool = True) -> NarrationPlan:
        plan = plan_narration(
            self.manifest,
            event_id,
            self.policy_provider(),
            now=self.now(),
            screen_reader_active=self.screen_reader_active(),
            include_melody=include_melody,
        )
        with self._condition:
            if self._closed:
                raise AudioError("Narrator is closed")
            if not plan.playable:
                self._history.append(
                    PlaybackRecord(plan.event_id, plan.category, 0, "skipped", plan.skipped_reason)
                )
                return plan
            current = self.monotonic()
            previous = self._last_category.get(plan.category)
            if previous is not None and current - previous < self.category_cooldown_seconds:
                skipped = NarrationPlan(
                    plan.event_id,
                    plan.category,
                    (),
                    "Narrator category cooldown is active.",
                )
                self._history.append(
                    PlaybackRecord(
                        skipped.event_id,
                        skipped.category,
                        0,
                        "skipped",
                        skipped.skipped_reason,
                    )
                )
                return skipped
            # A newer line supersedes a queued line in the same category.
            self._queue = deque(item for item in self._queue if item[1].category != plan.category)
            while len(self._queue) >= _MAX_QUEUE:
                dropped = self._queue.popleft()[1]
                self._history.append(
                    PlaybackRecord(
                        dropped.event_id,
                        dropped.category,
                        0,
                        "skipped",
                        "Queue bound reached.",
                    )
                )
            self._queue.append((current + self.debounce_seconds, plan))
            self._condition.notify_all()
        return plan

    def history(self) -> tuple[PlaybackRecord, ...]:
        with self._condition:
            return tuple(self._history)

    def wait_idle(self, timeout_seconds: float = 10.0) -> bool:
        deadline = time.monotonic() + timeout_seconds
        with self._condition:
            while self._active or self._queue:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return False
                self._condition.wait(timeout=remaining)
            return True

    def close(self, timeout_seconds: float = 5.0) -> None:
        with self._condition:
            self._closed = True
            self._queue.clear()
            self._cancel_current.set()
            self._condition.notify_all()
        self._thread.join(timeout=timeout_seconds)

    def _worker(self) -> None:
        while True:
            with self._condition:
                while not self._queue and not self._closed:
                    self._condition.wait()
                if self._closed:
                    return
                due, plan = self._queue[0]
                delay = due - self.monotonic()
                if delay > 0:
                    self._condition.wait(timeout=delay)
                    continue
                self._queue.popleft()
                self._active = True
                self._cancel_current = threading.Event()
            played = 0
            status: Literal["done", "skipped", "cancelled", "failed"] = "done"
            detail = "Narration completed."
            for clip in plan.clips:
                if self._cancel_current.is_set():
                    status = "cancelled"
                    detail = "Narration was cancelled."
                    break
                try:
                    ok = self.executor.play(clip, self._cancel_current)
                except Exception:
                    ok = False
                if not ok:
                    status = "cancelled" if self._cancel_current.is_set() else "failed"
                    detail = (
                        "Narration was cancelled."
                        if status == "cancelled"
                        else "The configured audio player could not play a bundled clip."
                    )
                    break
                played += 1
            with self._condition:
                self._active = False
                if status == "done":
                    self._last_category[plan.category] = self.monotonic()
                self._history.append(
                    PlaybackRecord(plan.event_id, plan.category, played, status, detail)
                )
                self._condition.notify_all()


def _parse_voice(value: object, root: Path, files: set[str]) -> NarrationVoiceAsset:
    if not isinstance(value, Mapping):
        raise AudioError("Narration voice entry is malformed")
    text = value.get("text")
    voice = value.get("voice")
    if not isinstance(text, str) or not text or len(text) > _MAX_TEXT:
        raise AudioError("Narration text is invalid")
    if not isinstance(voice, str) or not voice or len(voice) > 256:
        raise AudioError("Narration voice name is invalid")
    filename = _safe_asset_name(value.get("file"), ".mp3")
    _verify_asset(root, filename, files)
    return NarrationVoiceAsset(text, voice, filename)


def _safe_identifier(value: object, label: str) -> str:
    if (
        not isinstance(value, str)
        or not value
        or len(value) > 128
        or any(character not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for character in value)
    ):
        raise AudioError(f"Narration {label} is invalid")
    return value


def _safe_asset_name(value: object, suffix: str) -> str:
    if (
        not isinstance(value, str)
        or not value
        or len(value) > 240
        or PurePath(value).name != value
        or value.startswith("-")
        or not value.casefold().endswith(suffix)
    ):
        raise AudioError("Narration asset name is invalid")
    return value


def _verify_asset(root: Path, filename: str, files: set[str]) -> None:
    if filename in files:
        raise AudioError("Narration asset filename is duplicated")
    files.add(filename)
    path = root / filename
    if path.is_symlink() or not path.is_file():
        raise AudioError(f"Bundled narration asset is missing: {filename}")
    try:
        with path.open("rb") as handle:
            header = handle.read(12)
    except OSError as error:
        raise AudioError(f"Could not read bundled narration asset: {filename}") from error
    if filename.casefold().endswith(".wav"):
        valid = len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WAVE"
    else:
        valid = header.startswith(b"ID3") or (
            len(header) >= 2 and header[0] == 0xFF and header[1] & 0xE0 == 0xE0
        )
    if not valid:
        raise AudioError(f"Bundled narration asset has an invalid header: {filename}")


def _parse_clock(value: str) -> clock_time:
    try:
        return datetime.strptime(value, "%H:%M").time()
    except ValueError as error:
        raise AudioError("Quiet hours must use 24-hour HH:MM") from error
