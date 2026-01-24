# API Contract: Metrics

**Endpoint**: `GET /metrics`
**Authentication**: None (internal network only)
**Content-Type**: `text/plain; version=0.0.4` (Prometheus format)

## Description

Exposes platform metrics in Prometheus text exposition format for scraping by monitoring systems.

## Response

### Success (200 OK)

```prometheus
# HELP mastragen_sessions_total Current number of sessions by state
# TYPE mastragen_sessions_total gauge
mastragen_sessions_total{project="project-1",state="active"} 5
mastragen_sessions_total{project="project-1",state="suspended"} 12
mastragen_sessions_total{project="project-2",state="active"} 3

# HELP mastragen_session_creations_total Total sessions created
# TYPE mastragen_session_creations_total counter
mastragen_session_creations_total{project="project-1"} 127
mastragen_session_creations_total{project="project-2"} 45

# HELP mastragen_session_suspensions_total Total sessions suspended
# TYPE mastragen_session_suspensions_total counter
mastragen_session_suspensions_total{project="project-1",reason="manual"} 89
mastragen_session_suspensions_total{project="project-1",reason="auto"} 38
mastragen_session_suspensions_total{project="project-2",reason="manual"} 30

# HELP mastragen_api_requests_total Total API requests
# TYPE mastragen_api_requests_total counter
mastragen_api_requests_total{endpoint="/api/sessions",method="POST",status="201"} 127
mastragen_api_requests_total{endpoint="/api/sessions",method="GET",status="200"} 4521

# HELP mastragen_api_request_duration_seconds API request duration
# TYPE mastragen_api_request_duration_seconds histogram
mastragen_api_request_duration_seconds_bucket{endpoint="/api/sessions",method="POST",le="0.1"} 98
mastragen_api_request_duration_seconds_bucket{endpoint="/api/sessions",method="POST",le="0.5"} 120
mastragen_api_request_duration_seconds_bucket{endpoint="/api/sessions",method="POST",le="1.0"} 125
mastragen_api_request_duration_seconds_bucket{endpoint="/api/sessions",method="POST",le="+Inf"} 127
mastragen_api_request_duration_seconds_sum{endpoint="/api/sessions",method="POST"} 42.5
mastragen_api_request_duration_seconds_count{endpoint="/api/sessions",method="POST"} 127

# HELP mastragen_alerts_fired_total Total alerts fired
# TYPE mastragen_alerts_fired_total counter
mastragen_alerts_fired_total{type="pod_creation_failed"} 3
mastragen_alerts_fired_total{type="tailscale_timeout"} 7

# HELP mastragen_build_info Build information
# TYPE mastragen_build_info gauge
mastragen_build_info{version="1.0.0",commit="abc123"} 1

# HELP mastragen_pod_cpu_usage_ratio Pod CPU usage ratio (0-1)
# TYPE mastragen_pod_cpu_usage_ratio gauge
mastragen_pod_cpu_usage_ratio{session="session-abc",container="claude"} 0.45
mastragen_pod_cpu_usage_ratio{session="session-abc",container="mastra"} 0.12

# HELP mastragen_pod_memory_usage_bytes Pod memory usage in bytes
# TYPE mastragen_pod_memory_usage_bytes gauge
mastragen_pod_memory_usage_bytes{session="session-abc",container="claude"} 536870912
mastragen_pod_memory_usage_bytes{session="session-abc",container="mastra"} 268435456
```

### Error (503 Service Unavailable)

Returns when metrics collection fails (e.g., database unavailable).

```prometheus
# HELP mastragen_up Platform availability
# TYPE mastragen_up gauge
mastragen_up 0
```

## Notes

- Endpoint should be rate-limited to prevent abuse (10 req/min)
- Should be excluded from access logs to reduce noise
- Pod resource metrics (CPU, memory) collected via Kubernetes metrics API

## Error Rate Calculation

Error rates can be derived from `mastragen_api_requests_total` using status labels:
- 4xx client errors: `rate(mastragen_api_requests_total{status=~"4.."}[5m])`
- 5xx server errors: `rate(mastragen_api_requests_total{status=~"5.."}[5m])`
- Error ratio: `sum(rate(mastragen_api_requests_total{status=~"[45].."}[5m])) / sum(rate(mastragen_api_requests_total[5m]))`
