# Notifications Guide

Configure Slack, email, and webhook notifications for ADO events.

## Overview

ADO can send notifications for various events:

- Task started/completed/failed
- Rate limit warnings
- Cost threshold exceeded
- Provider failures
- Custom events

## Supported Channels

- **Slack** - Webhook-based notifications
- **Email** - SMTP-based email delivery
- **Webhook** - Custom HTTP webhooks (coming soon)

## Slack Notifications

### Setup

1. Create a Slack Incoming Webhook:
   - Go to https://api.slack.com/messaging/webhooks
   - Create a new webhook for your workspace
   - Copy the webhook URL

2. Configure ADO:

```yaml
hitl:
  notifications:
    slack:
      enabled: true
      webhookUrl: ${SLACK_WEBHOOK_URL}
      channel: "#dev-agents"
      username: "ADO Bot"
      iconEmoji: ":robot_face:"
```

3. Set environment variable:

```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

### Message Format

Slack messages include:

- **Title** - Event type (Task Started, Task Completed, etc.)
- **Message** - Detailed description
- **Color** - Info (blue), Success (green), Warning (amber), Error (red)
- **Fields** - Metadata (task ID, duration, cost, etc.)
- **Footer** - "ADO Orchestrator" with timestamp

Example notification:

```
🤖 Task Started
Task abc123 has started execution.

Prompt: Implement user authentication

Task ID: abc123
Provider: claude-code

ADO Orchestrator • 2:45 PM
```

### Test Slack Notification

```bash
# Using ADO CLI
ado notify test --channel slack --message "Test notification"
```

## Email Notifications

### Setup

Configure SMTP settings:

```yaml
hitl:
  notifications:
    email:
      enabled: true
      from: "ado@example.com"
      to: ["dev@example.com", "team@example.com"]
      smtp:
        host: "smtp.gmail.com"
        port: 587
        secure: false
        auth:
          user: ${SMTP_USER}
          pass: ${SMTP_PASS}
```

### Gmail Setup

If using Gmail:

1. Enable 2-factor authentication
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Use App Password as `SMTP_PASS`

```bash
export SMTP_USER="your-email@gmail.com"
export SMTP_PASS="your-app-password"
```

### Custom SMTP

For other providers:

```yaml
smtp:
  host: "smtp.sendgrid.net"      # SendGrid
  port: 587
  secure: false
  auth:
    user: "apikey"
    pass: ${SENDGRID_API_KEY}
```

### Email Format

Emails include:

- **Subject** - `[INFO] Task Started` with level prefix
- **HTML Body** - Formatted with colors and sections
- **Plain Text** - Fallback for text-only clients
- **Metadata** - Task details in expandable section

### Test Email Notification

```bash
ado notify test --channel email --to dev@example.com
```

## Notification Events

### Task Lifecycle

```yaml
# Automatic notifications for task events
notifications:
  events:
    taskStarted: true
    taskCompleted: true
    taskFailed: true
```

**Task Started:**
```
Title: Task Started
Message: Task abc123 has started execution.
Level: info
Metadata:
  - taskId: abc123
  - provider: claude-code
```

**Task Completed:**
```
Title: Task Completed
Message: Task abc123 completed successfully in 45s.
Level: success
Metadata:
  - taskId: abc123
  - duration: 45s
  - cost: $0.05
```

**Task Failed:**
```
Title: Task Failed
Message: Task abc123 failed with error: Rate limit exceeded
Level: error
Metadata:
  - taskId: abc123
  - error: Rate limit exceeded
```

### Rate Limit Warnings

```yaml
notifications:
  events:
    rateLimitWarning: true
```

**Notification:**
```
Title: Rate Limit Reached
Message: Provider "claude-code" has reached its rate limit.
         Resets at: 2025-11-27 00:00:00 UTC
Level: warning
Metadata:
  - provider: claude-code
  - resetsAt: 2025-11-27T00:00:00Z
```

### Cost Threshold Alerts

```yaml
hitl:
  escalateOnCost:
    threshold: 5.00
    channel: "slack"
```

**Notification:**
```
Title: Cost Threshold Exceeded
Message: Task abc123 has exceeded the cost threshold.
         Actual: $7.50
         Threshold: $5.00
Level: warning
Metadata:
  - taskId: abc123
  - cost: $7.50
  - threshold: $5.00
```

## Programmatic Usage

### Send Custom Notifications

```typescript
import { NotificationManager } from "@dxheroes/ado-core/notifications";

const notificationManager = new NotificationManager({
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL!,
  },
  email: {
    from: "ado@example.com",
    to: "dev@example.com",
  },
  enabledChannels: ["slack", "email"],
});

// Send notification
await notificationManager.send({
  title: "Deployment Complete",
  message: "Application deployed to production",
  level: "success",
  metadata: {
    environment: "production",
    version: "1.2.3",
  },
});
```

### Helper Functions

```typescript
import {
  createTaskStartedNotification,
  createTaskCompletedNotification,
  createTaskFailedNotification,
  createRateLimitNotification,
  createCostThresholdNotification,
} from "@dxheroes/ado-core/notifications";

// Task started
const payload = createTaskStartedNotification("task-123", "Implement auth");
await notificationManager.send(payload);

// Task completed
const payload = createTaskCompletedNotification("task-123", 45);
await notificationManager.send(payload);

// Rate limit warning
const payload = createRateLimitNotification(
  "claude-code",
  new Date("2025-11-27T00:00:00Z")
);
await notificationManager.send(payload);
```

## Filtering and Routing

### Send to Specific Channels

```typescript
// Send to Slack only
await notificationManager.sendToChannels(payload, ["slack"]);

// Send to all configured channels
await notificationManager.send(payload);
```

### Conditional Notifications

```yaml
# Only notify on errors
notifications:
  events:
    taskStarted: false
    taskCompleted: false
    taskFailed: true
```

### Multiple Recipients

```yaml
email:
  to: ["dev@example.com", "manager@example.com", "team@example.com"]
```

## Monitoring

### Notification Delivery Status

```bash
# View notification history
ado report --notifications

# Shows:
# - Timestamp
# - Channel (slack/email)
# - Status (success/failed)
# - Error (if failed)
```

### Failed Notifications

Failed notifications are logged but don't block task execution.

Check logs:
```bash
ado logs --filter notifications
```

## Testing

### Test All Channels

```bash
ado notify test --all
```

### Test Specific Channel

```bash
ado notify test --channel slack
ado notify test --channel email --to custom@example.com
```

## Troubleshooting

### Slack Webhook Not Working

1. Verify webhook URL is correct
2. Check channel permissions
3. Test with curl:

```bash
curl -X POST \
  -H 'Content-Type: application/json' \
  -d '{"text":"Test message"}' \
  https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### Email Not Sending

1. Verify SMTP credentials
2. Check firewall/port 587 access
3. Enable debug logging:

```yaml
observability:
  logging:
    level: "debug"
```

4. Check logs:

```bash
ado logs --filter email
```

### Gmail App Password Issues

- Ensure 2FA is enabled
- Generate new App Password
- Use full email as username
- Use App Password (not regular password)

## Best Practices

1. **Use Environment Variables** - Never commit secrets to config
2. **Test Before Deploying** - Use `ado notify test`
3. **Filter Noise** - Only enable important notifications
4. **Multiple Channels** - Use Slack for immediate, email for record
5. **Set Cost Thresholds** - Get alerted before overspending

## Next Steps

- [Telemetry & Monitoring](../packages/core/src/telemetry/README.md)
- [Configuration Reference](./configuration.md)
- [Deployment Guide](./deployment.md)
