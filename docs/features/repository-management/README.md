# Repository management features

This category documents workflows that change which Git worktree Desktop
Material is displaying or how a repository is represented in the application.

## Features

- [Temporary submodule repository
  navigation](submodule-repository-navigation.md) — open an initialized
  submodule in the current workspace without importing it, then return to the
  persisted root repository.

## API applicability

These features use the renderer, dispatcher, repository store, and bounded Git
helpers. They add no HTTP endpoint, so a Postman collection is not applicable.
