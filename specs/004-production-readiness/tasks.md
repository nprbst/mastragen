# Tasks: Production Readiness (Phase 4)

**Feature Branch**: `004-production-readiness`
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Generated**: 2026-01-21

---

## Phase 1: Setup

**Goal**: Initialize database schema changes needed for all user stories

- [X] T001 Create migration 006_add_suspension_reason.ts in orchestrator/src/db/migrations/006_add_suspension_reason.ts
- [X] T002 Create migration 007_create_alert_tables.ts in orchestrator/src/db/migrations/007_create_alert_tables.ts
- [X] T003 Create migration 008_create_idle_config.ts in orchestrator/src/db/migrations/008_create_idle_config.ts
- [X] T004 Update schema.ts with new types for suspension_reason, alert_rules, alert_events, idle_config in orchestrator/src/db/types.ts
- [X] T005 Run migrations via `cd orchestrator && bun run db:migrate` and verify schema with `bun run db:status`

**Test Criteria**: Migrations run without errors; tables exist with correct columns and indexes.

---

## Phase 2: Foundational

**Goal**: Core services and schemas that multiple user stories depend on

- [X] T006 Create Valibot schemas for idle config validation in orchestrator/src/schemas/idle-config.ts
- [X] T007 Create Valibot schemas for alert rule/event validation in orchestrator/src/schemas/alerts.ts
- [X] T008 Create Valibot schemas for session activity validation in orchestrator/src/schemas/session-activity.ts
- [X] T009 Create IdleConfigService for global and project-level config management in orchestrator/src/services/idle-config-service.ts
- [X] T010 [P] Add seed data for global default idle config (30 min timeout, 5 min warning) in migration 008
- [X] T010a [P] Add seed data for default alert rules (pod_creation_failed, tailscale_timeout, database_failed, orphaned_pod) in migration 007

**Test Criteria**: Schemas validate correctly; IdleConfigService can read/write config; default idle config exists after migration; default alert rules exist after migration.

---

## Phase 3: Session Sharing (US1)

**Goal**: Complete the ~80% implemented session sharing feature with UI and edge case handling

**Independent Test**: Can share a session, verify teammate access, see shares in dashboard, revoke access.

### UI Components

- [ ] T011 [US1] Create SessionShareList component showing current shares with revoke buttons in web/src/components/SessionShareList.tsx
- [ ] T012 [US1] Create SharedWithMeSection component for dashboard "Shared with me" section in web/src/components/SharedWithMeSection.tsx
- [ ] T013 [US1] Integrate SessionShareList into session detail page in web/src/pages/sessions/[id].astro
- [ ] T014 [US1] Integrate SharedWithMeSection into dashboard session list in web/src/pages/dashboard.astro

### Edge Case Handling

- [ ] T015 [US1] Add warning notification when shared user is active during pending suspend in orchestrator/src/services/session-service.ts
- [ ] T016 [US1] Implement graceful disconnect handling on share revoke in orchestrator/src/services/session-share-service.ts

### Tests

- [ ] T017 [P] [US1] Create unit tests for SessionShareList component in web/tests/components/SessionShareList.test.tsx
- [ ] T018 [P] [US1] Create unit tests for SharedWithMeSection component in web/tests/components/SharedWithMeSection.test.tsx
- [ ] T019 [US1] Create integration test for share/unshare flow with active shared users in orchestrator/tests/integration/session-shares.test.ts

**Test Criteria**: Share list displays correctly; revoke works immediately; shared sessions appear in dashboard; active users warned before suspend.

---

## Phase 4: Idle Auto-Suspend (US2)

**Goal**: Automatically suspend sessions after configurable inactivity with warnings

**Independent Test**: Create session, wait for idle timeout, verify warning sent and session suspended with reason "auto".

### Core Service

