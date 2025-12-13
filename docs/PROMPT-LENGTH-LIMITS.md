# Prompt Length Limits

## Overview

ADO automatically validates and manages prompt length to prevent "Prompt is too long" errors when executing tasks with AI agents. This is particularly important for Claude Code CLI, which has command-line argument length limits.

## Limits

### Default Configuration

- **Maximum prompt length**: 50,000 characters (50KB)
- **Warning threshold**: 80% (40,000 characters)
- **Truncation strategy**: Smart truncation with preserved start/end

### Why These Limits?

1. **OS command-line limits**: Most operating systems limit command arguments to ~100-200KB
2. **Context file overhead**: `CLAUDE.md`, `AGENTS.md`, and other context files add to total length
3. **Safety margin**: 50KB leaves room for context files while staying well below OS limits

## How It Works

### 1. Prompt Validation

Before executing a task, ADO:

1. Estimates total length including:
   - Base prompt
   - Context files (CLAUDE.md, AGENTS.md)
   - CLI formatting overhead (~500 bytes)

2. Validates against the limit:
   - If under 80%: Proceeds normally
   - If 80-100%: Shows warning but proceeds
   - If over 100%: Applies smart truncation

### 2. Smart Truncation

When a prompt exceeds the limit, ADO uses **smart truncation**:

```
[First 30% of available space]
[...]
[Last 10% of available space]
```

This preserves:
- Task context at the beginning
- Recent instructions at the end
- Indication that content was truncated

### 3. Error Handling

If context files are too large (leaving < 500 chars for prompt):

```
Error: Context files are too large (60000 bytes).
Cannot fit prompt. Consider reducing CLAUDE.md/AGENTS.md size.
```

## Debug Mode

Enable debug logging to see truncation details:

```bash
export ADO_DEBUG=1
ado run --yolo "your very long prompt..."
```

Output:
```
[WARN] Total prompt length (75000 chars) exceeds limit (50000 chars)
[WARN] Applying smart truncation to prompt
[WARN] Truncated 25000 characters from prompt (75000 → 50000)
```

## Configuration

Currently, prompt limits are hardcoded in `@dxheroes/ado-shared/utils/prompt`. Future versions may support configuration via `ado.config.yaml`:

```yaml
# Future configuration (not yet implemented)
prompts:
  maxLength: 50000
  warningThreshold: 0.8
  truncationStrategy: truncate-middle
```

## Best Practices

### 1. Keep Prompts Concise

Instead of:
```bash
ado run "I want you to implement a new feature that does X, Y, and Z.
First, you should analyze the codebase and understand how the existing
implementation works. Then, you should create a plan for implementing
the new feature. After that, you should implement the feature in stages,
starting with... [continues for 20 more lines]"
```

Use:
```bash
ado run "Implement feature X with support for Y and Z"
```

Let the autonomous workflow handle the breakdown.

### 2. Reduce Context File Size

If you see frequent truncation warnings:

1. **Review AGENTS.md**: Remove outdated project information
2. **Split context**: Use separate files for different agents (CLAUDE.md, GEMINI.md)
3. **Remove duplication**: Don't repeat information from README.md

### 3. Use Autonomous Mode

Instead of long manual prompts:

```bash
# Instead of a 10,000 character prompt
ado auto "Implement user authentication"
```

The autonomous workflow will:
- Generate detailed specifications
- Break down into subtasks
- Handle each step efficiently

## Technical Details

### Implementation

**Location**: `packages/shared/src/utils/prompt.ts`

**Key Functions**:

- `validatePromptLength()`: Validates and optionally truncates
- `estimateTotalPromptLength()`: Estimates total with context files
- `smartTruncatePrompt()`: Intelligent truncation preserving important parts

**Integration**: `packages/adapters/src/claude-code/adapter.ts`

The Claude Code adapter validates prompts before passing to CLI:

```typescript
private validateAndTruncatePrompt(prompt: string, workingDir: string): string {
  // Collect context files
  // Estimate total length
  // Apply truncation if needed
  // Return validated prompt
}
```

### Testing

Tests: `packages/shared/src/utils/prompt.test.ts`

Run tests:
```bash
pnpm vitest run utils/prompt
```

Coverage:
- ✓ Short prompts (no truncation)
- ✓ Warning threshold (80%+)
- ✓ Truncation strategies (start, end, middle)
- ✓ Context file estimation
- ✓ Smart truncation with preservation

## Troubleshooting

### "Prompt is too long" Error

**Symptom**: Command fails with "killed" or "Prompt is too long"

**Solution**:
1. Shorten your prompt
2. Enable debug mode to see truncation
3. Check context file sizes

### Context Files Too Large

**Symptom**:
```
Error: Context files are too large (60000 bytes).
Cannot fit prompt.
```

**Solution**:
1. Reduce AGENTS.md size (currently 12KB is fine, 50KB+ would be too much)
2. Remove unnecessary context from CLAUDE.md
3. Split context across multiple files

### Frequent Truncation Warnings

**Symptom**: Every command shows truncation warnings

**Solution**:
1. Use shorter, more focused prompts
2. Reduce context file sizes
3. Use `ado auto` for complex tasks instead of manual prompts

## Future Enhancements

Planned improvements:

1. **Configurable limits**: Set custom limits in `ado.config.yaml`
2. **Per-adapter limits**: Different limits for different agents
3. **Context file selection**: Choose which context files to include
4. **Prompt compression**: Intelligent summarization for large prompts
5. **Token-based limits**: Use token count instead of character count

## Related

- [Autonomous Workflow](./AUTONOMOUS-WORKFLOW.md)
- [Context Management](./CONTEXT-MANAGEMENT.md)
- [Configuration Guide](./CONFIGURATION.md)
