# Feature Specification: Phoenix Observability for Mastragen

**Feature Branch**: `005-phoenix-observability`
**Created**: 2026-01-24
**Status**: Draft
**Input**: User description: "The addition of Arize Phoenix to the stack based on the Tech Spec at docs/phoenix-mastragen-spec.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Agent Traces in Phoenix UI (Priority: P1)

Product Design team members need visibility into what happens inside Mastra agents during experiments. When an agent produces unexpected output, they need to trace through the LLM calls, tool invocations, and decision points to understand why.

**Why this priority**: Without trace visibility, debugging AI experiments is guesswork. This is the foundation that enables all other Phoenix capabilities.

**Independent Test**: Can be fully tested by enabling Phoenix on a session, running a Mastra agent, and viewing the trace in Phoenix UI. Delivers immediate value for debugging.

**Acceptance Scenarios**:

1. **Given** a session with Phoenix enabled, **When** a Mastra agent handles a request, **Then** a trace appears in Phoenix UI within 30 seconds showing the full execution path
2. **Given** a trace in Phoenix, **When** viewing trace details, **Then** the user can see LLM prompts, responses, tool calls, and timing for each span
3. **Given** Phoenix is disabled for a session, **When** a Mastra agent runs, **Then** no traces are sent and performance is unaffected

---

### User Story 2 - Enable/Disable Phoenix Per Session (Priority: P1)

Platform administrators need to control Phoenix enablement at the session level. Not all experiments need observability, and enabling it adds resource overhead.

**Why this priority**: Without configuration control, Phoenix would either always run (wasteful) or never run (useless). This enables the "optional by default" principle.

**Independent Test**: Can be fully tested by creating two sessions - one with Phoenix enabled, one without - and verifying the correct behavior in each.

**Acceptance Scenarios**:

1. **Given** a project with `.mastragen/config.yaml` containing `components.phoenix.enabled: true`, **When** creating a session, **Then** the Phoenix container starts alongside other containers
2. **Given** a project without Phoenix enabled in config (or no config file), **When** checking running containers, **Then** no Phoenix container exists for that session
3. **Given** a running session with Phoenix, **When** accessing the Phoenix UI, **Then** the user can view traces for that session's project

---

### User Story 3 - Run Experiments Against Datasets (Priority: P2)

Product Design needs to systematically test Mastra agents against curated test cases. Instead of manual testing, they run automated experiments that execute the same inputs against an agent and record results.

**Why this priority**: Enables systematic A/B testing of prompt changes and agent configurations. Depends on P1 (traces) being in place.

**Independent Test**: Can be fully tested by creating a dataset in Phoenix, running an experiment via the CLI, and viewing results in Phoenix UI.

**Acceptance Scenarios**:

1. **Given** a dataset with test cases in Phoenix, **When** running an experiment via CLI, **Then** the system executes each test case against the specified Mastra agent
2. **Given** a completed experiment, **When** viewing in Phoenix UI, **Then** the user sees pass/fail status, evaluator scores, and links to traces for each run
3. **Given** an experiment with evaluators, **When** viewing results, **Then** scores are aggregated and displayed for comparison with other experiments

---

### User Story 4 - Manage Prompts with Version Control (Priority: P2)

Product Design iterates on agent prompts frequently. They need to version prompts, tag stable versions, and easily switch between prompt versions during experiments without code changes.

**Why this priority**: Prompt iteration is the primary lever for improving AI behavior. Version control prevents losing good prompts and enables rollback.

**Independent Test**: Can be fully tested by creating a prompt in Phoenix, tagging a version, and verifying an agent retrieves the tagged version.

**Acceptance Scenarios**:

1. **Given** a prompt stored in Phoenix, **When** updating the prompt content, **Then** a new version is created and the previous version remains accessible
2. **Given** multiple prompt versions, **When** tagging a version as "production", **Then** agents configured to use that tag retrieve the tagged version
3. **Given** an agent configured to fetch prompts from Phoenix, **When** Phoenix is unavailable, **Then** the agent falls back to a local prompt file

---

