# constraints.md

## Runtime Constraints
{{runtimeConstraints}}

## Tooling Constraints
- Prefer built-in OpenPipe engine surfaces (CLI/REST/RPC/MCP).
- Keep executor behavior side-effect-safe during `--dry-run`.

## Model Constraints
- LLM execution is optional and must be explicit via executor config.
- Default path should remain deterministic without external model dependency.

## Security Constraints
- No hardcoded secrets in generated artifacts.
- Inputs and outputs must remain within run directory boundaries.

## Data Constraints
- Input payload should be JSON-serializable.
- Generated artifacts should be UTF-8 text unless explicitly declared otherwise.
