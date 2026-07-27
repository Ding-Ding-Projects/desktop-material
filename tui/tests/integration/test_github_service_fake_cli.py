from __future__ import annotations

import sys

from desktop_material_tui.application.github_service import GitHubService
from desktop_material_tui.infrastructure.github import GhClient, SubprocessGhTransport


def test_service_uses_fake_gh_executable_without_shell_or_live_mutations(tmp_path) -> None:
    marker = tmp_path / "shell-marker-must-not-exist"
    script = tmp_path / "fake_gh.py"
    script.write_text(
        """
import json
import sys

args = sys.argv[1:]
if args[:2] == ["issue", "list"]:
    print(json.dumps([{
        "number": 1,
        "title": "Fake issue",
        "body": "No network",
        "state": "OPEN",
        "url": "https://example.test/issues/1",
        "author": {"login": "fixture"}
    }]))
elif args and args[0] == "api":
    payload = json.loads(sys.stdin.read() or "{}")
    print(json.dumps({
        "number": 2,
        "title": payload["title"],
        "body": payload.get("body", ""),
        "state": "open",
        "html_url": "https://example.test/issues/2",
        "user": {"login": "fixture"}
    }))
else:
    print(json.dumps({"unexpected": args}))
    raise SystemExit(3)
""".strip(),
        encoding="utf-8",
    )
    client = GhClient(
        transport=SubprocessGhTransport(),
        command_prefix=(sys.executable, str(script)),
    )
    service = GitHubService.from_slug("acme/widgets", client=client)
    suspicious = f"; echo owned > {marker}"

    assert service.list_issues()[0].title == "Fake issue"
    created = service.create_issue(
        title="Literal shell metacharacters",
        body=suspicious,
    )

    assert created.body == suspicious
    assert not marker.exists()
    assert service.repository.slug == "acme/widgets"
