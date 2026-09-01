"""ASSERT inference targets for the agentic SDLC squad forge.

The generated ``eval_config.yaml`` files under ``docs/sdlc/<spec>/evals/`` point
their ``pipeline.inference.target.callable`` at functions in this module:

* ``sdlc_assert_targets:squad_capability``  — for the squad-grounding eval.
* ``sdlc_assert_targets:feature_behavior``  — for the per-capability feature evals.

ASSERT (https://responsibleai.github.io/ASSERT/) calls these with a generated
test scenario and scores the returned text with the judge rubric in the config.
Run ASSERT from the repository root so this module is importable, e.g.::

    SDLC_SPEC_DIR=specs/001-model-cost-comparison assert-ai run \\
        --config docs/sdlc/001-model-cost-comparison/evals/squad-grounding-model-cost-comparison.eval.yaml

These targets shell out to the ``@tokenizer/sdlc`` toolkit (the same engine the
``sdlc`` Copilot agent uses) so the eval scores the *real* generated artifacts,
not a re-implementation. They are intentionally dependency-free (stdlib only).
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
SDLC_BIN = REPO_ROOT / "sdlc" / "bin" / "sdlc.mjs"


def _spec_dir() -> str:
    """The spec under test. Override per-run with the SDLC_SPEC_DIR env var."""
    return os.environ.get("SDLC_SPEC_DIR", "specs/001-model-cost-comparison")


def _run_sdlc(*args: str) -> str:
    """Invoke the sdlc CLI and return its stdout (best-effort, never raises)."""
    try:
        proc = subprocess.run(
            ["node", str(SDLC_BIN), *args],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        return proc.stdout.strip() or proc.stderr.strip()
    except Exception as exc:  # pragma: no cover - integration shim
        return f"ERROR invoking sdlc {' '.join(args)}: {exc}"


def squad_capability(scenario: str, **_: object) -> str:
    """Target for the squad-grounding eval.

    Forges the squad for the spec under test and returns its grounding proof so
    the judge can score whether every requirement is owned and every member is
    grounded. ``scenario`` is the ASSERT-generated probe describing a requirement
    or capability that the squad must cover.
    """
    proof = _run_sdlc("ground", _spec_dir())
    return json.dumps(
        {
            "scenario": scenario,
            "spec_dir": _spec_dir(),
            "grounding_proof": proof,
        },
        indent=2,
    )


def feature_behavior(scenario: str, **_: object) -> str:
    """Target for a per-capability feature eval.

    Returns the spec + interview context for the capability under test. Wire this
    to your application entrypoint (or a BDD step runner) to score real behavior
    against the generated Gherkin scenarios; by default it surfaces the spec's
    interview agenda so the judge can detect unresolved ambiguities.
    """
    agenda = _run_sdlc("interview", _spec_dir())
    return json.dumps(
        {
            "scenario": scenario,
            "spec_dir": _spec_dir(),
            "interview_agenda": agenda,
        },
        indent=2,
    )


if __name__ == "__main__":  # pragma: no cover - manual smoke test
    print(squad_capability("Every MUST requirement is owned by exactly one member."))