### User Story 5 - Generate Synthetic Test Data (Priority: P3)

Before production data exists, Product Design needs realistic test cases that cover edge cases and stress scenarios. They define user personas and generate diverse inputs based on those personas.

**Why this priority**: Enables testing before production data exists. Depends on P2 (experiments) to be useful.

**Independent Test**: Can be fully tested by authoring personas, running the generator, and verifying a dataset is created in Phoenix with diverse examples.

**Acceptance Scenarios**:

1. **Given** a set of authored personas, **When** running synthetic data generation, **Then** a Phoenix dataset is created with examples distributed across personas
2. **Given** generated examples, **When** reviewing metadata, **Then** each example includes the persona ID and rationale explaining what scenario it tests
3. **Given** a generation request with scenario focus, **When** reviewing examples, **Then** approximately 50% are normal cases, 30% edge cases, and 20% stress cases

---

### User Story 6 - Analyze Experiment Failures (Priority: P3)

After running experiments, Product Design needs to understand failure patterns systematically. They want failures categorized into themes with prioritized improvement suggestions.

**Why this priority**: Transforms raw failures into actionable insights. Depends on P3 (experiments with enough data) to be meaningful.

**Independent Test**: Can be fully tested by running error analysis on a completed experiment and verifying the taxonomy and improvement plan are generated.

**Acceptance Scenarios**:

1. **Given** an experiment with failures, **When** running error analysis, **Then** the system produces descriptive observations for each failure (open coding)
2. **Given** open-coded observations, **When** analysis completes, **Then** observations are grouped into 5-10 thematic categories (axial coding)
3. **Given** a failure taxonomy, **When** viewing the improvement plan, **Then** categories are ranked by impact score with suggested fixes and effort estimates

---

### User Story 7 - Export Handoff Artifacts (Priority: P3)

When experiments are ready for engineering handoff, Product Design needs to export a complete package including experiment results, datasets, prompts, and error analysis for engineering review.

**Why this priority**: Bridges the gap between experimentation and production. Depends on previous features producing artifacts to export.

**Independent Test**: Can be fully tested by running the export command and verifying all expected files are present with correct content.

**Acceptance Scenarios**:

1. **Given** a completed experiment, **When** exporting handoff artifacts, **Then** a directory is created with experiment metadata, run results, dataset, and prompts
2. **Given** synthetic data was used, **When** exporting, **Then** the handoff includes persona definitions and generation metadata
3. **Given** error analysis was performed, **When** exporting, **Then** the handoff includes the failure taxonomy and improvement plan

---

### Edge Cases

- What happens when Phoenix container fails to start? (Session should still work, just without tracing)
- How does the system handle Phoenix being unreachable mid-experiment? (Graceful degradation, continue with warning)
- What happens when SQLite database grows very large? (Retention policies auto-clean old data)
- How are traces handled for concurrent sessions using the same project? (Project-scoped, sessions isolated)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST start a Phoenix container when `components.phoenix.enabled` is true in the project's `.mastragen/config.yaml`
- **FR-002**: System MUST inject `PHOENIX_ENABLED` and `PHOENIX_ENDPOINT` environment variables into Mastra containers when Phoenix is active
- **FR-003**: Mastra telemetry MUST export traces to Phoenix when `PHOENIX_ENABLED=true`
- **FR-004**: Phoenix UI MUST be accessible at a predictable URL for each session (port 6006 or via Tailscale)
- **FR-005**: System MUST persist Phoenix data using SQLite to survive container restarts
- **FR-006**: Experiment runner MUST call Mastra via HTTP API (not direct import) to ensure traces are captured
- **FR-007**: System MUST support creating and managing datasets through the Phoenix API
- **FR-008**: System MUST support running experiments that execute tasks against datasets and record results; experiments run to completion (no pause/resume)
- **FR-009**: System MUST support code-based and LLM-as-judge evaluators for experiment runs
- **FR-010**: System MUST support storing and versioning prompts in Phoenix
- **FR-011**: Agents MUST be able to retrieve prompts by name and tag at runtime
- **FR-012**: System MUST fall back to local prompt files when Phoenix is unavailable
- **FR-013**: System MUST support generating synthetic datasets from user-defined personas
- **FR-014**: System MUST extract Mastra artifact metadata (agent instructions, tool definitions) to inform synthetic data generation
- **FR-015**: System MUST perform open coding on experiment failures, producing descriptive observations
- **FR-016**: System MUST perform axial coding to group observations into thematic categories
- **FR-017**: System MUST generate prioritized improvement plans based on failure taxonomy
- **FR-018**: System MUST export handoff artifacts including experiments, datasets, prompts, and error analysis; structured data in JSON format, summaries and reports in Markdown
- **FR-019**: Phoenix MUST NOT be required - sessions MUST function normally when Phoenix is disabled
- **FR-020**: System MUST support automatic data retention policies with 30-day default for traces (configurable); container volumes are cleaned up with session lifecycle
- **FR-021**: System MUST read `.mastragen/config.yaml` from workspace at session start to determine component enablement

