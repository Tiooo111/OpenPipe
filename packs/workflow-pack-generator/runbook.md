# Runbook

## Invocation
- CLI: `wf run workflow-pack-generator --input task_prompt="..."`
- API: `POST /workflows/workflow-pack-generator/run`
- MCP: `run_workflow(name="workflow-pack-generator", params={...})`

## Stage Gates
1. Alignment gate must pass before Design.
2. Design gate must pass before Build.
3. Verification must produce deviation classification.
4. Orchestrator routes deviations by matrix and re-runs impacted stage.

## Failure Handling
- Retry policy: 2 retries per node.
- Persistent failure: emit `handoff.md` with unresolved blockers.
