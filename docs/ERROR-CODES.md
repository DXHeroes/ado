# ADO Error Codes Reference

This document provides a comprehensive list of all error codes used in the Agentic Development Orchestrator (ADO), along with descriptions and remediation steps.

## Error Code Format

All ADO errors follow a structured format:
- **Code**: A unique identifier for the error type
- **Description**: What the error means
- **Recoverable**: Whether the error can be recovered from automatically
- **Remediation**: Steps to resolve the error

## Core Error Codes

### CONFIG_ERROR

**Type**: ConfigError
**Recoverable**: No
**Description**: Configuration file parsing or validation failed.

**Common Causes**:
- Invalid YAML syntax in `ado.config.yaml`
- Missing required configuration fields
- Invalid configuration values

**Remediation**:
- Check your `ado.config.yaml` file for syntax errors
- Validate YAML syntax using a YAML linter
- Ensure all required fields are present
- Refer to the configuration schema in `docs/configuration.md`

---

### PROVIDER_ERROR

**Type**: ProviderError
**Recoverable**: Yes (usually)
**Description**: Generic error from an AI provider adapter.

**Common Causes**:
- Provider CLI not responding
- Authentication issues
- Provider-specific errors

**Remediation**:
- Check provider CLI is installed and authenticated
- Run `ado status` to verify provider availability
- Check provider-specific documentation for details
- Retry the operation

---

### PROVIDER_NOT_AVAILABLE

**Type**: ProviderNotAvailableError
**Recoverable**: Yes
**Description**: The requested AI provider is not available for use.

**Common Causes**:
- Provider CLI not installed
- Provider not authenticated
- Provider disabled in configuration

**Remediation**:
- Install the provider CLI (e.g., `npm install -g @claude/cli`)
- Authenticate with the provider
- Enable the provider in `ado.config.yaml`
- Run `ado status` to check provider availability

---

### RATE_LIMIT_ERROR

**Type**: RateLimitError
**Recoverable**: Yes
**Description**: Provider has reached its rate limit.

**Common Causes**:
- Too many requests in a short time
- Daily/hourly quota exceeded
- Token limit reached

**Remediation**:
- Wait for rate limit reset (check `resetsAt` in error details)
- Enable additional providers for automatic failover
- Enable API fallback mode
- Reduce request frequency

---

### TASK_ERROR

**Type**: TaskError
**Recoverable**: No (usually)
**Description**: Task execution failed.

**Common Causes**:
- Task prompt rejected by provider
- Task execution interrupted
- Internal task processing error

**Remediation**:
- Review task prompt for issues
- Check task logs for detailed error information
- Retry with a different provider
- Simplify the task if it's too complex

---

### NO_PROVIDERS

**Type**: NoProvidersError
**Recoverable**: No
**Description**: No providers are available to handle the task.

**Common Causes**:
- All providers disabled
- All providers rate-limited
- No providers match task requirements

**Remediation**:
- Enable at least one provider in `ado.config.yaml`
- Ensure providers are installed and authenticated
- Check that rate limits haven't been exhausted
- Run `ado config providers` to configure providers

---

### STATE_ERROR

**Type**: StateError
**Recoverable**: No
**Description**: State persistence or retrieval failed.

**Common Causes**:
- Database file corrupted
- Insufficient disk space
- File permissions issues

**Remediation**:
- Check that the `.ado` directory is writable
- Verify disk space is available
- Check file permissions on `state.db`
- Consider deleting and reinitializing state (will lose history)

---

## Task Management Error Codes

### TASK_NOT_FOUND

**Code**: `TASK_NOT_FOUND`
**Recoverable**: No
**Description**: The specified task ID does not exist.

**Remediation**:
- Verify the task ID is correct
- Run `ado status` to list active tasks
- Check task history for completed/failed tasks

---

### TASK_NOT_RUNNING

**Code**: `TASK_NOT_RUNNING`
**Recoverable**: No
**Description**: Attempted to interrupt a task that is not currently running.

**Remediation**:
- Verify task status with `ado status`
- Only interrupt tasks with status `running`

---

### TASK_NOT_PAUSED

**Code**: `TASK_NOT_PAUSED`
**Recoverable**: No
**Description**: Attempted to resume a task that is not paused.

**Remediation**:
- Verify task status is `paused` before resuming
- Check task state with `ado status`

---

### TASK_TIMEOUT

**Code**: `TASK_TIMEOUT`
**Recoverable**: Yes
**Description**: Task execution exceeded the configured timeout.

**Common Causes**:
- Complex task taking too long
- Provider not responding
- Network issues

**Remediation**:
- Increase timeout in configuration
- Break down complex tasks into smaller steps
- Check network connectivity
- Retry the task

---

## Provider Routing Error Codes

### NO_PROVIDER_AVAILABLE

**Code**: `NO_PROVIDER_AVAILABLE`
**Recoverable**: Yes
**Description**: No provider could be selected for the task.

**Common Causes**:
- All providers rate-limited
- No providers match required capabilities
- All providers disabled

