import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


CLIENT_PATH = (
    Path(__file__).parents[1]
    / ".codex"
    / "skills"
    / "verify-desktop-material-headless"
    / "scripts"
    / "lowlevel_mcp_client.py"
)
SPEC = importlib.util.spec_from_file_location("lowlevel_mcp_client", CLIENT_PATH)
assert SPEC is not None and SPEC.loader is not None
CLIENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CLIENT)


class LowlevelMcpClientTests(unittest.TestCase):
    def test_transport_error_is_classified_for_fallback(self):
        self.assertTrue(CLIENT._endpoint_unavailable(RuntimeError("connection refused")))
        self.assertTrue(
            CLIENT._endpoint_unavailable(
                RuntimeError("unhandled errors in a TaskGroup (1 sub-exception)")
            )
        )
        self.assertFalse(CLIENT._endpoint_unavailable(RuntimeError("tool rejected input")))

    def test_cheap_cli_receives_one_structured_json_argument(self):
        result = {"ok": True, "count": 0}
        completed = CLIENT.subprocess.CompletedProcess(
            args=[], returncode=0, stdout=json.dumps(result), stderr=""
        )
        with patch.object(CLIENT.subprocess, "run", return_value=completed) as run:
            payload = CLIENT.call_cheap_tool(
                "get_screen_size",
                {"monitor": 1},
                30,
                str(CLIENT_PATH.parents[5] / "lowlevel-computer-use-mcp"),
                sys.executable,
            )

        self.assertEqual(payload["transport"], "cheap-cli")
        self.assertEqual(payload["count"], 0)
        command = run.call_args.args[0]
        self.assertEqual(command[-2], "--json")
        self.assertEqual(json.loads(command[-1]), {"monitor": 1})
        self.assertEqual(run.call_args.kwargs["timeout"], 30)

    def test_cheap_cli_non_json_is_a_failed_transport_result(self):
        completed = CLIENT.subprocess.CompletedProcess(
            args=[], returncode=1, stdout="not json", stderr="bad tool"
        )
        with patch.object(CLIENT.subprocess, "run", return_value=completed):
            payload = CLIENT.call_cheap_tool(
                "get_screen_size",
                {},
                30,
                str(CLIENT_PATH.parents[5] / "lowlevel-computer-use-mcp"),
                sys.executable,
            )

        self.assertFalse(payload["ok"])
        self.assertEqual(payload["returncode"], 1)
        self.assertEqual(payload["transport"], "cheap-cli")

    def test_cheap_cli_refuses_stateful_headless_lifecycle_tools(self):
        payload = CLIENT.call_cheap_tool(
            "create_headless_desktop",
            {"name": "isolated"},
            30,
            None,
            None,
        )

        self.assertFalse(payload["ok"])
        self.assertTrue(payload["persistent_required"])
        self.assertEqual(payload["transport"], "cheap-cli")


if __name__ == "__main__":
    unittest.main()