- [X] T020 [US2] Create IdleSuspendJob class following SessionCleanupJob pattern in orchestrator/src/jobs/idle-suspend.ts
- [X] T021 [US2] Implement idle session detection query (state=active AND last_activity_at < threshold) in idle-suspend.ts
- [X] T022 [US2] Implement warning notification 5 minutes before suspension in idle-suspend.ts
- [X] T023 [US2] Implement auto-suspend with suspension_reason='auto' in idle-suspend.ts
- [X] T024 [US2] Register IdleSuspendJob in job scheduler startup in orchestrator/src/index.ts

### Activity Tracking API

- [X] T025 [US2] Enhance POST /api/sessions/:id/activity endpoint with activity types in orchestrator/src/routes/sessions.ts
- [X] T026 [US2] Create GET /api/sessions/:id/idle-status endpoint in orchestrator/src/routes/sessions.ts

### Idle Configuration API

- [X] T027 [US2] Create GET /api/config/idle endpoint for global config in orchestrator/src/routes/config.ts
- [X] T028 [US2] Create PATCH /api/config/idle endpoint for updating global config in orchestrator/src/routes/config.ts
- [X] T029 [US2] Create GET /api/projects/:projectId/idle-config endpoint in orchestrator/src/routes/projects.ts
- [X] T030 [US2] Create PUT /api/projects/:projectId/idle-config endpoint in orchestrator/src/routes/projects.ts
- [X] T031 [US2] Create DELETE /api/projects/:projectId/idle-config endpoint in orchestrator/src/routes/projects.ts

### UI Components

- [X] T032 [US2] Create IdleWarningBanner component for session UI in web/src/components/IdleWarningBanner.tsx
- [X] T033 [US2] Integrate IdleWarningBanner into SessionCard with 30-second polling of GET /api/sessions/:id/idle-status in web/src/components/SessionCard.tsx

### Tests

- [X] T034 [P] [US2] Create unit tests for IdleSuspendJob in orchestrator/tests/unit/jobs/idle-suspend.test.ts
- [X] T035 [P] [US2] Create unit tests for IdleConfigService in orchestrator/tests/unit/services/idle-config-service.test.ts
- [X] T036 [US2] Create integration test for idle detection and auto-suspend flow in orchestrator/tests/integration/idle-suspend.test.ts

**Test Criteria**: Idle sessions detected every 5 minutes; warning sent 5 min before timeout; session suspended with reason "auto"; per-project config overrides global.

---

## Phase 5: Platform Monitoring (US3)

**Goal**: Expose Prometheus-compatible metrics for operational visibility

**Independent Test**: Query /metrics endpoint, verify Prometheus format, see session counts and API latency.

### Metrics Service

- [X] T037 [US3] Create MetricsService with metric collectors in orchestrator/src/services/metrics-service.ts
- [X] T038 [US3] Implement session count metrics (by project, state) in metrics-service.ts
- [X] T039 [US3] Implement session creation/suspension counters in metrics-service.ts
- [X] T040 [US3] Implement alert fired counter in metrics-service.ts
- [X] T041 [US3] Implement build info metric in metrics-service.ts
- [ ] T041a [US3] Implement pod resource metrics collection (CPU, memory) via Kubernetes metrics API in orchestrator/src/services/metrics-service.ts
- [ ] T041b [US3] Add mastragen_pod_cpu_usage_ratio and mastragen_pod_memory_usage_bytes gauges in metrics-service.ts

### Metrics Middleware

- [X] T042 [US3] Create metrics middleware to track request count, duration, and error status in orchestrator/src/middleware/metrics-middleware.ts
- [X] T043 [US3] Implement histogram for API request duration with endpoint labels in metrics-middleware.ts
- [X] T044 [US3] Register metrics middleware in app startup in orchestrator/src/index.ts

### Metrics Endpoint

- [X] T045 [US3] Create GET /metrics endpoint with Prometheus text format in orchestrator/src/routes/metrics.ts
- [X] T046 [US3] Add rate limiting (10 req/min) to metrics endpoint in metrics.ts
- [X] T047 [US3] Exclude metrics endpoint from access logs in orchestrator/src/index.ts

### Tests

- [X] T048 [P] [US3] Create unit tests for MetricsService in orchestrator/tests/unit/services/metrics-service.test.ts
- [X] T049 [US3] Create integration test verifying Prometheus format and metrics values in orchestrator/tests/integration/metrics.test.ts