### Key Entities

- **Session**: Extended with Phoenix container reference (when enabled)
- **Project Config File**: `.mastragen/config.yaml` defining component enablement and settings
- **Phoenix Container**: Arize Phoenix instance storing traces, prompts, datasets, and experiments
- **Trace**: OpenTelemetry trace capturing agent execution (spans, LLM calls, tool invocations)
- **Prompt**: Versioned prompt template stored in Phoenix with tag support
- **Dataset**: Collection of test examples for experiments
- **Experiment**: Named test run against a dataset with evaluator results
- **Persona**: User-authored description of user archetype for synthetic data generation
- **Open Code**: Descriptive observation about a single failure
- **Axial Code**: Thematic category grouping related open codes
- **Improvement Plan**: Prioritized list of failure categories with suggested fixes

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Product Design can view agent traces within 30 seconds of an agent completing a request
- **SC-002**: Users can enable/disable Phoenix per project environment without affecting session creation time by more than 5 seconds
- **SC-003**: Experiments with 100 test cases complete within 10 minutes for typical agent tasks
- **SC-004**: 95% of prompt retrieval requests succeed within 500ms when Phoenix is healthy
- **SC-005**: Synthetic data generation produces datasets matching the specified persona distribution (within 10% variance)
- **SC-006**: Error analysis categorizes 90%+ of failures into actionable themes (less than 10% uncategorized)
- **SC-007**: Handoff export completes in under 60 seconds for experiments with up to 1000 runs
- **SC-008**: Phoenix resource overhead is less than 512MB memory and 1 CPU core per session
- **SC-009**: Sessions without Phoenix enabled show no performance degradation compared to baseline
- **SC-010**: Data retention policies automatically clean traces older than the configured period

## Assumptions

- Phoenix SQLite backend is sufficient for single-session workloads; PostgreSQL migration is out of scope
- No artificial limit on concurrent Phoenix-enabled sessions; resource allocation is the operator's responsibility
- Tailscale is available for secure Phoenix UI access in Kubernetes environments
- Users have Anthropic API keys for synthetic data generation (uses Claude Opus)
- Mastra's `@mastra/arize` package provides the telemetry export capability
- Phoenix's HTTP API is stable and sufficient for all programmatic operations
- Human review of axial coding output is expected; full automation is not a goal
- Phoenix UI access is network-gated via Tailscale; no additional authentication layer required

## Clarifications

### Session 2026-01-23

- Q: Who can access the Phoenix UI - is it open to anyone who can reach the URL, or should it require authentication? → A: Network-gated only (Tailscale/VPN restricts access)
- Q: What format should the handoff export artifacts use for structured data? → A: Mixed - JSON for data, Markdown for summaries/reports
- Q: What should be the default retention period for traces before automatic cleanup? → A: 30 days default; container volumes cleaned up with session lifecycle
- Q: How many concurrent Phoenix-enabled sessions should the system support? → A: No limit; resource allocation is operator's responsibility
- Q: Can experiments be paused mid-run and resumed later? → A: No; experiments run to completion (restart on failure)