**Remediation**:
- Wait for rate limit reset
- Enable additional providers
- Check task capability requirements
- Review provider configurations

---

### ADAPTER_NOT_FOUND

**Code**: `ADAPTER_NOT_FOUND`
**Recoverable**: No
**Description**: The specified provider adapter does not exist.

**Remediation**:
- Verify provider ID in configuration
- Check supported providers list
- Ensure provider adapter is installed

---

## Cost Management Error Codes

### DAILY_COST_LIMIT_EXCEEDED

**Code**: `DAILY_COST_LIMIT_EXCEEDED`
**Recoverable**: No
**Description**: Daily cost limit has been exceeded.

**Remediation**:
- Wait until the next day for limit reset
- Increase `maxDailySpend` in configuration
- Review cost allocation across tasks

---

### TASK_COST_LIMIT_EXCEEDED

**Code**: `TASK_COST_LIMIT_EXCEEDED`
**Recoverable**: No
**Description**: Individual task exceeded its cost limit.

**Remediation**:
- Increase `maxCostPerTask` in configuration
- Break down expensive tasks into smaller units
- Use subscription-based providers when possible

---

### COST_CONFIRMATION_REJECTED

**Code**: `COST_CONFIRMATION_REJECTED`
**Recoverable**: No
**Description**: User rejected the task cost confirmation prompt.

**Remediation**:
- Approve the cost to proceed
- Modify task to reduce estimated cost
- Increase cost thresholds to avoid prompts

---

## Queue Management Error Codes

### QUEUE_FULL

**Code**: `QUEUE_FULL`
**Recoverable**: Yes
**Description**: Task queue has reached maximum capacity.

**Remediation**:
- Wait for queued tasks to complete
- Increase `maxQueueSize` in configuration
- Cancel unnecessary queued tasks

---

## Execution Error Codes

### NOT_GIT_REPOSITORY

**Code**: `NOT_GIT_REPOSITORY`
**Recoverable**: No
**Description**: Attempted to use git-based features in a non-git directory.

**Remediation**:
- Initialize a git repository with `git init`
- Run ADO from within a git repository
- Disable git-based features if not needed

---

### WORKTREE_CREATION_FAILED

**Code**: `WORKTREE_CREATION_FAILED`
**Recoverable**: No
**Description**: Failed to create a git worktree for parallel execution.

**Remediation**:
- Check git repository is in a valid state
- Ensure no conflicting worktrees exist
- Verify disk space is available
- Check file permissions

---

### WORKTREE_REMOVAL_FAILED

**Code**: `WORKTREE_REMOVAL_FAILED`
**Recoverable**: Yes
**Description**: Failed to clean up a git worktree.

**Remediation**:
- Manually remove worktree with `git worktree remove`
- Check for locked files in worktree directory
- Verify file permissions

---

## Human-in-the-Loop Error Codes

### APPROVAL_TIMEOUT

**Code**: `APPROVAL_TIMEOUT`
**Recoverable**: No
**Description**: Human approval request timed out.

**Remediation**:
- Respond to approval requests promptly
- Increase `approvalTimeout` in configuration
- Disable HITL for non-critical tasks

---

### APPROVAL_REQUEST_NOT_FOUND

**Code**: `APPROVAL_REQUEST_NOT_FOUND`
**Recoverable**: No
**Description**: The specified approval request does not exist.

**Remediation**:
- Verify approval request ID
- Check if request already expired or completed

---

### APPROVAL_ALREADY_DECIDED

**Code**: `APPROVAL_ALREADY_DECIDED`
**Recoverable**: No
**Description**: Attempted to respond to an already-decided approval request.

**Remediation**:
- Check approval request status
- Avoid duplicate responses

---

## Checkpoint Error Codes

### CHECKPOINT_NOT_FOUND

**Code**: `CHECKPOINT_NOT_FOUND`
**Recoverable**: No
**Description**: The specified checkpoint does not exist.

**Remediation**:
- Verify checkpoint ID
- List available checkpoints for the task
- Ensure checkpoint was successfully created

---

## Workflow Error Codes

### TASK_EXECUTOR_NOT_SET

**Code**: `TASK_EXECUTOR_NOT_SET`
**Recoverable**: No
**Description**: Workflow engine attempted to execute a task without a task executor configured.

**Remediation**:
- Ensure workflow engine is properly initialized
- Set task executor before running workflows
- Check workflow configuration

---

## Getting Help

If you encounter an error code not listed here, or if the remediation steps don't resolve your issue:

1. Check the ADO logs for detailed error information
2. Run `ado status --verbose` for diagnostic information
3. Review the documentation at `docs/`
4. Report issues at the ADO GitHub repository

## Exit Codes

ADO uses standard exit codes:

- `0` - Success
- `1` - General error
- `2` - Configuration error
- `3` - Provider error
- `4` - Task execution error
- `5` - State persistence error

---

**Last Updated**: 2025-11-27
**ADO Version**: 1.0.0
