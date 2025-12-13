# Execution Modes Comparison

Visual comparison of Local, Remote, and Hybrid execution modes.

## Local Mode

Everything runs on your machine:

```
┌───────────────────────────────────────────────┐
│           Your Laptop                          │
│                                               │
│  ┌──────────┐                                 │
│  │   CLI    │                                 │
│  └─────┬────┘                                 │
│        │                                      │
│        ▼                                      │
│  ┌──────────────────────────────────────┐    │
│  │  Your Code (./my-project)             │    │
│  │                                       │    │
│  │  src/                                 │    │
│  │  ├── index.ts                         │    │
│  │  └── feature.ts                       │    │
│  │                                       │    │
│  │  ┌─────────────────┐                  │    │
│  │  │ Agent Process   │                  │    │
│  │  │ (claude-code)   │                  │    │
│  │  │                 │                  │    │
│  │  │ - Reads files   │                  │    │
│  │  │ - Makes changes │                  │    │
│  │  │ - Runs commands │                  │    │
│  │  └─────────────────┘                  │    │
│  └──────────────────────────────────────┘    │
│                                               │
└───────────────────────────────────────────────┘

Pros:
✓ No network required
✓ Fast (no upload/download)
✓ Complete control
✓ Free (uses local agent)

Cons:
✗ Limited by laptop CPU/RAM
✗ Only 1 task at a time
✗ Ties up your machine
✗ No collaboration
```

## Remote Mode

Code fetched from Git, execution on cloud:

```
┌───────────────────────────────────────────────┐
│           Your Laptop                          │
│                                               │
│  ┌──────────┐                                 │
│  │   CLI    │                                 │
│  └─────┬────┘                                 │
│        │                                      │
│        │ ado run "task" --remote              │
│        │ --git-url github.com/you/repo        │
│        │                                      │
└────────┼───────────────────────────────────────┘
         │
         │ HTTPS/WSS
         │
┌────────▼───────────────────────────────────────┐
│         Cloud (Coolify/K8s)                    │
│                                                │
│  ┌──────────────┐                             │
│  │ API Gateway  │                             │
│  └──────┬───────┘                             │
│         │                                     │
│         ▼                                     │
│  ┌─────────────────────────────────────────┐  │
│  │ Worker                                   │  │
│  │                                          │  │
│  │  1. git clone github.com/you/repo       │  │
│  │  2. git checkout main                   │  │
│  │                                          │  │
│  │  ┌──────────────────────┐               │  │
│  │  │ /workspace/repo       │               │  │
│  │  │   src/                │               │  │
│  │  │   ├── index.ts        │               │  │
│  │  │   └── feature.ts      │               │  │
│  │  │                       │               │  │
│  │  │  ┌──────────────┐    │               │  │
│  │  │  │ Agent        │    │               │  │
│  │  │  │ (claude-code)│    │               │  │
│  │  │  └──────────────┘    │               │  │
│  │  └──────────────────────┘               │  │
│  │                                          │  │
│  │  3. Make changes                         │  │
│  │  4. git commit                           │  │
│  │  5. git push origin ado/task-123         │  │
│  └─────────────────────────────────────────┘  │
│                                                │
└────────────────────────────────────────────────┘
         │
         │ Stream output back
         ▼
┌───────────────────────────────────────────────┐
│           Your Laptop                          │
│                                               │
│  ┌────────────────────────────────────┐      │
│  │ Terminal Output:                    │      │
│  │ ✓ Cloned repo                       │      │
│  │ ✓ Modified src/feature.ts           │      │
│  │ ✓ Pushed to ado/task-123           │      │
│  └────────────────────────────────────┘      │
│                                               │
│  $ git fetch                                  │
│  $ git checkout ado/task-123                 │
└───────────────────────────────────────────────┘

Pros:
✓ No local resources used
✓ Can run multiple tasks
✓ Powerful workers
✓ Good for CI/CD

Cons:
✗ Requires committed code
✗ Can't test local changes
✗ Slower (git clone)
✗ Network dependent
```

## Hybrid Mode ⭐ (Recommended)

