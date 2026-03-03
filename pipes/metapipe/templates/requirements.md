# requirements.md

## Problem Statement
{{taskPrompt}}

## In Scope
- Deliver a runnable OpenPipe workflow pack generated from the user task.
- Ensure `requirements.md` remains SSOT for downstream stages.
- Keep outputs machine-checkable and resumable.

## Out of Scope
- Direct deployment into production environments.
- Editing external systems without explicit follow-up tasks.

## Users / Stakeholders
- Requester: workflow owner who provides `task_prompt`.
- Platform maintainer: keeps runtime stable and reusable.
- Integrators: call workflow via CLI/REST/RPC/MCP.

## Success Criteria (Business)
- A generated workflow pack can be executed end-to-end.
- Validation gates pass without manual patching.
- Outputs are sufficiently structured for reuse and iteration.

## Non-Functional Constraints
- latency: stage execution should remain practical for CI use.
- cost: avoid unnecessary external model calls in dry-run.
- security/compliance: no secret exfiltration; explicit contracts for outputs.
- deployment environment: compatible with local runtime and standard Node.js setup.

## Assumptions
- Input task is provided and reasonably specific.
- Existing OpenPipe runtime conventions remain valid.
- Team accepts contract-driven, stage-gated iteration.

## Context Snapshot
- user_context: {{userContext}}
- runtime_constraints: {{runtimeConstraints}}

## Open Questions
- (none)
