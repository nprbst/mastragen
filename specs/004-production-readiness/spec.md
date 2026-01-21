# Feature Specification: Production Readiness (Phase 4)

**Feature Branch**: `004-production-readiness`
**Created**: 2026-01-21
**Status**: Draft
**Input**: Phase 4 of Mastragen implementation - Ready for team use with monitoring and operational polish

## Overview

Phase 4 delivers production readiness for the Mastragen platform. After Phase 1 (Core Platform Foundation), Phase 2 (Git & Multi-Project Support), and Phase 3 (Claude Configuration & Web UI), Phase 4 provides:

1. Session sharing - Enable developers to share active sessions with teammates for pair debugging
2. Idle auto-suspend - Automatically suspend sessions after configurable inactivity to conserve resources
3. Monitoring and alerts - Operational visibility into platform health with metrics and alerting
4. Documentation - Comprehensive guides for both users and operators

This phase transforms Mastragen from a functional platform to a production-ready system that teams can use with confidence, operators can monitor and troubleshoot, and users can self-serve with documentation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Session Sharing (Priority: P1)

A developer wants to pair debug with a teammate by sharing their active session. They grant access to a colleague who can then connect to the same sandbox and see the same Claude conversation, filesystem, and git branch.

**Why this priority**: Session sharing is the primary collaboration feature. It enables pair programming and pair debugging, which are critical for team productivity and knowledge transfer.

**Independent Test**: Can be fully tested by sharing a session and verifying teammate access. Delivers immediate value by enabling collaborative debugging.

**Acceptance Scenarios**:

1. **Given** an active session, **When** the owner runs /share @teammate, **Then** the teammate gains Tailscale access to all sandbox services (Claude, Mastra, Astro, VS Code)
2. **Given** a shared session, **When** the shared user accesses it, **Then** they see the same Claude conversation, filesystem state, and can make changes
3. **Given** a session is shared, **When** the owner views the session details in the dashboard, **Then** they see a list of users the session is shared with
4. **Given** a shared session, **When** the owner revokes access via /unshare @teammate, **Then** the teammate's Tailscale access is immediately revoked
5. **Given** a user with sessions shared to them, **When** they view the dashboard, **Then** they see a "Shared with me" section listing those sessions with owner names

---

### User Story 2 - Idle Auto-Suspend (Priority: P1)

An operator wants to conserve cluster resources by automatically suspending sessions that have been idle for a configurable period. Users receive a warning before suspension and can prevent it by resuming activity.

**Why this priority**: Auto-suspend directly impacts infrastructure costs and resource efficiency. Without it, forgotten sessions consume resources indefinitely. It's essential for sustainable platform operation.

**Independent Test**: Can be fully tested by creating a session, waiting for idle timeout, and verifying suspension. Delivers value by preventing resource waste.

**Acceptance Scenarios**:

1. **Given** a session with no activity for the configured idle timeout (default: 30 minutes), **When** the system checks for idle sessions, **Then** the session is automatically suspended
2. **Given** a session approaching idle timeout (5 minutes before), **When** the system detects this, **Then** a warning notification is sent to the session owner
3. **Given** a session with a pending idle warning, **When** the user performs any activity (file change, Claude interaction, service access), **Then** the idle timer resets and suspension is prevented
4. **Given** a project with a custom idle timeout, **When** sessions are created for that project, **Then** the project-specific timeout applies instead of the global default
5. **Given** an auto-suspended session, **When** the user views it in the dashboard, **Then** the session shows as "Suspended (Auto)" with the timestamp of suspension

---

### User Story 3 - Platform Monitoring (Priority: P1)

An operator wants visibility into platform health to proactively identify issues and optimize resource allocation. They access a metrics dashboard showing active sessions, resource utilization, and performance indicators.

**Why this priority**: Monitoring is essential for production operations. Without visibility, operators cannot detect issues before users are impacted or plan capacity.

**Independent Test**: Can be fully tested by accessing the metrics endpoint and verifying data. Delivers value by enabling proactive operations.

**Acceptance Scenarios**:

