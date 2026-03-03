# acceptance_criteria.md

## Functional Criteria
- [ ] Criterion F1 (measurable): workflow defines explicit stages for align/design/build/verify.
- [ ] Criterion F2 (measurable): each stage emits declared outputs and passes contract checks.
- [ ] Criterion F3 (measurable): workflow can run via CLI and API with identical behavior.

## Non-Functional Criteria
- [ ] Latency threshold: dry-run completes within an acceptable CI window.
- [ ] Cost threshold: dry-run performs zero paid model calls by default.
- [ ] Reliability threshold: resume from checkpoint reproduces deterministic stage progression.

## Validation Method
- test case IDs: WF-ALIGN-001, WF-DESIGN-001, WF-RUN-CLI-001, WF-RUN-API-001
- pass/fail thresholds:
  - all required outputs are present
  - all contract rules pass
  - no unresolved deviation at finalize stage
