# Fish completion script for ado

# Main commands
complete -c ado -f -n "__fish_use_subcommand" -a "init" -d "Initialize ADO configuration"
complete -c ado -f -n "__fish_use_subcommand" -a "run" -d "Execute a task"
complete -c ado -f -n "__fish_use_subcommand" -a "status" -d "Show project status"
complete -c ado -f -n "__fish_use_subcommand" -a "config" -d "Manage configuration"
complete -c ado -f -n "__fish_use_subcommand" -a "workflow" -d "Manage workflows"
complete -c ado -f -n "__fish_use_subcommand" -a "report" -d "Generate reports"
complete -c ado -f -n "__fish_use_subcommand" -a "help" -d "Show help"

# Global options
complete -c ado -l help -d "Show help"
complete -c ado -l version -d "Show version"
complete -c ado -l debug -d "Enable debug output"
complete -c ado -l no-color -d "Disable colored output"

# run command options
complete -c ado -n "__fish_seen_subcommand_from run" -l provider -d "Specific provider" -xa "claude-code gemini-cli cursor-cli copilot-cli codex-cli"
complete -c ado -n "__fish_seen_subcommand_from run" -l providers -d "Comma-separated providers"
complete -c ado -n "__fish_seen_subcommand_from run" -l exclude -d "Providers to exclude"
complete -c ado -n "__fish_seen_subcommand_from run" -l access-mode -d "Access mode" -xa "subscription api free"
complete -c ado -n "__fish_seen_subcommand_from run" -l no-api-fallback -d "Disable API fallback"
complete -c ado -n "__fish_seen_subcommand_from run" -l max-cost -d "Max API cost (USD)"
complete -c ado -n "__fish_seen_subcommand_from run" -l resume -d "Resume from session"
complete -c ado -n "__fish_seen_subcommand_from run" -l model -d "Specify model"
complete -c ado -n "__fish_seen_subcommand_from run" -l max-turns -d "Max conversation turns"
complete -c ado -n "__fish_seen_subcommand_from run" -l yes -d "Skip confirmations"
complete -c ado -n "__fish_seen_subcommand_from run" -l yolo -d "YOLO mode - bypass ALL permissions"

# config subcommands
complete -c ado -n "__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from providers show set" -f -a "providers" -d "Configure providers"
complete -c ado -n "__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from providers show set" -f -a "show" -d "Show configuration"
complete -c ado -n "__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from providers show set" -f -a "set" -d "Set config value"

# workflow subcommands
complete -c ado -n "__fish_seen_subcommand_from workflow; and not __fish_seen_subcommand_from run list validate" -f -a "run" -d "Run workflow"
complete -c ado -n "__fish_seen_subcommand_from workflow; and not __fish_seen_subcommand_from run list validate" -f -a "list" -d "List workflows"
complete -c ado -n "__fish_seen_subcommand_from workflow; and not __fish_seen_subcommand_from run list validate" -f -a "validate" -d "Validate workflow"

# workflow run options
complete -c ado -n "__fish_seen_subcommand_from workflow; and __fish_seen_subcommand_from run" -l hitl -d "HITL policy" -xa "autonomous review-edits approve-steps manual"
complete -c ado -n "__fish_seen_subcommand_from workflow; and __fish_seen_subcommand_from run" -l parallel -d "Parallel tasks"
complete -c ado -n "__fish_seen_subcommand_from workflow; and __fish_seen_subcommand_from run" -l yes -d "Skip confirmations"

# report command options
complete -c ado -n "__fish_seen_subcommand_from report" -l costs -d "Show cost report"
complete -c ado -n "__fish_seen_subcommand_from report" -l usage -d "Show usage report"
complete -c ado -n "__fish_seen_subcommand_from report" -l period -d "Time period" -xa "today week month"
complete -c ado -n "__fish_seen_subcommand_from report" -l provider -d "Filter by provider" -xa "claude-code gemini-cli cursor-cli copilot-cli codex-cli"
complete -c ado -n "__fish_seen_subcommand_from report" -l format -d "Output format" -xa "table json csv"
