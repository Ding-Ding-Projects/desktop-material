"""Bounded, repository-confined file browsing and text previews."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path, PurePath

MAX_BROWSER_ENTRIES = 20_000
MAX_PREVIEW_BYTES = 256 * 1024


class FileBrowserError(RuntimeError):
    """Base error for a repository file-browser operation."""


class FileBrowserPathError(FileBrowserError):
    """A requested browser path was invalid or escaped the repository."""


class FileBrowserLimitError(FileBrowserError):
    """The bounded browser inventory exceeded its safety limit."""


@dataclass(frozen=True)
class RepositoryFileEntry:
    """One safe, repository-relative file-browser entry."""

    relative_path: str
    name: str
    is_directory: bool
    is_symlink: bool
    size: int | None


@dataclass(frozen=True)
class RepositoryFilePreview:
    """A bounded file preview suitable for rendering in a terminal."""

    relative_path: str
    text: str
    size: int
    binary: bool
    truncated: bool


class RepositoryFileBrowser:
    """Inventory and preview files without allowing repository escape."""

    def __init__(
        self,
        repository: str | Path,
        *,
        maximum_entries: int = MAX_BROWSER_ENTRIES,
        maximum_preview_bytes: int = MAX_PREVIEW_BYTES,
    ) -> None:
        requested_root = Path(repository).expanduser()
        try:
            root = requested_root.resolve(strict=True)
        except OSError as error:
            raise FileBrowserPathError(
                f"Repository root does not exist: {requested_root}"
            ) from error
        if not root.is_dir():
            raise FileBrowserPathError(f"Repository root is not a directory: {root}")
        if maximum_entries < 1:
            raise ValueError("maximum_entries must be positive")
        if maximum_preview_bytes < 1:
            raise ValueError("maximum_preview_bytes must be positive")
        self.root = root
        self.maximum_entries = maximum_entries
        self.maximum_preview_bytes = maximum_preview_bytes

    def list_entries(self, *, include_hidden: bool = False) -> tuple[RepositoryFileEntry, ...]:
        """Return a deterministic bounded inventory, never descending through links."""

        entries: list[RepositoryFileEntry] = []
        pending: list[os.DirEntry[str]] = []

        def read_children(directory: Path) -> list[os.DirEntry[str]]:
            try:
                children = list(os.scandir(directory))
            except OSError as error:
                raise FileBrowserError(f"Could not read {directory}: {error}") from error
            return sorted(
                children,
                key=lambda item: (
                    not item.is_dir(follow_symlinks=False),
                    item.name.casefold(),
                ),
            )

        pending.extend(reversed(read_children(self.root)))
        while pending:
            child = pending.pop()
            if child.name == ".git" or (
                not include_hidden and child.name.startswith(".")
            ):
                continue
            child_path = Path(child.path)
            relative = child_path.relative_to(self.root).as_posix()
            is_symlink = child.is_symlink()
            is_directory = child.is_dir(follow_symlinks=False)
            size: int | None = None
            if not is_directory:
                try:
                    size = child.stat(follow_symlinks=False).st_size
                except OSError:
                    size = None
            entries.append(
                RepositoryFileEntry(
                    relative_path=relative,
                    name=child.name,
                    is_directory=is_directory,
                    is_symlink=is_symlink,
                    size=size,
                )
            )
            if len(entries) > self.maximum_entries:
                raise FileBrowserLimitError(
                    "Repository file inventory exceeds "
                    f"{self.maximum_entries:,} entries; narrow the repository or limit."
                )
            if is_directory and not is_symlink:
                pending.extend(reversed(read_children(child_path)))
        return tuple(entries)

    def resolve_file(self, relative_path: str | PurePath) -> Path:
        """Resolve a regular file and prove its final target remains under the root."""

        requested = Path(relative_path)
        if requested.is_absolute() or not requested.parts or ".." in requested.parts:
            raise FileBrowserPathError("Choose a repository-relative file path.")
        candidate = self.root.joinpath(requested)
        try:
            resolved = candidate.resolve(strict=True)
            resolved.relative_to(self.root)
        except (OSError, ValueError) as error:
            raise FileBrowserPathError(
                f"File is missing or outside the repository: {requested.as_posix()}"
            ) from error
        if not resolved.is_file():
            raise FileBrowserPathError(
                f"File browser selection is not a regular file: {requested.as_posix()}"
            )
        return resolved

    def preview(self, relative_path: str | PurePath) -> RepositoryFilePreview:
        """Read a bounded preview, identifying binary content without printing it."""

        path = self.resolve_file(relative_path)
        size = path.stat().st_size
        with path.open("rb") as stream:
            payload = stream.read(self.maximum_preview_bytes + 1)
        truncated = len(payload) > self.maximum_preview_bytes
        payload = payload[: self.maximum_preview_bytes]
        relative = path.relative_to(self.root).as_posix()

        if b"\0" in payload:
            return RepositoryFilePreview(
                relative_path=relative,
                text=(
                    f"Binary file · {size:,} bytes\n"
                    "Preview is disabled so terminal control bytes are never rendered."
                ),
                size=size,
                binary=True,
                truncated=truncated,
            )
        try:
            text = payload.decode("utf-8-sig")
        except UnicodeDecodeError:
            return RepositoryFilePreview(
                relative_path=relative,
                text=(
                    f"Binary or non-UTF-8 file · {size:,} bytes\n"
                    "Open it in the configured editor to inspect its native encoding."
                ),
                size=size,
                binary=True,
                truncated=truncated,
            )
        if truncated:
            text += (
                "\n\n"
                f"— Preview stopped after {self.maximum_preview_bytes:,} of {size:,} bytes —"
            )
        return RepositoryFilePreview(
            relative_path=relative,
            text=text,
            size=size,
            binary=False,
            truncated=truncated,
        )
