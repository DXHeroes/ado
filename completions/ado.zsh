#compdef ado

# Zsh completion script for ado

_ado() {
    local line state

    _arguments -C \
        '1: :->command' \
        '*::arg:->args'

    case $state in
        command)
            _arguments '1:Commands:(init run status config workflow report help)'
            ;;
        args)
            case $line[1] in
                run)
                    _arguments \
                        '--provider[Specific provider to use]:provider:(claude-code gemini-cli cursor-cli copilot-cli codex-cli)' \
                        '--providers[Comma-separated list of providers]:providers:' \
                        '--exclude[Providers to exclude]:providers:' \
                        '--access-mode[Force specific access mode]:mode:(subscription api free)' \
                        '--no-api-fallback[Disable API fallback]' \
                        '--max-cost[Maximum API cost in USD]:cost:' \
                        '--resume[Resume from previous session]:sessionId:' \
                        '--model[Specify model to use]:model:' \
                        '--max-turns[Maximum conversation turns]:turns:' \
                        '--yes[Skip confirmations]' \
                        '--yolo[YOLO mode - bypass ALL permissions]' \
                        '--help[Show help]'
                    ;;
                config)
                    _arguments '1:Subcommand:(providers show set)'
                    ;;
                workflow)
                    case $line[2] in
                        run)
                            _arguments \
                                '--hitl[HITL policy]:policy:(autonomous review-edits approve-steps manual)' \
                                '--parallel[Number of parallel tasks]:number:' \
                                '--yes[Skip confirmations]' \
                                '--verbose[Verbose output]' \
                                '*:file:_files -g "*.yaml"'
                            ;;
                        *)
                            _arguments '1:Subcommand:(run list validate)'
                            ;;
                    esac
                    ;;
                report)
                    _arguments \
                        '--costs[Show cost report]' \
                        '--usage[Show usage report]' \
                        '--period[Time period]:period:(today week month)' \
                        '--provider[Filter by provider]:provider:(claude-code gemini-cli cursor-cli copilot-cli codex-cli)' \
                        '--format[Output format]:format:(table json csv)' \
                        '--verbose[Verbose output]'
                    ;;
                status)
                    _arguments \
                        '--verbose[Verbose output]' \
                        '--help[Show help]'
                    ;;
            esac
            ;;
    esac
}

_ado "$@"
