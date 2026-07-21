# Quality and reliability

This category documents cross-cutting responsiveness, lifecycle, and recovery
contracts that span more than one user workflow.

## Features

- [Responsiveness and resource
  lifecycle](responsiveness-and-resource-lifecycle.md) — avoid redundant remote
  discovery, serialize credential prompts, coalesce high-frequency appearance
  writes, and release request and markdown-preview resources deterministically.

## API applicability

These contracts change local desktop scheduling and cleanup behavior. They add
no HTTP endpoint, so a Postman collection is not applicable.