Best of both worlds - local code, remote execution:

```
┌───────────────────────────────────────────────┐
│           Your Laptop                          │
│                                               │
│  ┌──────────────────────────────────────┐    │
│  │ Your Code (./my-project)              │    │
│  │                                       │    │
│  │  src/                                 │    │
│  │  ├── index.ts                         │    │
│  │  └── feature.ts (uncommitted changes) │    │
│  │                                       │    │
│  │  ado.config.yaml                      │    │
│  └──────────────────────────────────────┘    │
│                                               │
│  ┌──────────┐                                 │
│  │   CLI    │                                 │
│  └─────┬────┘                                 │
│        │                                      │
│        │ ado run "Add auth" --hybrid          │
│        │                                      │
└────────┼───────────────────────────────────────┘
         │
         │ Upload:
         │ - git branch/commit
         │ - uncommitted diff
         │ - config
         │
┌────────▼───────────────────────────────────────┐
│         Cloud (Coolify/K8s)                    │
│                                                │
│  ┌──────────────┐                             │
│  │ API Gateway  │                             │
│  └──────┬───────┘                             │
│         │                                     │
│         ▼                                     │
│  ┌─────────────────────────────────────────┐  │
│  │ Worker                                   │  │
│  │                                          │  │
│  │  1. git clone github.com/you/repo       │  │
│  │  2. git checkout main                   │  │
│  │  3. Apply uncommitted diff ⭐           │  │
│  │                                          │  │
│  │  ┌──────────────────────┐               │  │
│  │  │ /workspace/repo       │               │  │
│  │  │   src/                │               │  │
│  │  │   ├── index.ts        │               │  │
│  │  │   └── feature.ts      │ ← Your local  │  │
│  │  │                       │   changes!    │  │
│  │  │  ┌──────────────┐    │               │  │
│  │  │  │ Agent        │    │               │  │
│  │  │  │ (claude-code)│    │               │  │
│  │  │  └──────────────┘    │               │  │
│  │  └──────────────────────┘               │  │
│  │                                          │  │
│  │  4. Execute task                         │  │
│  │  5. git commit                           │  │
│  │  6. git push origin ado/task-123         │  │
│  └─────────────────────────────────────────┘  │
│                                                │
└────────────────────────────────────────────────┘
         │
         │ Real-time stream:
         │ - Progress
         │ - File changes
         │ - HITL prompts
         ▼
┌───────────────────────────────────────────────┐
│           Your Laptop                          │
│                                               │
│  ┌────────────────────────────────────┐      │
│  │ Terminal Output:                    │      │
│  │ ⠋ Syncing local changes...         │      │
│  │ ✓ Uploaded 3 files (2.4 MB)        │      │
│  │ ✓ Worker started                   │      │
│  │ ⠋ Executing task...                │      │
│  │ ✓ Modified src/auth.ts             │      │
│  │ ✓ Tests passed                     │      │
│  │ ✓ Pushed to ado/task-123           │      │
│  └────────────────────────────────────┘      │
│                                               │
│  $ git fetch                                  │
│  $ git checkout ado/task-123                 │
│  $ # Your changes + AI's work!               │
└───────────────────────────────────────────────┘

Pros:
✓ Test local changes remotely
✓ Powerful cloud workers
✓ Real-time feedback
✓ No git commit needed
✓ Can run multiple tasks
✓ Keep working locally

Cons:
✗ Requires network
✗ Upload time for large files
```

## Feature Comparison

| Feature | Local | Remote | Hybrid |
|---------|-------|--------|--------|
| **Code Location** | Local | Git | Local |
| **Execution** | Local | Cloud | Cloud |
| **Network Required** | ❌ | ✅ | ✅ |
| **Uncommitted Changes** | ✅ | ❌ | ✅ |
| **Parallel Tasks** | ❌ (1) | ✅ (many) | ✅ (many) |
| **Worker Power** | Laptop | Cloud | Cloud |
| **Real-time Stream** | ✅ | ✅ | ✅ |
| **Cost** | Free/API | API/Sub | API/Sub |
| **Team Collaboration** | ❌ | ✅ | ✅ |
| **Resource Usage** | High | None | Low |
| **Setup Complexity** | Low | Medium | Medium |
| **Best For** | Solo, small tasks | CI/CD, automation | **Team dev** ⭐ |

