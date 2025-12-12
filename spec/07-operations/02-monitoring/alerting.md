# Alerting

## Přehled

Konfigurace alertů pro ADO pomocí Prometheus Alertmanager a integrace s notifikačními kanály.

## Alert Categories

| Kategorie | Severity | Příklady |
|-----------|----------|----------|
| Critical | P1 | System down, data loss risk |
| High | P2 | High failure rate, provider unavailable |
| Medium | P3 | Performance degradation, rate limits |
| Low | P4 | Warnings, capacity approaching limits |

## Prometheus Alert Rules

### Task Alerts

```yaml
# prometheus/rules/tasks.yml
groups:
  - name: ado-tasks
    rules:
      # High task failure rate
      - alert: HighTaskFailureRate
        expr: |
          sum(rate(ado_tasks_total{status="failed"}[5m])) /
          sum(rate(ado_tasks_total[5m])) > 0.1
        for: 5m
        labels:
          severity: high
        annotations:
          summary: "High task failure rate"
          description: "Task failure rate is {{ $value | humanizePercentage }} (threshold: 10%)"

      # Task queue backed up
      - alert: TaskQueueBacklog
        expr: ado_task_queue_length > 100
        for: 10m
        labels:
          severity: medium
        annotations:
          summary: "Task queue backlog"
          description: "{{ $value }} tasks waiting in queue"

      # Long running tasks
      - alert: LongRunningTask
        expr: |
          (time() - ado_task_start_timestamp) > 3600
          and ado_tasks_active == 1
        labels:
          severity: medium
        annotations:
          summary: "Task running for over 1 hour"
          description: "Task {{ $labels.task_id }} has been running for {{ $value | humanizeDuration }}"

      # No tasks completing
      - alert: NoTasksCompleting
        expr: |
          sum(increase(ado_tasks_total{status="completed"}[30m])) == 0
          and sum(ado_tasks_active) > 0
        for: 30m
        labels:
          severity: high
        annotations:
          summary: "No tasks completing"
          description: "No tasks have completed in the last 30 minutes despite active tasks"
```

### Provider Alerts

```yaml
# prometheus/rules/providers.yml
groups:
  - name: ado-providers
    rules:
      # Provider unavailable
      - alert: ProviderUnavailable
        expr: ado_provider_health == 0
        for: 5m
        labels:
          severity: high
        annotations:
          summary: "Provider {{ $labels.provider }} unavailable"
          description: "Provider has been unavailable for 5 minutes"

      # Rate limit approaching
      - alert: ProviderRateLimitApproaching
        expr: |
          ado_provider_rate_limit_remaining /
          ado_provider_rate_limit_total < 0.2
        for: 1m
        labels:
          severity: medium
        annotations:
          summary: "Provider {{ $labels.provider }} approaching rate limit"
          description: "Only {{ $value | humanizePercentage }} of rate limit remaining"

      # Rate limited
      - alert: ProviderRateLimited
        expr: increase(ado_provider_rate_limits_total[5m]) > 0
        labels:
          severity: medium
        annotations:
          summary: "Provider {{ $labels.provider }} rate limited"
          description: "{{ $value }} rate limit events in last 5 minutes"

      # High provider latency
      - alert: HighProviderLatency
        expr: |
          histogram_quantile(0.95,
            sum(rate(ado_provider_latency_seconds_bucket[5m])) by (provider, le)
          ) > 30
        for: 5m
        labels:
          severity: medium
        annotations:
          summary: "High latency for provider {{ $labels.provider }}"
          description: "P95 latency is {{ $value }}s"

      # All providers down
      - alert: AllProvidersUnavailable
        expr: sum(ado_provider_health) == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "All AI providers unavailable"
          description: "No AI providers are available - system cannot process tasks"
```

### Worker Alerts

