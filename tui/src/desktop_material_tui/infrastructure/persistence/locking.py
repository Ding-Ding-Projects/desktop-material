"""Small cross-platform advisory file lock used for app-owned state."""

from __future__ import annotations

import importlib
import os
import threading
import time
from pathlib import Path
from types import TracebackType
from typing import Any, BinaryIO


class LockTimeoutError(TimeoutError):
    """Raised when an app-owned lock cannot be acquired in time."""


_registry_guard = threading.Lock()
_thread_locks: dict[str, threading.RLock] = {}


def _thread_lock_for(path: Path) -> threading.RLock:
    key = str(path.resolve())
    with _registry_guard:
        lock = _thread_locks.get(key)
        if lock is None:
            lock = threading.RLock()
            _thread_locks[key] = lock
        return lock


class FileLock:
    """Exclusive advisory lock with a bounded acquisition timeout.

    ``fcntl.flock`` is used on Linux. A small ``msvcrt`` fallback keeps the
    persistence tests and developer tooling usable on Windows.
    """

    def __init__(
        self,
        path: Path,
        *,
        timeout: float | None = 10.0,
        poll_interval: float = 0.05,
    ) -> None:
        self.path = path
        self.timeout = timeout
        self.poll_interval = poll_interval
        self._handle: BinaryIO | None = None
        self._thread_lock = _thread_lock_for(path)
        self._thread_lock_held = False

    def acquire(self) -> FileLock:
        started = time.monotonic()
        if self.timeout is None:
            self._thread_lock.acquire()
            self._thread_lock_held = True
        else:
            if not self._thread_lock.acquire(timeout=max(0.0, self.timeout)):
                raise LockTimeoutError(f"Timed out waiting for lock: {self.path}")
            self._thread_lock_held = True

        try:
            self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            self._handle = self.path.open("a+b")
            if self._handle.seek(0, os.SEEK_END) == 0:
                self._handle.write(b"\0")
                self._handle.flush()

            while True:
                try:
                    self._lock_handle()
                    return self
                except (BlockingIOError, OSError) as error:  # noqa: PERF203
                    if self.timeout is not None:
                        elapsed = time.monotonic() - started
                        if elapsed >= self.timeout:
                            raise LockTimeoutError(
                                f"Timed out waiting for lock: {self.path}"
                            ) from error
                    time.sleep(self.poll_interval)
        except BaseException:
            self._close_handle()
            self._release_thread_lock()
            raise

    def _lock_handle(self) -> None:
        assert self._handle is not None
        if os.name == "nt":
            import msvcrt

            self._handle.seek(0)
            msvcrt.locking(self._handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            fcntl: Any = importlib.import_module("fcntl")

            fcntl.flock(self._handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

    def release(self) -> None:
        if self._handle is not None:
            try:
                if os.name == "nt":
                    import msvcrt

                    self._handle.seek(0)
                    msvcrt.locking(self._handle.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl: Any = importlib.import_module("fcntl")

                    fcntl.flock(self._handle.fileno(), fcntl.LOCK_UN)
            finally:
                self._close_handle()
                self._release_thread_lock()

    def _close_handle(self) -> None:
        if self._handle is not None:
            self._handle.close()
            self._handle = None

    def _release_thread_lock(self) -> None:
        if self._thread_lock_held:
            self._thread_lock.release()
            self._thread_lock_held = False

    def __enter__(self) -> FileLock:
        return self.acquire()

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.release()
