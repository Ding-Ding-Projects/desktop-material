"""Executable entry point for every Desktop Material terminal launcher."""

from .cli import main

__all__ = ["main"]


if __name__ == "__main__":
    raise SystemExit(main())