```yaml
# prometheus/rules/workers.yml
groups:
  - name: ado-workers
    rules:
      # No healthy workers
      - alert: NoHealthyWorkers
        expr: sum(ado_workers_total{status="idle"}) + sum(ado_workers_total{status="busy"}) == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "No healthy workers available"
          description: "All workers are offline or unhealthy"

      # Low worker availability
      - alert: LowWorkerAvailability
        expr: |
          sum(ado_workers_total{status="idle"}) /
          sum(ado_workers_total) < 0.1
        for: 10m
        labels:
          severity: medium
        annotations:
          summary: "Low worker availability"
          description: "Only {{ $value | humanizePercentage }} of workers are idle"

      # Worker crash loop
      - alert: WorkerCrashLoop
        expr: increase(ado_worker_restarts_total[15m]) > 3
        labels:
          severity: high
        annotations:
          summary: "Worker {{ $labels.worker_id }} crash looping"
          description: "{{ $value }} restarts in last 15 minutes"

      # High worker utilization
      - alert: HighWorkerUtilization
        expr: avg(ado_worker_utilization_percent) > 90
        for: 15m
        labels:
          severity: medium
        annotations:
          summary: "High worker utilization"
          description: "Average utilization is {{ $value }}%"
```

### Cost Alerts

```yaml
# prometheus/rules/costs.yml
groups:
  - name: ado-costs
    rules:
      # Daily cost threshold
      - alert: DailyCostThresholdExceeded
        expr: sum(increase(ado_cost_usd_total[24h])) > 100
        labels:
          severity: medium
        annotations:
          summary: "Daily cost threshold exceeded"
          description: "Daily cost is ${{ $value | printf \"%.2f\" }} (threshold: $100)"

      # Hourly cost spike
      - alert: HourlyCostSpike
        expr: |
          sum(increase(ado_cost_usd_total[1h])) >
          2 * avg_over_time(sum(increase(ado_cost_usd_total[1h]))[24h:1h])
        labels:
          severity: medium
        annotations:
          summary: "Hourly cost spike detected"
          description: "Current hourly cost is 2x the 24h average"

      # API fallback cost
      - alert: HighApiFallbackCost
        expr: |
          sum(increase(ado_cost_usd_total{access_mode="api"}[1h])) /
          sum(increase(ado_cost_usd_total[1h])) > 0.5
        for: 1h
        labels:
          severity: low
        annotations:
          summary: "High API fallback usage"
          description: "{{ $value | humanizePercentage }} of costs from API fallback"
```

### System Alerts

```yaml
# prometheus/rules/system.yml
groups:
  - name: ado-system
    rules:
      # API Gateway down
      - alert: ApiGatewayDown
        expr: up{job="ado-api-gateway"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "API Gateway is down"
          description: "API Gateway has been unreachable for 1 minute"

      # High API latency
      - alert: HighApiLatency
        expr: |
          histogram_quantile(0.95,
            sum(rate(ado_http_request_duration_seconds_bucket[5m])) by (le)
          ) > 1
        for: 5m
        labels:
          severity: medium
        annotations:
          summary: "High API latency"
          description: "P95 API latency is {{ $value }}s"

      # Database connection issues
      - alert: DatabaseConnectionIssues
        expr: ado_db_connections_total{state="active"} > 90
        for: 5m
        labels:
          severity: high
        annotations:
          summary: "Database connection pool exhausted"
          description: "{{ $value }} active database connections"

      # Redis connection issues
      - alert: RedisConnectionIssues
        expr: up{job="redis"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Redis is down"
          description: "Redis has been unreachable for 1 minute"

      # Disk space low
      - alert: DiskSpaceLow
        expr: |
          (node_filesystem_avail_bytes{mountpoint="/data"} /
           node_filesystem_size_bytes{mountpoint="/data"}) < 0.1
        for: 5m
        labels:
          severity: high
        annotations:
          summary: "Low disk space"
          description: "Only {{ $value | humanizePercentage }} disk space remaining"
```

## Alertmanager Configuration

### alertmanager.yml

