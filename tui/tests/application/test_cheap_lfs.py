"""Cross-platform Cheap LFS plan, provider, cache, and CAS tests."""

from __future__ import annotations

import hashlib
import io
import stat
import zlib
from collections.abc import Collection, Sequence
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import pytest

import desktop_material_tui.application.cheap_lfs as cheap_lfs_application
from desktop_material_tui.application.cheap_lfs import (
    CHEAP_LFS_RELEASE_BODY_SENTINEL,
    CheapLfsError,
    CheapLfsRelease,
    CheapLfsReleaseAsset,
    CheapLfsService,
    GhCheapLfsReleaseProvider,
)
from desktop_material_tui.domain.cheap_lfs import (
    CHEAP_LFS_AUTOMATIC_PIN_THRESHOLD_BYTES,
    CHEAP_LFS_POINTER_VERSION,
    CheapLfsPart,
    CheapLfsPointer,
    parse_cheap_lfs_pointer,
    serialize_cheap_lfs_pointer,
)
from desktop_material_tui.domain.models import GitCommandResult
from desktop_material_tui.infrastructure.github.transport import GhProcessResult


class FakeGitRunner:
    def __init__(self, repository: Path, paths: Sequence[str] = ()) -> None:
        self.repository = repository
        self.paths = tuple(paths)
        self.calls: list[tuple[str, ...]] = []

    def run(
        self,
        args: Sequence[str],
        *,
        cwd: Path,
        timeout: float | None = None,
        input_data: str | bytes | None = None,
        allowed_exit_codes: Collection[int] = (0,),
    ) -> GitCommandResult:
        del timeout, input_data, allowed_exit_codes
        argv = tuple(args)
        self.calls.append(argv)
        if argv[:3] == ("rev-parse", "--path-format=absolute", "--show-toplevel"):
            stdout = f"{self.repository}\n"
        elif argv[:3] == ("remote", "get-url", "origin"):
            stdout = "https://github.com/acme/widgets.git\n"
        elif argv[:2] == ("ls-files", "-z"):
            stdout = "\x00".join((*self.paths, ""))
        else:
            stdout = ""
        return GitCommandResult(
            argv=("git", *argv),
            cwd=cwd,
            exit_code=0,
            stdout=stdout,
            stderr="",
            duration_seconds=0.0,
        )


class FakeReleaseProvider:
    def __init__(self, release: CheapLfsRelease | None = None) -> None:
        self.release = release
        self.bytes_by_name: dict[str, bytes] = {}
        self.uploads: list[str] = []
        self.downloads: list[str] = []

    def get_release(self, repository: str, tag: str) -> CheapLfsRelease | None:
        assert repository == "acme/widgets"
        if self.release is None or self.release.tag != tag:
            return None
        return self.release

    def create_release(self, repository: str, tag: str) -> CheapLfsRelease:
        assert repository == "acme/widgets"
        self.release = CheapLfsRelease(
            tag=tag,
            body=CHEAP_LFS_RELEASE_BODY_SENTINEL,
            draft=False,
            prerelease=True,
            assets=(),
        )
        return self.release

    def upload_asset(
        self,
        repository: str,
        tag: str,
        source: Path,
        asset_name: str,
        label: str,
    ) -> CheapLfsReleaseAsset:
        assert repository == "acme/widgets"
        assert tag == "assets"
        assert label.startswith("cheap-lfs/v1 sha256=")
        payload = source.read_bytes()
        digest = hashlib.sha256(payload).hexdigest()
        asset = CheapLfsReleaseAsset(
            name=asset_name,
            size_in_bytes=len(payload),
            digest=f"sha256:{digest}",
            state="uploaded",
            label=label,
        )
        assert self.release is not None
        self.release = replace(self.release, assets=(*self.release.assets, asset))
        self.bytes_by_name[asset_name] = payload
        self.uploads.append(asset_name)
        return asset

    def download_asset(
        self,
        repository: str,
        tag: str,
        asset_name: str,
        destination: Path,
    ) -> None:
        assert repository == "acme/widgets"
        assert self.release is not None
        assert self.release.tag == tag
        destination.write_bytes(self.bytes_by_name[asset_name])
        self.downloads.append(asset_name)


def _service(
    repository: Path,
    provider: FakeReleaseProvider,
    cache: Path,
    *,
    paths: Sequence[str] = (),
    swap_hook=None,
) -> CheapLfsService:
    return CheapLfsService(
        repository,
        provider=provider,
        repository_slug="acme/widgets",
        cache_root=cache,
        part_size=4,
        git_runner=FakeGitRunner(repository, paths),  # type: ignore[arg-type]
        swap_hook=swap_hook,
    )


