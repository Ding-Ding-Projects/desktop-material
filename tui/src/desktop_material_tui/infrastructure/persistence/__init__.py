"""Durable, Linux-first infrastructure owned by the TUI."""

from .config import (
    AppConfig,
    AppearanceConfig,
    ConfigError,
    ConfigStore,
    InteractionConfig,
    LanguageConfig,
    SearchConfig,
    app_config_from_mapping,
    app_config_with_profile,
)
from .database import (
    CURRENT_SCHEMA_VERSION,
    PersistenceDatabase,
    PersistenceError,
    PersistentNotificationRecord,
    RepositoryRecord,
    SessionRecord,
    SQLiteStore,
)
from .locking import FileLock, LockTimeoutError
from .paths import APPLICATION_ID, AppPaths, XDGPaths
from .profile_history import (
    GitProfileHistory,
    ProfileHistoryError,
    ProfileRevision,
    ProfileSnapshot,
    SensitiveSettingError,
)

__all__ = [
    "APPLICATION_ID",
    "CURRENT_SCHEMA_VERSION",
    "AppConfig",
    "AppPaths",
    "AppearanceConfig",
    "ConfigError",
    "ConfigStore",
    "FileLock",
    "GitProfileHistory",
    "InteractionConfig",
    "LanguageConfig",
    "LockTimeoutError",
    "PersistenceDatabase",
    "PersistenceError",
    "PersistentNotificationRecord",
    "ProfileHistoryError",
    "ProfileRevision",
    "ProfileSnapshot",
    "RepositoryRecord",
    "SQLiteStore",
    "SearchConfig",
    "SensitiveSettingError",
    "SessionRecord",
    "XDGPaths",
    "app_config_from_mapping",
    "app_config_with_profile",
]