```yaml
global:
  resolve_timeout: 5m
  smtp_smarthost: 'smtp.example.com:587'
  smtp_from: 'alertmanager@example.com'
  smtp_auth_username: 'alerts'
  smtp_auth_password: 'password'

  slack_api_url: 'https://hooks.slack.com/services/XXX/YYY/ZZZ'

route:
  receiver: 'default'
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

  routes:
    # Critical alerts - immediate notification
    - match:
        severity: critical
      receiver: 'critical'
      group_wait: 0s
      repeat_interval: 15m

    # High severity - page on-call
    - match:
        severity: high
      receiver: 'high'
      repeat_interval: 1h

    # Medium severity - Slack only
    - match:
        severity: medium
      receiver: 'medium'
      repeat_interval: 4h

    # Low severity - daily digest
    - match:
        severity: low
      receiver: 'low'
      group_interval: 1h
      repeat_interval: 24h

receivers:
  - name: 'default'
    slack_configs:
      - channel: '#ado-alerts'
        send_resolved: true

  - name: 'critical'
    slack_configs:
      - channel: '#ado-critical'
        send_resolved: true
    pagerduty_configs:
      - service_key: 'XXX'
    email_configs:
      - to: 'oncall@example.com'

  - name: 'high'
    slack_configs:
      - channel: '#ado-alerts'
        send_resolved: true
    pagerduty_configs:
      - service_key: 'XXX'

  - name: 'medium'
    slack_configs:
      - channel: '#ado-alerts'
        send_resolved: true

  - name: 'low'
    slack_configs:
      - channel: '#ado-alerts-low'
        send_resolved: true

inhibit_rules:
  # Don't alert on tasks if all providers are down
  - source_match:
      alertname: 'AllProvidersUnavailable'
    target_match:
      alertname: 'HighTaskFailureRate'
    equal: []

  # Don't alert on workers if API Gateway is down
  - source_match:
      alertname: 'ApiGatewayDown'
    target_match:
      alertname: 'NoHealthyWorkers'
    equal: []
```

## Slack Integration

### Slack Message Template

```yaml
# In alertmanager.yml
slack_configs:
  - channel: '#ado-alerts'
    send_resolved: true
    title: '{{ if eq .Status "firing" }}🚨{{ else }}✅{{ end }} {{ .CommonAnnotations.summary }}'
    text: |
      {{ range .Alerts }}
      *Alert:* {{ .Annotations.summary }}
      *Description:* {{ .Annotations.description }}
      *Severity:* {{ .Labels.severity }}
      *Started:* {{ .StartsAt.Format "2006-01-02 15:04:05" }}
      {{ if .Labels.task_id }}*Task:* {{ .Labels.task_id }}{{ end }}
      {{ if .Labels.provider }}*Provider:* {{ .Labels.provider }}{{ end }}
      {{ end }}
    actions:
      - type: button
        text: 'View in Grafana'
        url: 'http://grafana:3000/d/ado-overview'
      - type: button
        text: 'View Runbook'
        url: 'https://docs.example.com/runbooks/{{ .CommonLabels.alertname }}'
```

## PagerDuty Integration

```yaml
pagerduty_configs:
  - service_key: 'YOUR_SERVICE_KEY'
    severity: '{{ .CommonLabels.severity }}'
    description: '{{ .CommonAnnotations.summary }}'
    details:
      firing: '{{ .Alerts.Firing | len }}'
      resolved: '{{ .Alerts.Resolved | len }}'
      description: '{{ .CommonAnnotations.description }}'
```

## Email Templates

```yaml
# templates/email.tmpl
{{ define "email.default.subject" }}
[{{ .Status | toUpper }}{{ if eq .Status "firing" }}:{{ .Alerts.Firing | len }}{{ end }}] {{ .CommonAnnotations.summary }}
{{ end }}

{{ define "email.default.html" }}
<h2>{{ .CommonAnnotations.summary }}</h2>
<table>
  <tr><th>Status</th><td>{{ .Status }}</td></tr>
  <tr><th>Severity</th><td>{{ .CommonLabels.severity }}</td></tr>
</table>

<h3>Alerts</h3>
{{ range .Alerts }}
<div style="margin-bottom: 20px; padding: 10px; border-left: 4px solid {{ if eq .Status "firing" }}red{{ else }}green{{ end }};">
  <strong>{{ .Annotations.summary }}</strong>
  <p>{{ .Annotations.description }}</p>
</div>
{{ end }}
{{ end }}
```

## Runbook Links

Každý alert by měl mít link na runbook:

```yaml
annotations:
  summary: "High task failure rate"
  description: "..."
  runbook_url: "https://docs.example.com/runbooks/high-task-failure-rate"
```

---

## Souvislosti

- [Metrics](./metrics.md)
- [Capacity Planning](../03-scaling/capacity-planning.md)
- [Common Issues](../../06-user-guide/04-troubleshooting/common-issues.md)
