# Shell Completions for ADO

This directory contains shell completion scripts for the `ado` CLI.

## Installation

### Bash

Add to your `~/.bashrc` or `~/.bash_profile`:

```bash
source /path/to/ado/completions/ado.bash
```

Or copy to system completion directory:

```bash
sudo cp completions/ado.bash /etc/bash_completion.d/ado
```

### Zsh

Add to your `~/.zshrc`:

```zsh
source /path/to/ado/completions/ado.zsh
```

Or copy to zsh completion directory:

```bash
# For oh-my-zsh users
cp completions/ado.zsh ~/.oh-my-zsh/completions/_ado

# For standard zsh
sudo cp completions/ado.zsh /usr/local/share/zsh/site-functions/_ado
```

Then reload your shell or run:

```bash
autoload -U compinit && compinit
```

### Fish

Copy to fish completions directory:

```bash
cp completions/ado.fish ~/.config/fish/completions/
```

Fish will automatically load the completions on next shell start.

## Features

The completion scripts provide:

- **Command completion**: All main commands (init, run, status, config, workflow, report)
- **Subcommand completion**: Subcommands for config and workflow
- **Option completion**: All command-line flags and options
- **Provider completion**: Auto-complete provider names
- **File completion**: YAML files for workflow commands
- **Value completion**: Valid values for enum-like options (access-mode, period, format, etc.)

## Testing

After installation, try:

```bash
ado <TAB>              # Shows all commands
ado run --<TAB>        # Shows run command options
ado config <TAB>       # Shows config subcommands
ado workflow run <TAB> # Shows YAML files
```

## Updating

If you modify the ADO CLI commands or options, update the completion scripts accordingly and reinstall them.
