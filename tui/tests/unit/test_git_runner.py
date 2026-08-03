import sys

import pytest

from desktop_material_tui.domain.errors import (
    GitCommandError,
    GitCommandTimeoutError,
    InvalidGitArgumentError,
)
from desktop_material_tui.infrastructure.git.runner import (
    SubprocessGitRunner,
    redact_git_argument,
)


def test_runner_passes_metacharacters_as_one_literal_argument(tmp_path) -> None:
    marker = tmp_path / "must-not-exist"
    suspicious = f"; touch {marker}"
    runner = SubprocessGitRunner(executable=sys.executable)

    result = runner.run(
        ["-c", "import sys; print(sys.argv[1])", suspicious],
        cwd=tmp_path,
    )

    assert result.stdout.strip() == suspicious
    assert not marker.exists()


def test_runner_raises_structured_error_for_nonzero_exit(tmp_path) -> None:
    runner = SubprocessGitRunner(executable=sys.executable)

    with pytest.raises(GitCommandError) as caught:
        runner.run(
            ["-c", "import sys; sys.stderr.write('failed safely'); sys.exit(7)"],
            cwd=tmp_path,
        )

    assert caught.value.exit_code == 7
    assert caught.value.result.stderr == "failed safely"
    assert caught.value.cwd == tmp_path.resolve()


def test_runner_times_out_and_terminates_process(tmp_path) -> None:
    runner = SubprocessGitRunner(executable=sys.executable)

    with pytest.raises(GitCommandTimeoutError) as caught:
        runner.run(
            ["-c", "import time; time.sleep(10)"],
            cwd=tmp_path,
            timeout=0.05,
        )

    assert caught.value.timeout_seconds == 0.05
    assert caught.value.duration_seconds < 5


def test_runner_rejects_nul_arguments(tmp_path) -> None:
    runner = SubprocessGitRunner(executable=sys.executable)

    with pytest.raises(InvalidGitArgumentError, match="NUL"):
        runner.run(["bad\x00argument"], cwd=tmp_path)


def test_runner_can_bind_an_isolated_gh_profile_without_a_credential(tmp_path) -> None:
    profile = tmp_path / "opaque-profile"
    profile.mkdir()
    runner = SubprocessGitRunner.for_github_profile(profile, executable=sys.executable)

    result = runner.run(
        ["-c", "import os; print(os.environ['GH_CONFIG_DIR'])"],
        cwd=tmp_path,
    )

    assert result.stdout.strip() == str(profile.resolve())
    assert runner.environment == {"GH_CONFIG_DIR": str(profile.resolve())}


@pytest.mark.parametrize(
    ("argument", "expected"),
    [
        (
            "https://user:secret@example.test/repo.git",
            "https://***@example.test/repo.git",
        ),
        (
            "http.extraHeader=Authorization: Bearer secret",
            "http.extraHeader=***",
        ),
        ("credential.token=secret", "credential.token=***"),
        ("git@example.test:owner/repo.git", "git@example.test:owner/repo.git"),
    ],
)
def test_redact_git_argument(argument: str, expected: str) -> None:
    assert redact_git_argument(argument) == expected