## When to Use Each

### Use Local When:

- ✅ Working on small, quick tasks
- ✅ Testing ADO for the first time
- ✅ No network connection
- ✅ Privacy-sensitive code
- ✅ Learning/experimenting

Example:
```bash
ado run "Fix typo in README"
```

### Use Remote When:

- ✅ Running in CI/CD pipeline
- ✅ Scheduled automation
- ✅ Code already committed
- ✅ Don't need local changes
- ✅ Want zero local resource usage

Example:
```bash
# In GitHub Actions
ado run "Generate changelog" --remote --git-ref main
```

### Use Hybrid When:

- ✅ Working on large features
- ✅ Testing local changes remotely
- ✅ Collaborating with team
- ✅ Need multiple parallel tasks
- ✅ Want powerful workers
- ✅ **This is the default for team development** ⭐

Example:
```bash
# Working on feature branch with uncommitted changes
ado run "Implement authentication with JWT" --hybrid
```

## Configuration Examples

### Local Mode (Default)

```yaml
# ado.config.yaml
remote:
  enabled: false  # or just don't set remote at all
```

```bash
ado run "task"  # Uses local mode
```

### Remote Mode

```yaml
# ado.config.yaml
remote:
  enabled: true
  apiUrl: https://ado.yourcompany.com
  defaultMode: remote

  git:
    defaultRef: main
```

```bash
ado run "task" --remote
# or if defaultMode=remote:
ado run "task"
```

### Hybrid Mode (Recommended)

```yaml
# ado.config.yaml
remote:
  enabled: true
  apiUrl: https://ado.yourcompany.com
  wsUrl: wss://ado.yourcompany.com
  defaultMode: hybrid

  auth:
    type: api_key
    keyEnvVar: ADO_API_KEY

  hybrid:
    git:
      uploadUncommitted: true
      autoPush: true
      branchPrefix: ado/

    sync:
      exclude:
        - node_modules/
        - dist/
        - .env*

    execution:
      worktreeIsolation: true
      autoCleanup: true
```

```bash
ado run "task" --hybrid
# or if defaultMode=hybrid:
ado run "task"
```

## Migration Path

### Start Local

```bash
# Day 1: Solo developer
ado run "Add feature"
```

### Move to Remote

```bash
# Day 30: Set up Coolify
# Deploy workers to cloud

# Configure local CLI
vim ~/.ado/config.yaml
# Add remote.apiUrl

# Start using hybrid
ado run "Add feature" --hybrid
```

### Scale to Team

```bash
# Month 2: Onboard team

# Everyone uses same config:
# ~/.ado/config.yaml
remote:
  enabled: true
  apiUrl: https://ado.yourcompany.com
  defaultMode: hybrid

# Team shares worker pool
# Cost tracking per user
# Centralized monitoring
```

### Enterprise

```bash
# Month 6: Large team, need K8s

# Migrate to Kubernetes
helm install ado ./deploy/helm/ado

# Update everyone's config:
remote:
  apiUrl: https://ado-prod.k8s.yourcompany.com

# Auto-scaling workers
# Multi-region deployment
# Advanced observability
```

## Summary

**TL;DR:**

- **Local**: Quick tasks, learning, no network ➜ `ado run "task"`
- **Remote**: CI/CD, committed code ➜ `ado run "task" --remote`
- **Hybrid**: Team development, best of both worlds ⭐ ➜ `ado run "task" --hybrid`

**For teams: Deploy on Coolify + use Hybrid mode = 🎯**

## Next Steps

- [Coolify Deployment Guide](../COOLIFY_DEPLOYMENT.md) - Set up remote workers
- [Remote Execution Guide](../REMOTE_EXECUTION.md) - Deep dive into modes
- [Configuration Reference](../configuration.md) - Complete config options