**Test Criteria**: /metrics returns valid Prometheus format; session gauges reflect actual state; request histograms track latency percentiles; response time <500ms.

---

## Phase 6: Alerting (US4)

**Goal**: Configure alert rules and deliver notifications for critical conditions

**Depends on**: Phase 5 (MetricsService for alert fired counter)

**Independent Test**: Create alert rule, trigger condition, verify alert event created and webhook delivered.

### Alert Service

- [ ] T050 [US4] Create AlertService with condition checking in orchestrator/src/services/alert-service.ts
- [ ] T051 [US4] Implement checkCondition for pod_creation_failed in alert-service.ts
- [ ] T052 [US4] Implement checkCondition for tailscale_timeout in alert-service.ts
- [ ] T053 [US4] Implement checkCondition for database_failed in alert-service.ts
- [ ] T054 [US4] Implement checkCondition for orphaned_pod in alert-service.ts
- [ ] T055 [US4] Implement fireAlert to create alert event in alert-service.ts
- [ ] T056 [US4] Implement deliverAlert with webhook delivery in alert-service.ts
- [ ] T057 [US4] Implement deliverAlert with email delivery in alert-service.ts
- [ ] T058 [US4] Implement retry logic with exponential backoff (3 attempts) in alert-service.ts

### Alert Checker Job

- [ ] T059 [US4] Create AlertCheckerJob to poll conditions every minute in orchestrator/src/jobs/alert-checker.ts
- [ ] T060 [US4] Register AlertCheckerJob in job scheduler startup in orchestrator/src/index.ts

### Alert API Routes

- [ ] T061 [US4] Create GET /api/alerts/rules endpoint in orchestrator/src/routes/alerts.ts
- [ ] T062 [US4] Create GET /api/alerts/rules/:id endpoint in alerts.ts
- [ ] T063 [US4] Create POST /api/alerts/rules endpoint in alerts.ts
- [ ] T064 [US4] Create PATCH /api/alerts/rules/:id endpoint in alerts.ts
- [ ] T065 [US4] Create DELETE /api/alerts/rules/:id endpoint in alerts.ts
- [ ] T066 [US4] Create GET /api/alerts/events endpoint with filtering in alerts.ts
- [ ] T067 [US4] Create GET /api/alerts/events/:id endpoint in alerts.ts
- [ ] T068 [US4] Create POST /api/alerts/events/:id/acknowledge endpoint in alerts.ts

### Admin UI

- [ ] T069 [US4] Create alerts admin page in web/src/pages/admin/alerts.astro
- [ ] T070 [US4] Create alert rules list component in web/src/components/admin/AlertRulesList.tsx
- [ ] T071 [US4] Create alert events list component in web/src/components/admin/AlertEventsList.tsx
- [ ] T072 [US4] Create alert rule form component in web/src/components/admin/AlertRuleForm.tsx

### Tests

- [ ] T073 [P] [US4] Create unit tests for AlertService in orchestrator/tests/unit/services/alert-service.test.ts
- [ ] T074 [P] [US4] Create unit tests for AlertCheckerJob in orchestrator/tests/unit/jobs/alert-checker.test.ts
- [ ] T075 [US4] Create integration test for alert creation and delivery in orchestrator/tests/integration/alerts.test.ts

**Test Criteria**: Alert rules CRUD works; conditions detected within 60s; webhooks delivered within 30s; failed deliveries retry with backoff.

---

## Phase 7: Kubernetes Deployment

**Goal**: Helm charts for production deployment with Tailscale integration

**Independent Test**: Install chart in minikube, verify orchestrator healthy, create session, verify Tailscale connectivity.

### Helm Chart Structure

