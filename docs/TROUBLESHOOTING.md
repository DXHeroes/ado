# Troubleshooting Guide

Common problems and solutions for ADO.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Configuration Problems](#configuration-problems)
- [Provider Issues](#provider-issues)
- [Runtime Errors](#runtime-errors)
- [Performance Issues](#performance-issues)
- [Deployment Problems](#deployment-problems)
- [FAQ](#faq)

---

## Installation Issues

### `ado: command not found`

**Problem**: After installing ADO globally, the command is not found.

**Solution**:

```bash
# 1. Check npm global bin path
npm config get prefix

# 2. Add to PATH in ~/.bashrc or ~/.zshrc
export PATH="$PATH:$(npm config get prefix)/bin"

# 3. Reload shell
source ~/.bashrc  # or source ~/.zshrc

# 4. Verify
ado --version
```

**Alternative**: Use npx without installation:

```bash
npx @dxheroes/ado init
```

### `Permission denied` during installation

**Problem**: Permission errors when installing globally.

**Solution** (macOS/Linux):

```bash
# Fix npm permissions
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}

# Then retry installation
pnpm install -g @dxheroes/ado
```

**Alternative**: Use a node version manager (nvm, fnm) to avoid sudo.

### `EACCES: permission denied` on `.ado` directory

**Problem**: Cannot write to `.ado` state directory.

**Solution**:

```bash
# Check permissions
ls -la .ado

# Fix ownership
sudo chown -R $(whoami) .ado

# Fix permissions
chmod -R 755 .ado
```

---

## Configuration Problems

### `Invalid configuration file`

**Problem**: `ado.config.yaml` has syntax errors.

**Solution**:

```bash
# Validate YAML syntax
ado config validate

# Common issues:
# 1. Incorrect indentation (use spaces, not tabs)
# 2. Missing quotes around strings with special characters
# 3. Typos in field names
```

**Example**: Correct YAML indentation:

```yaml
# ❌ Wrong (tabs)
providers:
	claude-code:
		enabled: true

# ✅ Correct (2 spaces)
providers:
  claude-code:
    enabled: true
```

### `Provider not found in configuration`

**Problem**: Provider is referenced but not configured.

**Solution**:

```yaml
# Enable provider in ado.config.yaml
providers:
  claude-code:
    enabled: true
    accessModes:
      - mode: subscription
        priority: 1
        enabled: true
```

### `No providers enabled`

**Problem**: All providers are disabled or none are configured.

**Solution**:

```bash
# Check provider status
ado status

# Enable at least one provider in ado.config.yaml
providers:
  claude-code:
    enabled: true  # Set to true
```

---

## Provider Issues

### Claude Code: `Not authenticated`

**Problem**: Claude Code CLI is not authenticated.

**Solution**:

```bash
# Authenticate with Anthropic
claude login

# Verify authentication
claude whoami

# Test ADO
ado status
```

### Gemini CLI: `API key not configured`

**Problem**: Gemini CLI needs API key.

**Solution**:

```bash
# Set environment variable
export GOOGLE_API_KEY="your-api-key"

# Or authenticate interactively
gemini auth

# Verify
gemini config show
```

### Cursor: `Cursor not installed`

**Problem**: Cursor IDE is not installed or CLI is not in PATH.

**Solution**:

```bash
# 1. Install Cursor from https://cursor.sh

# 2. Verify CLI
cursor --version

# 3. If not found, add to PATH (macOS)
export PATH="$PATH:/Applications/Cursor.app/Contents/Resources/app/bin"

# 4. Restart terminal
```

### `Rate limit exceeded`

**Problem**: Provider hit rate limits.

**Solution**:

ADO automatically switches to the next provider. To prevent rate limits:

1. **Use subscription mode** (higher limits):

```yaml
providers:
  claude-code:
    accessModes:
      - mode: subscription  # Higher rate limits
        priority: 1
```

2. **Add multiple providers** for automatic failover:

```yaml
providers:
  claude-code:
    enabled: true
  gemini-cli:
    enabled: true  # Fallback
```

3. **Wait and retry**: Rate limits reset after a time period (usually 1 hour).

### Provider shows as `unavailable`

**Problem**: Provider is enabled but ADO can't use it.

**Diagnosis**:

```bash
# Check provider status
ado status

# Check CLI availability
claude --version
gemini --version
cursor --version

# Check authentication
claude whoami
```

**Common causes**:
1. CLI not installed
2. Not authenticated
3. Not in PATH
4. Incorrect permissions

---

## Runtime Errors

### `SQLITE_CANTOPEN: unable to open database file`

**Problem**: Cannot open `.ado/state.db`.

**Solution**:

```bash
# Ensure .ado directory exists
mkdir -p .ado

# Fix permissions
chmod 755 .ado

# If corrupted, reinitialize
rm .ado/state.db
ado init
```

### `Task execution failed`

**Problem**: Task failed during execution.

**Diagnosis**:

```bash
# Check task status
ado status

# View logs (if available)
tail -f .ado/logs/ado.log

# Check error details
ado report
```

**Common causes**:
1. Invalid prompt (too vague or ambiguous)
2. Provider error (rate limit, API error)
3. Resource constraints (out of memory)

**Solution**: Retry with more specific prompt or different provider.

### `WebSocket connection failed`

**Problem**: Dashboard or remote workers cannot connect.

**Solution**:

```bash
# Check API server is running
curl http://localhost:3001/health

# Check WebSocket endpoint
wscat -c ws://localhost:3001/trpc

# Verify firewall rules
# Ensure port 3001 is open
```

### `Checkpoint restore failed`

**Problem**: Cannot restore from checkpoint.

**Solution**:

```bash
# List checkpoints
ls -la .ado/checkpoints/

# Manually restore
ado checkpoint restore <checkpoint-id>

# If corrupted, start fresh
ado checkpoint clear
```

---

## Performance Issues

### Slow task execution

**Problem**: Tasks take too long to complete.

**Diagnosis**:

1. **Check provider performance**:

```bash
# Run benchmark
ado run "Echo hello world" --debug

# Compare providers
ado run "Echo hello" --provider claude-code
ado run "Echo hello" --provider gemini-cli
```

2. **Check resource usage**:

```bash
# Monitor CPU/memory
top -p $(pgrep ado)

# Check disk I/O
iostat -x 1
```

**Solutions**:

1. **Use faster providers** (Claude Code is typically fastest)
2. **Enable parallelization** (if supported):

```yaml
parallelization:
  enabled: true
  maxWorkers: 5
```

3. **Optimize prompts** (be specific, avoid ambiguity)

### High memory usage

**Problem**: ADO consumes excessive memory.

**Solution**:

1. **Limit parallel workers**:

```yaml
parallelization:
  maxWorkers: 3  # Reduce from default 5
```

2. **Clear old state**:

```bash
# Clean up old checkpoints
ado checkpoint prune --older-than 7d

# Vacuum database
sqlite3 .ado/state.db "VACUUM;"
```

3. **Increase system limits** (Linux):

```bash
# Check limits
ulimit -a

# Increase memory limit
ulimit -v 4194304  # 4GB
```

### Database locked

**Problem**: `SQLITE_BUSY: database is locked`

**Solution**:

```bash
# Check for zombie processes
ps aux | grep ado

# Kill hung processes
pkill -9 ado

# Reset database lock
rm .ado/state.db-wal .ado/state.db-shm

# Restart
ado status
```

---

## Deployment Problems

### Kubernetes: `CrashLoopBackOff`

**Problem**: ADO pod crashes repeatedly.

**Diagnosis**:

```bash
# Check pod status
kubectl get pods -l app=ado

# View logs
kubectl logs -l app=ado --tail=100

# Describe pod
kubectl describe pod <pod-name>
```

**Common causes**:
1. Missing environment variables (API keys, config)
2. Insufficient resources (CPU/memory)
3. Database connection failure

**Solution**:

```bash
# Check ConfigMap
kubectl get configmap ado-config -o yaml

# Check Secret
kubectl get secret ado-secrets -o yaml

# Increase resources in deployment.yaml
resources:
  limits:
    memory: "2Gi"
    cpu: "1000m"
  requests:
    memory: "1Gi"
    cpu: "500m"
```

### PostgreSQL connection failed

**Problem**: Cannot connect to PostgreSQL in Kubernetes.

**Solution**:

```bash
# Check PostgreSQL is running
kubectl get pods -l app=postgresql

# Test connection from pod
kubectl exec -it <ado-pod> -- psql -h postgresql -U ado -d ado

# Verify connection string in ConfigMap
kubectl get configmap ado-config -o yaml | grep DATABASE_URL

# Check service
kubectl get svc postgresql
```

### Docker: `Container exited with code 1`

**Problem**: Docker container crashes on startup.

**Solution**:

```bash
# View container logs
docker logs <container-id>

# Run interactively to debug
docker run -it @dxheroes/ado /bin/sh

# Check environment variables
docker inspect <container-id> | jq '.[0].Config.Env'

# Verify volume mounts
docker inspect <container-id> | jq '.[0].Mounts'
```

---

## FAQ

### Q: Can I use ADO without a subscription?

**A**: Yes! ADO works with API access modes:

```yaml
providers:
  claude-code:
    accessModes:
      - mode: api
        apiKey: "${ANTHROPIC_API_KEY}"
```

But subscription mode (Claude MAX, Cursor Pro) is recommended for higher rate limits.

### Q: How do I switch between providers manually?

**A**: Use the `--provider` flag:

```bash
ado run "Your task" --provider gemini-cli
```

Or disable unwanted providers in config:

```yaml
providers:
  claude-code:
    enabled: false  # Temporarily disable
  gemini-cli:
    enabled: true
```

### Q: Can I run multiple tasks in parallel?

**A**: Yes, if parallelization is enabled:

```yaml
parallelization:
  enabled: true
  maxWorkers: 5
```

Then use workflows:

```bash
ado workflow run parallel-tasks.yaml
```

### Q: Where are logs stored?

**A**:

- **Local**: `.ado/logs/ado.log`
- **Kubernetes**: `kubectl logs -l app=ado`
- **Docker**: `docker logs <container-id>`

### Q: How do I backup ADO state?

**A**:

```bash
# Backup SQLite database
cp .ado/state.db .ado/state.db.backup

# Backup checkpoints
tar -czf checkpoints-backup.tar.gz .ado/checkpoints/

# Restore
cp .ado/state.db.backup .ado/state.db
```

### Q: Can I use ADO in CI/CD?

**A**: Yes! Example GitHub Actions:

```yaml
- name: Install ADO
  run: npm install -g @dxheroes/ado

- name: Run ADO task
  run: ado run "Run tests and generate report"
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Q: How do I update ADO?

**A**:

```bash
# Global update
pnpm update -g @dxheroes/ado

# Verify version
ado --version

# Check changelog
cat $(npm root -g)/@dxheroes/ado/CHANGELOG.md
```

### Q: What's the difference between subscription and API mode?

**A**:

| Feature | Subscription Mode | API Mode |
|---------|-------------------|----------|
| **Cost** | Fixed monthly fee | Pay-per-token |
| **Rate Limits** | Higher (500+ req/day) | Lower (varies) |
| **Setup** | Authenticate once | API key required |
| **Priority** | Used first (priority 1) | Fallback (priority 10) |

### Q: Can I customize the CLI output?

**A**: Yes, use environment variables:

```bash
# Disable colors
export NO_COLOR=1

# JSON output
export ADO_OUTPUT_FORMAT=json

# Verbose logging
export DEBUG=ado:*
```

### Q: How do I report a bug?

**A**:

1. Check [existing issues](https://github.com/dxheroes/ado/issues)
2. Gather diagnostics:

```bash
ado status > diagnostics.txt
ado --version >> diagnostics.txt
cat ado.config.yaml >> diagnostics.txt
```

3. [Open a new issue](https://github.com/dxheroes/ado/issues/new) with diagnostics attached

---

## Still Stuck?

### Check Error Codes

See [Error Codes Reference](./ERROR-CODES.md) for detailed error explanations.

### Search Documentation

- [Installation Guide](./installation.md)
- [Configuration Reference](./configuration.md)
- [Provider Setup](./providers.md)
- [Deployment Guide](./deployment.md)

### Get Help

- [GitHub Discussions](https://github.com/dxheroes/ado/discussions)
- [Open an Issue](https://github.com/dxheroes/ado/issues/new)
- [Contributing Guide](../CONTRIBUTING.md)

---

**Last Updated**: 2025-01-13
