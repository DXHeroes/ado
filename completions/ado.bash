#!/usr/bin/env bash
# Bash completion script for ado

_ado_completions() {
    local cur prev opts
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"

    # Main commands
    local commands="init run status config workflow report help"

    # Subcommands for config
    local config_cmds="providers show set"

    # Subcommands for workflow
    local workflow_cmds="run list validate"

    # Options
    local global_opts="--help --version --debug --no-color"
    local run_opts="--provider --providers --exclude --access-mode --no-api-fallback --max-cost --resume --model --max-turns --yes --yolo"
    local report_opts="--costs --usage --period --provider --format"
    local workflow_opts="--hitl --parallel --yes"

    # Complete based on position
    if [ $COMP_CWORD -eq 1 ]; then
        COMPREPLY=( $(compgen -W "${commands}" -- ${cur}) )
        return 0
    fi

    # Complete based on previous word
    case "${prev}" in
        config)
            COMPREPLY=( $(compgen -W "${config_cmds}" -- ${cur}) )
            return 0
            ;;
        workflow)
            COMPREPLY=( $(compgen -W "${workflow_cmds}" -- ${cur}) )
            return 0
            ;;
        run)
            COMPREPLY=( $(compgen -W "${run_opts}" -- ${cur}) )
            return 0
            ;;
        report)
            COMPREPLY=( $(compgen -W "${report_opts}" -- ${cur}) )
            return 0
            ;;
        --provider|--providers|--exclude)
            local providers="claude-code gemini-cli cursor-cli copilot-cli codex-cli"
            COMPREPLY=( $(compgen -W "${providers}" -- ${cur}) )
            return 0
            ;;
        --access-mode)
            COMPREPLY=( $(compgen -W "subscription api free" -- ${cur}) )
            return 0
            ;;
        --period)
            COMPREPLY=( $(compgen -W "today week month" -- ${cur}) )
            return 0
            ;;
        --format)
            COMPREPLY=( $(compgen -W "table json csv" -- ${cur}) )
            return 0
            ;;
        --hitl)
            COMPREPLY=( $(compgen -W "autonomous review-edits approve-steps manual" -- ${cur}) )
            return 0
            ;;
        --context)
            COMPREPLY=( $(compgen -W "local kubernetes" -- ${cur}) )
            return 0
            ;;
    esac

    # Complete file paths for workflow run
    if [ "${COMP_WORDS[1]}" == "workflow" ] && [ "${COMP_WORDS[2]}" == "run" ]; then
        COMPREPLY=( $(compgen -f -X '!*.yaml' -- ${cur}) )
        return 0
    fi

    # Default to global options
    COMPREPLY=( $(compgen -W "${global_opts}" -- ${cur}) )
}

complete -F _ado_completions ado