def test_track_writes_canonical_pointer_and_restore_is_cache_first(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repo"
    repository.mkdir()
    payload = b"abcdefghij"
    tracked = repository / "large payload.bin"
    tracked.write_bytes(payload)
    provider = FakeReleaseProvider()
    service = _service(repository, provider, tmp_path / "cache")

    plan = service.preview_track("large payload.bin")
    receipt = service.track(plan, confirmed=True, stage=True)
    pointer = parse_cheap_lfs_pointer(tracked.read_text(encoding="utf-8"))

    assert pointer is not None
    assert pointer.version == CHEAP_LFS_POINTER_VERSION
    assert pointer.parts is not None
    assert [part.size_in_bytes for part in pointer.parts] == [4, 4, 2]
    assert len(provider.uploads) == 3
    assert receipt.recovery_path.read_bytes() == payload
    assert any(call[:2] == ("add", "--") for call in service.git_runner.calls)

    restore_plan = service.preview_restore("large payload.bin")
    assert restore_plan.download_assets == ()
    restored = service.restore(restore_plan, confirmed=True)

    assert tracked.read_bytes() == payload
    assert provider.downloads == []
    assert restored.recovery_path.read_text(encoding="utf-8").startswith(
        "version desktop-material/cheap-lfs/v1"
    )


def test_restore_downloads_and_inflates_legacy_raw_deflate_part(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repo"
    repository.mkdir()
    payload = b"A" * 512
    compressor = zlib.compressobj(level=9, wbits=-zlib.MAX_WBITS)
    compressed = compressor.compress(payload) + compressor.flush()
    digest = hashlib.sha256(payload).hexdigest()
    part = CheapLfsPart(
        "payload.bin.part001.deflate",
        len(payload),
        digest,
        len(compressed),
    )
    pointer = CheapLfsPointer(
        CHEAP_LFS_POINTER_VERSION,
        "assets",
        "payload.bin",
        len(payload),
        digest,
        (part,),
    )
    tracked = repository / "payload.bin"
    tracked.write_text(serialize_cheap_lfs_pointer(pointer), encoding="utf-8")
    asset = CheapLfsReleaseAsset(
        part.name,
        len(compressed),
        f"sha256:{hashlib.sha256(compressed).hexdigest()}",
        "uploaded",
    )
    provider = FakeReleaseProvider(
        CheapLfsRelease(
            "assets",
            CHEAP_LFS_RELEASE_BODY_SENTINEL,
            False,
            True,
            (asset,),
        )
    )
    provider.bytes_by_name[part.name] = compressed
    service = _service(repository, provider, tmp_path / "empty-cache")

    plan = service.preview_restore("payload.bin")
    receipt = service.restore(plan, confirmed=True)

    assert plan.download_assets == (part.name,)
    assert receipt.downloaded_assets == (part.name,)
    assert tracked.read_bytes() == payload


@pytest.mark.parametrize(
    ("asset_state", "asset_size"),
    [
        ("processing", 7),
        ("uploaded", 8),
    ],
)
def test_verify_fetch_rejects_provider_metadata_before_download(
    tmp_path: Path,
    asset_state: str,
    asset_size: int,
) -> None:
    repository = tmp_path / "repo"
    repository.mkdir()
    payload = b"payload"
    digest = hashlib.sha256(payload).hexdigest()
    pointer = CheapLfsPointer(
        CHEAP_LFS_POINTER_VERSION,
        "assets",
        "payload.asset",
        len(payload),
        digest,
    )
    (repository / "payload.bin").write_text(
        serialize_cheap_lfs_pointer(pointer),
        encoding="utf-8",
    )
    provider = FakeReleaseProvider(
        CheapLfsRelease(
            "assets",
            CHEAP_LFS_RELEASE_BODY_SENTINEL,
            False,
            True,
            (
                CheapLfsReleaseAsset(
                    "payload.asset",
                    asset_size,
                    None,
                    asset_state,
                ),
            ),
        )
    )
    provider.bytes_by_name["payload.asset"] = b"x" * asset_size
    service = _service(repository, provider, tmp_path / "cache")

    with pytest.raises(CheapLfsError, match="metadata does not match"):
        service.verify("payload.bin", fetch_missing=True)

    assert provider.downloads == []


def test_deflate_expansion_is_chunk_bounded_and_rejects_trailing_bytes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = b"A" * (64 * 1024)
    compressor = zlib.compressobj(level=9, wbits=-zlib.MAX_WBITS)
    compressed_bytes = compressor.compress(payload) + compressor.flush()
    compressed = tmp_path / "payload.deflate"
    expanded = tmp_path / "payload.expanded"
    compressed.write_bytes(compressed_bytes)

    real_factory = zlib.decompressobj
    limits: list[int] = []

    class RecordingDecompressor:
        def __init__(self) -> None:
            self._inner = real_factory(wbits=-zlib.MAX_WBITS)

        @property
        def eof(self) -> bool:
            return self._inner.eof

        @property
        def unconsumed_tail(self) -> bytes:
            return self._inner.unconsumed_tail

        @property
        def unused_data(self) -> bytes:
            return self._inner.unused_data

        def decompress(self, data: bytes, max_length: int) -> bytes:
            limits.append(max_length)
            return self._inner.decompress(data, max_length)

    monkeypatch.setattr(cheap_lfs_application, "_BUFFER_SIZE", 64)
    monkeypatch.setattr(
        cheap_lfs_application.zlib,
        "decompressobj",
        lambda *, wbits: RecordingDecompressor(),
    )

    cheap_lfs_application._inflate_raw_bounded(
        compressed,
        expanded,
        len(payload),
    )

    assert expanded.read_bytes() == payload
    assert max(limits) <= 64

    compressed.write_bytes(compressed_bytes + b"trailing")
    with pytest.raises(CheapLfsError, match="trailing bytes"):
        cheap_lfs_application._inflate_raw_bounded(
            compressed,
            expanded,
            len(payload),
        )


def test_unowned_or_stable_release_fails_before_upload_or_pointer_write(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repo"
    repository.mkdir()
    tracked = repository / "payload.bin"
    tracked.write_bytes(b"payload")
    provider = FakeReleaseProvider(CheapLfsRelease("assets", "ordinary notes", False, False, ()))
    service = _service(repository, provider, tmp_path / "cache")
    plan = service.preview_track("payload.bin")

    with pytest.raises(CheapLfsError, match="unowned release"):
        service.track(plan, confirmed=True)

    assert tracked.read_bytes() == b"payload"
    assert provider.uploads == []


def test_tampered_track_plan_cannot_escape_cache_or_staging(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repo"
    repository.mkdir()
    tracked = repository / "payload.bin"
    tracked.write_bytes(b"payload")
    provider = FakeReleaseProvider()
    service = _service(repository, provider, tmp_path / "cache")
    plan = service.preview_track("payload.bin")
    malicious_part = replace(
        plan.parts[0],
        sha256="../outside-object",
        asset_name="../outside-upload.bin",
    )
    malicious_pointer = CheapLfsPointer(
        CHEAP_LFS_POINTER_VERSION,
        plan.release_tag,
        malicious_part.asset_name,
        plan.size_in_bytes,
        plan.sha256,
    )
    tampered = replace(
        plan,
        parts=(malicious_part,),
        pointer_text=serialize_cheap_lfs_pointer(malicious_pointer),
    )

    with pytest.raises(CheapLfsError, match="plan is invalid"):
        service.track(tampered, confirmed=True)
    with (
        pytest.raises(CheapLfsError, match="unsafe or non-leaf"),
        service._staged_asset(tracked, "../outside-upload.bin"),
    ):
        pass

    assert tracked.read_bytes() == b"payload"
    assert not (tmp_path / "outside-object").exists()
    assert not (tmp_path / "outside-upload.bin").exists()
    assert provider.uploads == []


def test_legacy_prerelease_with_exact_provenance_label_is_mutation_owned(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repo"
    repository.mkdir()
    tracked = repository / "payload.bin"
    tracked.write_bytes(b"payload")
    existing = CheapLfsReleaseAsset(
        "old.bin",
        1,
        None,
        "uploaded",
        f"cheap-lfs/v1 sha256={hashlib.sha256(b'x').hexdigest()} commit=- path=old.bin",
    )
    provider = FakeReleaseProvider(
        CheapLfsRelease("assets", "legacy notes", False, True, (existing,))
    )
    service = _service(repository, provider, tmp_path / "cache")

    service.track(service.preview_track("payload.bin"), confirmed=True)

    assert provider.uploads
    assert parse_cheap_lfs_pointer(tracked.read_text(encoding="utf-8")) is not None


def test_status_lists_pointer_and_strictly_over_100_mib_raw_candidate(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repo"
    repository.mkdir()
    raw = repository / "huge.bin"
    raw.touch()
    with raw.open("r+b") as handle:
        handle.truncate(CHEAP_LFS_AUTOMATIC_PIN_THRESHOLD_BYTES + 1)
    pointer_path = repository / "stored.bin"
    pointer_path.write_text(
        serialize_cheap_lfs_pointer(
            CheapLfsPointer(
                CHEAP_LFS_POINTER_VERSION,
                "assets",
                "stored.bin",
                0,
                hashlib.sha256(b"").hexdigest(),
            )
        ),
        encoding="utf-8",
    )
    service = _service(
        repository,
        FakeReleaseProvider(),
        tmp_path / "cache",
        paths=("huge.bin", "stored.bin"),
    )

    entries = service.status()

    assert [(entry.relative_path, entry.state) for entry in entries] == [
        ("huge.bin", "auto-pin-candidate"),
        ("stored.bin", "pointer"),
    ]


def test_late_open_handle_edit_is_retained_in_recovery(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repo"
    repository.mkdir()
    tracked = repository / "payload.bin"
    tracked.write_bytes(b"reviewed")
    observed_recovery: list[Path] = []

    def late_edit(_stage: str, _destination: Path, quarantine: Path, recovery: Path) -> None:
        observed_recovery.append(recovery)
        quarantine.write_bytes(b"late editor bytes")

    service = _service(
        repository,
        FakeReleaseProvider(),
        tmp_path / "cache",
        swap_hook=late_edit,
    )

    receipt = service.track(service.preview_track("payload.bin"), confirmed=True)

    assert parse_cheap_lfs_pointer(tracked.read_text(encoding="utf-8")) is not None
    assert observed_recovery == [receipt.recovery_path]
    assert receipt.recovery_path.read_bytes() == b"late editor bytes"


def test_new_target_created_during_swap_is_never_overwritten(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repo"
    repository.mkdir()
    tracked = repository / "payload.bin"
    tracked.write_bytes(b"reviewed")
    recovery_paths: list[Path] = []

    def racing_creator(
        _stage: str,
        destination: Path,
        _quarantine: Path,
        recovery: Path,
    ) -> None:
        recovery_paths.append(recovery)
        destination.write_bytes(b"new target")

    service = _service(
        repository,
        FakeReleaseProvider(),
        tmp_path / "cache",
        swap_hook=racing_creator,
    )

    with pytest.raises(CheapLfsError, match="not overwritten"):
        service.track(service.preview_track("payload.bin"), confirmed=True)

    assert tracked.read_bytes() == b"new target"
    assert recovery_paths[0].read_bytes() == b"reviewed"


def test_candidate_inventory_caps_pointer_paths_at_ten_thousand(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = tmp_path / "repo"
    repository.mkdir()
    runner = FakeGitRunner(
        repository,
        paths=tuple(f"pointers/payload-{index}.ptr" for index in range(10_005)),
    )
    service = CheapLfsService(
        repository,
        provider=FakeReleaseProvider(),
        cache_root=tmp_path / "cache",
        part_size=4,
        git_runner=runner,  # type: ignore[arg-type]
    )
    monkeypatch.setattr(service, "_normalize_path", lambda value: value)
    monkeypatch.setattr(
        Path,
        "lstat",
        lambda _path: SimpleNamespace(st_mode=stat.S_IFREG, st_size=1),
    )
    monkeypatch.setattr(Path, "is_symlink", lambda _path: False)
    monkeypatch.setattr(
        Path,
        "open",
        lambda _path, _mode: io.BytesIO(b"version "),
    )
    monkeypatch.setattr(
        cheap_lfs_application,
        "is_cheap_lfs_pointer_text",
        lambda _text: True,
    )

    candidates = service._candidate_paths()

    assert len(candidates) == 10_000
    assert candidates[-1] == "pointers/payload-9999.ptr"


def test_redirected_parent_is_rejected_for_track_status_and_restore(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repo"
    repository.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    outside_payload = outside / "payload.bin"
    outside_payload.write_bytes(b"outside")
    link = repository / "linked"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("This host does not permit a directory symlink.")
    provider = FakeReleaseProvider()
    service = _service(
        repository,
        provider,
        tmp_path / "cache",
        paths=("linked/payload.bin",),
    )

    with pytest.raises(CheapLfsError, match="redirected parent"):
        service.preview_track("linked/payload.bin")
    assert service.status() == ()

    pointer = CheapLfsPointer(
        CHEAP_LFS_POINTER_VERSION,
        "assets",
        "payload.bin",
        0,
        hashlib.sha256(b"").hexdigest(),
    )
    outside_payload.write_text(serialize_cheap_lfs_pointer(pointer), encoding="utf-8")
    with pytest.raises(CheapLfsError, match="redirected parent"):
        service.preview_restore("linked/payload.bin")
    assert outside_payload.read_text(encoding="utf-8").startswith("version ")


def test_parent_redirect_during_publication_never_rolls_back_outside_repository(
    tmp_path: Path,
) -> None:
    repository = tmp_path / "repo"
    source_parent = repository / "payloads"
    source_parent.mkdir(parents=True)
    payload = source_parent / "payload.bin"
    payload.write_bytes(b"reviewed payload")
    outside = tmp_path / "outside"
    outside.mkdir()
    probe = tmp_path / "symlink-probe"
    try:
        probe.symlink_to(outside, target_is_directory=True)
        probe.unlink()
    except OSError:
        pytest.skip("This host does not permit a directory symlink.")

    parked_parent = repository / "payloads-reviewed"
    recovery_paths: list[Path] = []

    def redirect_parent(
        _stage: str,
        _destination: Path,
        _quarantine: Path,
        recovery: Path,
    ) -> None:
        recovery_paths.append(recovery)
        source_parent.rename(parked_parent)
        source_parent.symlink_to(outside, target_is_directory=True)

    service = _service(
        repository,
        FakeReleaseProvider(),
        tmp_path / "cache",
        swap_hook=redirect_parent,
    )
    plan = service.preview_track("payloads/payload.bin")

    with pytest.raises(CheapLfsError, match="redirected parent"):
        service.track(plan, confirmed=True)

    assert not (outside / "payload.bin").exists()
    assert recovery_paths[0].read_bytes() == b"reviewed payload"


@pytest.mark.parametrize(
    "asset_name",
    [
        "../payload.bin",
        "folder/payload.bin",
        r"folder\payload.bin",
        "/absolute.bin",
        "C:alternate-stream.bin",
        "payload?.bin",
        "payload#fragment.bin",
        ".",
        "..",
        "x" * 256,
        "payload.bin\x00suffix",
    ],
)
def test_gh_provider_rejects_non_leaf_asset_before_invocation(
    tmp_path: Path,
    asset_name: str,
) -> None:
    class RecordingTransport:
        def __init__(self) -> None:
            self.calls: list[tuple[str, ...]] = []

        def run(
            self,
            argv: Sequence[str],
            *,
            timeout_seconds: float,
            stdin_text: str | None = None,
        ) -> GhProcessResult:
            del timeout_seconds, stdin_text
            self.calls.append(tuple(argv))
            return GhProcessResult(tuple(argv), 0, "", "")

    transport = RecordingTransport()
    provider = GhCheapLfsReleaseProvider(transport=transport)

    with pytest.raises(CheapLfsError, match="unsafe or non-leaf"):
        provider.download_asset(
            "acme/widgets",
            "assets",
            asset_name,
            tmp_path / "download",
        )

    assert transport.calls == []


@pytest.mark.parametrize(
    "metadata",
    [
        "[]",
        '{"tagName":"assets","assets":[42]}',
    ],
)
def test_gh_provider_rejects_non_object_release_metadata(metadata: str) -> None:
    class FixedTransport:
        def run(
            self,
            argv: Sequence[str],
            *,
            timeout_seconds: float,
            stdin_text: str | None = None,
        ) -> GhProcessResult:
            del timeout_seconds, stdin_text
            return GhProcessResult(tuple(argv), 0, metadata, "")

    provider = GhCheapLfsReleaseProvider(transport=FixedTransport())

    with pytest.raises(CheapLfsError, match="malformed Release metadata"):
        provider.get_release("acme/widgets", "assets")


def test_gh_provider_rejects_option_shaped_tag_before_invocation(
    tmp_path: Path,
) -> None:
    class RecordingTransport:
        def __init__(self) -> None:
            self.calls: list[tuple[str, ...]] = []

        def run(
            self,
            argv: Sequence[str],
            *,
            timeout_seconds: float,
            stdin_text: str | None = None,
        ) -> GhProcessResult:
            del timeout_seconds, stdin_text
            self.calls.append(tuple(argv))
            return GhProcessResult(tuple(argv), 0, "", "")

    transport = RecordingTransport()
    provider = GhCheapLfsReleaseProvider(transport=transport)

    with pytest.raises(CheapLfsError, match="option-safe"):
        provider.get_release("acme/widgets", "--help")
    with pytest.raises(CheapLfsError, match="option-safe"):
        provider.download_asset(
            "acme/widgets",
            "--help",
            "payload.bin",
            tmp_path / "payload.bin",
        )
    with pytest.raises(CheapLfsError, match="Repository must use"):
        provider.get_release("../widgets", "assets")

    assert transport.calls == []