1. **Given** the orchestrator is running, **When** an operator queries the metrics endpoint, **Then** they receive current metrics for active sessions, pod utilization, and API performance
2. **Given** active sessions exist, **When** operators view metrics, **Then** they see session counts grouped by project and by state (Active, Suspended, PR Open)
3. **Given** the API is processing requests, **When** operators view metrics, **Then** they see request rates, latency percentiles (p50, p95, p99), and error rates
4. **Given** pods are running, **When** operators view metrics, **Then** they see CPU and memory utilization across sandbox pods
5. **Given** metrics are exposed, **When** operators configure their monitoring system (Prometheus, Datadog, etc.), **Then** they can scrape and visualize Mastragen metrics

---

### User Story 4 - Alerting (Priority: P2)

An operator wants to be notified when platform issues occur so they can respond before users are significantly impacted. They configure alerts for critical conditions like pod failures, connection timeouts, and resource exhaustion.

**Why this priority**: Alerting builds on monitoring (P1) to enable proactive response. It's essential for production but requires monitoring infrastructure first.

**Independent Test**: Can be fully tested by triggering alert conditions and verifying notifications. Delivers value by enabling rapid incident response.

**Acceptance Scenarios**:

1. **Given** a pod creation fails, **When** the system detects this, **Then** an alert is generated with session ID, project, and error details
2. **Given** Tailscale registration times out (over 60 seconds), **When** the system detects this, **Then** an alert is generated with pod name and registration status
3. **Given** the database connection fails, **When** the system detects this, **Then** a critical alert is generated immediately
4. **Given** an orphaned pod exists (no matching session record for over 10 minutes), **When** the system detects this, **Then** an alert is generated with cleanup recommendation
5. **Given** alert rules are configured, **When** operators integrate with their notification system (PagerDuty, Slack, email), **Then** alerts are delivered via configured channels

---

### User Story 5 - User Documentation (Priority: P2)

A new user wants to learn how to use Mastragen effectively. They access comprehensive documentation including getting started guides, feature references, and troubleshooting help.

**Why this priority**: Documentation enables self-service and reduces support burden. It's important for adoption but users can learn through exploration in Phase 3.

**Independent Test**: Can be fully tested by following documentation and completing workflows. Delivers value by enabling self-service onboarding.

**Acceptance Scenarios**:

1. **Given** a new user, **When** they access the documentation, **Then** they find a getting started guide that walks through creating their first session
2. **Given** a user wants to configure a project, **When** they access the documentation, **Then** they find a complete reference for all project configuration options
3. **Given** a user wants to use Claude commands, **When** they access the documentation, **Then** they find a reference for all built-in commands (/suspend, /pr, /share, /extract, /env)
4. **Given** a user encounters an issue, **When** they access the documentation, **Then** they find a troubleshooting guide with common issues and solutions

---

### User Story 6 - Operator Documentation (Priority: P2)

A platform operator wants to deploy and maintain Mastragen for their team. They access comprehensive operational documentation including deployment guides, configuration references, and maintenance procedures.

**Why this priority**: Operator documentation is essential for platform adoption beyond the initial development team. It enables other teams to run Mastragen.

**Independent Test**: Can be fully tested by following documentation to deploy a new instance. Delivers value by enabling organizational adoption.

**Acceptance Scenarios**:

1. **Given** an operator wants to deploy Mastragen, **When** they access the documentation, **Then** they find deployment guides for both Kubernetes and Docker Compose environments
2. **Given** an operator needs to configure GitHub integration, **When** they access the documentation, **Then** they find step-by-step GitHub App setup instructions
3. **Given** an operator needs to configure networking, **When** they access the documentation, **Then** they find Tailscale configuration guide including ACL setup
4. **Given** an operator needs to upgrade the database, **When** they access the documentation, **Then** they find database migration procedures with rollback instructions

---

### Edge Cases

- What happens when a shared user is actively working and the session is auto-suspended?
  - All connected users receive a warning notification 5 minutes before suspension; if no activity from any user, session suspends
- What happens when /unshare is called while the shared user has open connections?
  - Tailscale access is revoked immediately; open connections gracefully disconnect with a notification
- What happens when the metrics endpoint is unavailable?
  - Monitoring systems receive connection errors; alerting via alternate channel (e.g., heartbeat check) notifies operators