- [ ] T076 Create Helm chart structure with Chart.yaml in helm/mastragen/Chart.yaml
- [ ] T077 Create default values.yaml with resource limits, replicas, and registry configuration (supports ghcr.io default and AWS ECR override) in helm/mastragen/values.yaml
- [ ] T078 Create orchestrator deployment template in helm/mastragen/templates/orchestrator/deployment.yaml
- [ ] T079 Create orchestrator service template in helm/mastragen/templates/orchestrator/service.yaml
- [ ] T080 Create orchestrator configmap template in helm/mastragen/templates/orchestrator/configmap.yaml
- [ ] T081 Create orchestrator serviceaccount template in helm/mastragen/templates/orchestrator/serviceaccount.yaml
- [ ] T082 Create sandbox PVC template in helm/mastragen/templates/sandbox/pvc.yaml
- [ ] T083 Create secrets reference template in helm/mastragen/templates/secrets.yaml
- [ ] T084 Create RBAC configuration template in helm/mastragen/templates/rbac.yaml

### Probes and Health

- [ ] T085 Add liveness probe to orchestrator deployment in deployment.yaml
- [ ] T086 Add readiness probe with Tailscale connectivity check to orchestrator deployment in deployment.yaml

### Environment Values

- [ ] T087 [P] Create development values override in helm/mastragen/values/development.yaml
- [ ] T088 [P] Create staging values override in helm/mastragen/values/staging.yaml
- [ ] T089 [P] Create production values override in helm/mastragen/values/production.yaml

### CI/CD

- [ ] T090 Create GitHub Actions workflow for Docker image builds in .github/workflows/docker-publish.yml
- [ ] T091 Configure workflow to push to ghcr.io on merge to main in docker-publish.yml
- [ ] T092 Configure workflow to push versioned tags on release in docker-publish.yml

### Tailscale Integration

- [ ] T093 Add Tailscale auth key secret reference to Helm values in values.yaml
- [ ] T094 Add Tailscale ACL configuration support via Helm values in values.yaml
- [ ] T095 Document token rotation procedure in operator docs

### Minikube Testing

- [ ] T096 Create minikube test script in scripts/minikube-test.sh
- [ ] T097 Create minikube integration test script that validates: (1) helm install succeeds, (2) orchestrator pod reaches Ready state within 120s, (3) POST /api/sessions creates session, (4) sandbox pod reaches Ready state with Tailscale connected in scripts/minikube-test.sh

**Test Criteria**: Helm chart installs without errors; probes pass; secrets referenced correctly; minikube test passes end-to-end.

---

## Phase 8: User Documentation (US5)

**Goal**: Comprehensive guides for new users to self-serve

**Independent Test**: New user can complete first session following docs in under 15 minutes.

- [ ] T098 [US5] Create getting started guide in docs/user/getting-started.md
- [ ] T099 [US5] Create project configuration reference in docs/user/project-configuration.md
- [ ] T100 [US5] Create Claude commands reference (/suspend, /pr, /share, /extract, /env) in docs/user/claude-commands.md
- [ ] T101 [US5] Create troubleshooting guide with common issues in docs/user/troubleshooting.md

**Test Criteria**: Docs cover all user-facing features; getting started guide completable in 15 minutes; troubleshooting covers common issues.

---

## Phase 9: Operator Documentation (US6)

**Goal**: Comprehensive guides for operators to deploy and maintain Mastragen

**Depends on**: Phase 7 (Helm charts must exist for deployment docs)

**Independent Test**: Operator can deploy new instance following docs in under 60 minutes.

- [ ] T102 [US6] Create Kubernetes deployment guide in docs/operator/deployment-kubernetes.md
- [ ] T103 [US6] Create Docker Compose deployment guide in docs/operator/deployment-docker-compose.md
- [ ] T104 [US6] Create GitHub App setup instructions in docs/operator/github-app-setup.md
- [ ] T105 [US6] Create Tailscale configuration guide including ACL setup in docs/operator/tailscale-configuration.md
- [ ] T106 [US6] Create database migration procedures with rollback in docs/operator/database-migration.md
- [ ] T107 [US6] Create API reference documentation in docs/api/reference.md

**Test Criteria**: Deployment guides are complete and accurate; GitHub App setup has all required steps; Tailscale guide covers ACL configuration.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Goal**: Integration tests, E2E tests, and final verification

