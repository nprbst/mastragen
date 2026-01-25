# Remediation Plan: Adopt `.mastragen/config.yaml` for Project Configuration

**Issue**: Constitution Principle IV mandates DB-only config, but config-as-code is more elegant for Phoenix settings.

**Decision**: Adopt config file approach per Nathan's preference.

---

## Required Changes

### 1. Constitution Amendment (.speck/memory/constitution.md)

**Section**: Principle IV - Project-First Configuration

**Current text** (lines 66-79):
> Configuration is stored in Mastragen's database, not in the project repository.

**Proposed revision**:
```markdown
### IV. Project-First Configuration

Each project defines its own configuration independent of other projects. Configuration uses a **hybrid approach**:

- **Static configuration** (what features are enabled, paths, retention policies) is stored in `.mastragen/config.yaml` in the project repository root
- **Dynamic configuration** (secrets, runtime overrides) remains in Mastragen's database
- **Fallback behavior**: If `.mastragen/config.yaml` is missing, orchestrator uses sensible defaults

This enables:
- Git-native configuration versioning alongside code
- Self-documenting project setup
- Runtime flexibility for secrets and environment-specific overrides
```

**Version bump**: 1.1.0 → 1.2.0 (MINOR - expanded guidance)

---

### 2. Spec Updates (specs/005-phoenix-observability/spec.md)

**Key Entities** (lines 154-158):
- Remove: "Project Environment: Extended with `phoenix_enabled` flag"
- Add: "Project Config File: `.mastragen/config.yaml` defining phoenix settings"

**Functional Requirements**:
- FR-001: Change from "when `phoenix_enabled` is true for a session's project environment" to "when `components.phoenix.enabled` is true in project's `.mastragen/config.yaml`"
- Add: FR-021: System MUST read `.mastragen/config.yaml` from workspace at session start

**Acceptance Scenarios** (US-2):
- Change: "Given a project environment with `phoenix_enabled: true`" → "Given a project with `.mastragen/config.yaml` containing `components.phoenix.enabled: true`"

---

### 3. Plan Updates (specs/005-phoenix-observability/plan.md)

**Phase 1: Infrastructure**:
- Remove: Database migration for `phoenix_enabled` column
- Add: Config file parser for `.mastragen/config.yaml`
- Add: Schema validation for config file (Valibot)

**Phase 2: Container Orchestration**:
- Change: SandboxService reads config from mounted workspace volume instead of DB query
- Change: K8sSandboxService reads config from workspace PVC

**Critical Files**:
- Remove: `orchestrator/src/db/migrations/010_add_phoenix_config.ts`
- Remove: `orchestrator/src/db/types.ts` (no schema change needed)
- Add: `orchestrator/src/lib/project-config.ts` (config file parser)
- Add: `orchestrator/src/lib/project-config.schema.ts` (Valibot schema)

---

### 4. Tasks Updates (specs/005-phoenix-observability/tasks.md)

**Remove tasks**:
- T005: Add phoenix_enabled column to ProjectEnvironmentsTable
- T006: Create database migration 010_add_phoenix_config.ts
- T009: Add findEnvironmentWithPhoenixStatus method
- T009a: Update PATCH endpoint for phoenix_enabled
- T010: Unit tests for migration
- T011: Unit tests for ProjectsRepository Phoenix method

**Add tasks**:
- T005-NEW: Create Valibot schema for `.mastragen/config.yaml` in `orchestrator/src/lib/project-config.schema.ts`
- T006-NEW: Implement config file parser in `orchestrator/src/lib/project-config.ts`
- T007-NEW: Write unit tests for config file parser
- T008-NEW: Create `.mastragen/config.yaml` template for new projects

**Modify tasks**:
- T021: SandboxService reads config from workspace file (not DB)
- T025: K8sSandboxService reads config from workspace file (not DB)

---

### 5. Config File Schema

```yaml
# .mastragen/config.yaml
version: "1"

components:
  phoenix:
    enabled: true
    retention:
      traces_days: 30
      experiments_days: 90

  astro:
    enabled: true
    path: "./ui"

paths:
  mastra: "./src/mastra"
  workspace: "."
```

---

## Implementation Order

1. **Constitution amendment** (manual, requires review)
2. **Config schema + parser** (new files, no breaking changes)
3. **SandboxService integration** (reads config from file)
4. **Remove DB migration tasks** (cleanup)
5. **Update spec/plan/tasks** (artifact consistency)

---

## Tasks Requiring Un-check After Remediation

If any of these tasks were already completed, they must be reset to `[ ]`:
- T005-T011 (all foundational DB tasks)
- T021-T029 (SandboxService tasks if they reference DB)

---

## Verification

1. Create project with `.mastragen/config.yaml` containing `components.phoenix.enabled: true`
2. Start session
3. Verify Phoenix container starts
4. Verify no DB column exists for `phoenix_enabled`
