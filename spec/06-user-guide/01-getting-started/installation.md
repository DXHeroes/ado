# Installation Guide

## Přehled

Průvodce instalací ADO CLI a všech potřebných závislostí.

## Požadavky

### Systémové požadavky

| Požadavek | Minimum | Doporučeno |
|-----------|---------|------------|
| OS | macOS 12+, Linux, Windows 10+ | macOS 14+, Ubuntu 22.04+ |
| Node.js | 22.0.0 | 22 LTS (latest) |
| RAM | 4 GB | 8 GB+ |
| Disk | 1 GB | 5 GB+ |
| Git | 2.30+ | 2.40+ |

### Ověření požadavků

```bash
# Node.js
node --version
# v22.x.x

# pnpm (doporučeno)
pnpm --version
# 9.x.x

# Git
git --version
# git version 2.40+
```

## Instalace ADO CLI

### Pomocí pnpm (doporučeno)

```bash
# Globální instalace
pnpm add -g @dxheroes/ado

# Ověření instalace
ado --version
# ADO v2.0.0
```

### Pomocí npm

```bash
npm install -g @dxheroes/ado
```

### Pomocí npx (bez instalace)

```bash
npx @dxheroes/ado --help
```

### Pomocí Homebrew (macOS)

```bash
brew tap dxheroes/tap
brew install ado
```

## Instalace AI agentů

ADO vyžaduje alespoň jednoho AI agenta. Doporučujeme Claude Code.

### Claude Code (doporučeno)

```bash
# Instalace pomocí npm
npm install -g @anthropic-ai/claude-code

# Ověření
claude --version

# Autentizace (vyžaduje Anthropic účet)
claude auth login
```

**Předplatné:**
- Claude MAX ($20/měsíc) - neomezené použití
- Claude Pro ($20/měsíc) - limity na požadavky
- API - pay-per-use

### Gemini CLI

```bash
# Instalace
npm install -g @google/gemini-cli

# Ověření
gemini --version

# Autentizace
gemini auth login
```

**Předplatné:**
- Google One AI Premium ($19.99/měsíc)
- API - pay-per-use

### Cursor CLI

```bash
# Instalace (vyžaduje Cursor IDE)
# CLI je součástí Cursor IDE

# Ověření
cursor --version
```

**Předplatné:**
- Cursor Pro ($20/měsíc)
- Cursor Business ($40/měsíc)

### GitHub Copilot CLI

```bash
# Instalace
gh extension install github/gh-copilot

# Ověření
gh copilot --version

# Autentizace
gh auth login
```

**Předplatné:**
- GitHub Copilot Individual ($10/měsíc)
- GitHub Copilot Business ($19/měsíc)

### OpenAI Codex CLI

```bash
# Instalace
npm install -g @openai/codex-cli

# Ověření
codex --version

# Konfigurace API klíče
export OPENAI_API_KEY="sk-..."
```

## Ověření instalace

```bash
# Zobrazení dostupných providerů
ado providers list

# Očekávaný výstup:
# ┌────────────┬─────────────┬───────────┬────────────────┐
# │ ID         │ NAME        │ STATUS    │ ACCESS MODE    │
# ├────────────┼─────────────┼───────────┼────────────────┤
# │ claude-code│ Claude Code │ available │ subscription   │
# │ gemini-cli │ Gemini CLI  │ available │ subscription   │
# │ cursor-cli │ Cursor CLI  │ not found │ -              │
# └────────────┴─────────────┴───────────┴────────────────┘

# Health check
ado health
```

## Aktualizace

### Aktualizace ADO

```bash
# pnpm
pnpm update -g @dxheroes/ado

# npm
npm update -g @dxheroes/ado

# Homebrew
brew upgrade ado
```

### Aktualizace agentů

```bash
# Claude Code
npm update -g @anthropic-ai/claude-code

# Gemini CLI
npm update -g @google/gemini-cli
```

## Odinstalace

```bash
# Odinstalace ADO
pnpm remove -g @dxheroes/ado
# nebo
npm uninstall -g @dxheroes/ado

# Odstranění konfigurace
rm -rf ~/.config/ado
rm -rf ~/.ado
```

## Docker instalace

Pro kontejnerizované prostředí.

```dockerfile
# Dockerfile
FROM node:22-slim

# Instalace ADO
RUN npm install -g @dxheroes/ado

# Instalace Claude Code
RUN npm install -g @anthropic-ai/claude-code

# Pracovní adresář
WORKDIR /workspace

ENTRYPOINT ["ado"]
```

```bash
# Build
docker build -t ado-cli .

# Použití
docker run -it -v $(pwd):/workspace \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  ado-cli run "your task"
```

## Troubleshooting instalace

### "Command not found: ado"

```bash
# Zkontrolujte PATH
echo $PATH

# Přidejte global node_modules do PATH
export PATH="$PATH:$(pnpm root -g)"

# Nebo pro npm
export PATH="$PATH:$(npm root -g)"
```

### "Permission denied"

```bash
# macOS/Linux - použijte správce oprávnění
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}

# Nebo instalujte do home adresáře
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

### "Node version mismatch"

```bash
# Použijte nvm pro správu verzí Node.js
nvm install 22
nvm use 22
nvm alias default 22
```

### "Claude Code authentication failed"

```bash
# Reset autentizace
claude auth logout
claude auth login

# Zkontrolujte předplatné na console.anthropic.com
```

## Další kroky

Po úspěšné instalaci:

1. [Quick Start](./quick-start.md) - První použití ADO
2. [Configuration](./configuration.md) - Konfigurace projektu
3. [Core Concepts](../02-core-concepts/autonomous-mode.md) - Porozumění ADO

---

## Souvislosti

- [Quick Start](./quick-start.md)
- [Configuration](./configuration.md)
- [System Requirements](../../02-requirements/02-non-functional/NFR-001-performance.md)