- What happens when alert notification delivery fails?
  - Alerts are retried with exponential backoff; if delivery fails 3 times, logged as critical with escalation marker
- What happens when an orphaned pod's session record is recreated before cleanup?
  - Orphan detection uses a 10-minute grace period; if session is recreated, pod is adopted rather than cleaned up
- What happens when idle detection conflicts with a long-running Claude operation?
  - Claude API interactions reset the idle timer; multi-turn conversations keep the session active

## Requirements *(mandatory)*

### Functional Requirements

**Session Sharing**:

- **FR-001**: System MUST allow session owners to share access via /share @username command
- **FR-002**: System MUST grant shared users Tailscale access to all sandbox services
- **FR-003**: System MUST allow session owners to revoke access via /unshare @username command
- **FR-004**: System MUST immediately revoke Tailscale access when a share is removed
- **FR-005**: System MUST track shares in the session_shares table (session_id, user_id, granted_at, granted_by)
- **FR-006**: System MUST display shared sessions in the "Shared with me" dashboard section
- **FR-007**: System MUST display current shares when viewing session details

**Idle Auto-Suspend**:

- **FR-008**: System MUST track last_activity_at timestamp for each active session
- **FR-009**: System MUST update last_activity_at on file changes, Claude interactions, and service access
- **FR-010**: System MUST run a background job to check for idle sessions at regular intervals (every 5 minutes)
- **FR-011**: System MUST suspend sessions that exceed the idle timeout (default: 30 minutes)
- **FR-012**: System MUST support configurable idle timeout at both global and project levels
- **FR-013**: System MUST send a warning notification 5 minutes before auto-suspension
- **FR-014**: System MUST record suspension reason (auto vs manual) in session state

**Monitoring**:

- **FR-015**: System MUST expose a metrics endpoint in Prometheus-compatible format
- **FR-016**: System MUST track active session count by project and state
- **FR-017**: System MUST track session creation and termination rates
- **FR-018**: System MUST track pod resource utilization (CPU, memory)
- **FR-019**: System MUST track API latency percentiles (p50, p95, p99)
- **FR-020**: System MUST track API error rates by endpoint

**Alerting**:

- **FR-021**: System MUST generate alerts for pod creation failures
- **FR-022**: System MUST generate alerts for Tailscale registration timeouts (over 60 seconds)
- **FR-023**: System MUST generate alerts for database connection failures
- **FR-024**: System MUST generate alerts for orphaned pods (no session record for over 10 minutes)
- **FR-025**: System MUST support configurable alert destinations (webhook, email)
- **FR-026**: System MUST include relevant context in alerts (session ID, project, error details)

**User Documentation**:

- **FR-027**: System MUST provide a getting started guide for new users
- **FR-028**: System MUST provide a project configuration reference
- **FR-029**: System MUST provide a Claude commands reference
- **FR-030**: System MUST provide a troubleshooting guide

**Operator Documentation**:

- **FR-031**: System MUST provide deployment guides for Kubernetes and Docker Compose
- **FR-032**: System MUST provide GitHub App setup instructions
- **FR-033**: System MUST provide Tailscale configuration guide
- **FR-034**: System MUST provide database migration procedures

**Kubernetes Deployment**:

- **FR-035**: System MUST provide Helm charts for deploying orchestrator and sandbox components
- **FR-036**: Helm charts MUST support configurable values for resource limits, replicas, and environment-specific settings
- **FR-037**: System MUST include liveness and readiness probes for all deployed containers
- **FR-038**: System MUST define PersistentVolumeClaims for SQLite database storage
- **FR-039**: System MUST include ServiceAccount and RBAC configuration for pod management
- **FR-040**: Helm charts MUST be testable locally using minikube

**Tailscale Operational Readiness**:

- **FR-041**: System MUST verify Tailscale connectivity during pod startup (via readiness probe checking Tailscale socket)
- **FR-042**: System MUST expose Tailscale registration status in health checks
- **FR-043**: System MUST support Tailscale ACL configuration via Helm values
- **FR-044**: System MUST handle Tailscale authentication token rotation without downtime

**Container Image Management**:

- **FR-045**: Helm charts MUST support configurable container registry (default: ghcr.io)
- **FR-046**: System MUST provide CI workflow for building and pushing images to GitHub Container Registry
- **FR-047**: Helm charts MUST support AWS ECR as an alternative registry via values override
- **FR-048**: Minikube setup MUST use locally-built images (imagePullPolicy: Never or local registry)

**Secrets Management**:

- **FR-049**: Helm charts MUST reference secrets via Kubernetes Secret resources (not hardcoded values)
- **FR-050**: System MUST document required secrets (Tailscale auth key, GitHub App credentials, API keys)
- **FR-051**: Secrets configuration MUST be abstracted to support future External Secrets Operator integration

**HTTPS Termination**:

- **FR-052**: System MUST serve orchestrator API over HTTPS via Tailnet with valid TLS certificates
- **FR-053**: System MUST serve sandbox services (Mastra, Astro, VS Code) over HTTPS via Tailnet
- **FR-054**: Helm charts MUST include Caddy reverse proxy configuration for HTTPS termination
- **FR-055**: Caddy MUST obtain TLS certificates automatically from the local Tailscale daemon
- **FR-056**: Tailscale sidecar MUST be configured with TS_PERMIT_CERT_UID to allow Caddy cert access

### Key Entities

- **SessionShare**: Record of a session being shared with another user (session_id, user_id, granted_at, granted_by)
- **SessionActivity**: Activity tracking for idle detection (session_id, last_activity_at, activity_type)
- **AlertRule**: Configuration for an alert condition (condition_type, threshold, destinations)
- **AlertEvent**: Instance of a triggered alert (rule_id, triggered_at, context, status)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Session sharing completes (/share to access available) in under 10 seconds
- **SC-002**: Access revocation (/unshare to access blocked) completes in under 5 seconds
- **SC-003**: Idle auto-suspend activates within 2 minutes of timeout threshold being reached
- **SC-004**: Warning notifications are delivered at least 4 minutes before auto-suspension
- **SC-005**: Metrics endpoint responds in under 500 milliseconds
- **SC-006**: Alerts are generated within 60 seconds of condition occurrence
- **SC-007**: Alert notifications are delivered within 30 seconds of generation
- **SC-008**: New users can complete their first session following documentation in under 15 minutes
- **SC-009**: Operators can deploy Mastragen following documentation in under 60 minutes
- **SC-010**: Platform supports at least 100 concurrent active sessions with monitoring enabled
- **SC-011**: Idle detection accurately tracks activity with less than 1% false positives (premature suspension)
- **SC-012**: Documentation coverage includes 100% of user-facing features and operational procedures
- **SC-013**: Minikube integration test passes: Helm install, orchestrator healthy, sandbox pod created, Tailscale connected

## Assumptions

- Phase 1 (Core Platform Foundation), Phase 2 (Git & Multi-Project Support), and Phase 3 (Claude Configuration & Web UI) are complete and functional
- Tailscale API is available for programmatic ACL management
- The organization has a monitoring system (Prometheus, Datadog, etc.) ready to receive metrics
- The organization has a notification system (Slack, PagerDuty, email) ready to receive alerts
- Documentation will be hosted alongside the web UI or in the project repository

## Clarifications

### Session 2026-01-21

- Q: Should Kubernetes deployment configuration be added as a functional requirement? → A: Yes, use Helm charts for configurability; also ensure Tailscale is fully operational
- Q: What minikube testing scope is required? → A: Integration test (sandbox pods can be created and reach Tailscale)
- Q: Container registry strategy? → A: GitHub Container Registry (ghcr.io) default, pluggable for AWS ECR; minikube uses local images
- Q: Orchestrator scaling approach? → A: Static replicas (operator manually adjusts via Helm values)
- Q: Secrets management approach? → A: Kubernetes Secrets initially; architecture should support future AWS Secrets Manager integration

## Out of Scope

- Multi-region deployment and geo-distributed sessions
- Advanced analytics and reporting dashboards
- Usage-based billing integration
- Session recording and playback
- AI-powered issue detection and auto-remediation

## References

- [Implementation Plan](../../docs/implementation-plan.md) - Phase 4 details and deliverables
- [Architecture Specification v4](../../docs/mastragen-architecture-v4.md) - Technical design and component specifications
- [Constitution](../../.speck/memory/constitution.md) - Core principles and governance