- [ ] T108 Create E2E test for monitoring flow (metrics + alerts) in orchestrator/tests/e2e/monitoring.test.ts
- [ ] T109 Create E2E test for session lifecycle with idle suspend in orchestrator/tests/e2e/session-lifecycle.test.ts
- [ ] T110 Verify all success criteria from spec.md are met
- [ ] T111 Update routes.ts with any new route registrations in web/app/routes.ts
- [ ] T112 Run full test suite and fix any failures
- [ ] T113 Verify documentation coverage (100% of features documented)

**Test Criteria**: All E2E tests pass; success criteria verified; documentation complete.

---

## Dependencies

```
Phase 1 (Setup)
    │
    ├──► Phase 2 (Foundational)
    │         │
    │         ├──► Phase 3 (US1 - Session Sharing)
    │         │
    │         ├──► Phase 4 (US2 - Idle Auto-Suspend)
    │         │
    │         └──► Phase 5 (US3 - Platform Monitoring)
    │                   │
    │                   └──► Phase 6 (US4 - Alerting)
    │
    └──► Phase 7 (Kubernetes Deployment)
              │
              └──► Phase 9 (US6 - Operator Documentation)

Phase 8 (US5 - User Documentation) - Can run in parallel with Phases 3-7

Phase 10 (Polish) - Runs after all other phases
```

## Parallel Execution Opportunities

### Phase 1 (Setup)
Tasks T001-T003 can run in parallel (migrations are independent)

### Phase 2 (Foundational)
Tasks T006-T008 can run in parallel (schemas are independent)

### Phase 3 (US1 - Session Sharing)
- T011, T012 can run in parallel (components are independent)
- T017, T018 can run in parallel (test files are independent)

### Phase 4 (US2 - Idle Auto-Suspend)
- T034, T035 can run in parallel (unit test files are independent)

### Phase 5 (US3 - Platform Monitoring)
- T048 can run in parallel with T037-T044 (tests can be written alongside implementation)

### Phase 6 (US4 - Alerting)
- T051-T054 can run in parallel (condition checks are independent)
- T073, T074 can run in parallel (test files are independent)
- T069-T072 can run in parallel with backend work (UI and API are independent)

### Phase 7 (Kubernetes Deployment)
- T087-T089 can run in parallel (environment values are independent)

### Phase 8 & 9 (Documentation)
- All documentation tasks can run in parallel with each other
- Phase 8 can run in parallel with Phases 3-7

---

## Implementation Strategy

### MVP Scope (Recommended First Delivery)

1. **Phase 1**: Setup (migrations)
2. **Phase 2**: Foundational
3. **Phase 4**: US2 - Idle Auto-Suspend (critical for resource management)
4. **Phase 5**: US3 - Platform Monitoring (essential for production visibility)

This MVP delivers idle auto-suspend and monitoring - the most operationally critical features.

### Second Delivery

5. **Phase 3**: US1 - Session Sharing UI completion
6. **Phase 6**: US4 - Alerting

### Third Delivery

7. **Phase 7**: Kubernetes Deployment
8. **Phase 8**: User Documentation
9. **Phase 9**: Operator Documentation
10. **Phase 10**: Polish

---

## Summary

| Phase | User Story | Priority | Tasks | Parallelizable |
|-------|-----------|----------|-------|----------------|
| 1 | Setup | - | 5 | 3 |
| 2 | Foundational | - | 6 | 4 |
| 3 | US1 - Session Sharing | P1 | 9 | 4 |
| 4 | US2 - Idle Auto-Suspend | P1 | 17 | 2 |
| 5 | US3 - Platform Monitoring | P1 | 15 | 1 |
| 6 | US4 - Alerting | P2 | 26 | 7 |
| 7 | Kubernetes Deployment | P1 | 22 | 3 |
| 8 | US5 - User Documentation | P2 | 4 | 4 |
| 9 | US6 - Operator Documentation | P2 | 6 | 6 |
| 10 | Polish | - | 6 | 0 |
| **Total** | | | **116** | **35** |

---

*Tasks generated by /speck:tasks on 2026-01-21*
