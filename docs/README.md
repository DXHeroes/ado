# ADO Documentation

Welcome to the ADO (Agentic Development Orchestrator) documentation hub. This guide will help you navigate our comprehensive documentation based on your role and needs.

## Quick Navigation

### 🚀 New to ADO?
**Start here for a quick introduction:**
1. [Quick Start (5 minutes)](./QUICKSTART.md) - Get up and running fast
2. [Getting Started Guide](./GETTING_STARTED.md) - Step-by-step setup
3. [Installation](./installation.md) - Detailed installation instructions

### 👨‍💻 For Developers
**Building applications with ADO:**
- [Configuration Reference](./configuration.md) - Complete config options
- [Provider Setup](./providers.md) - Configure AI agents
- [API Reference](./api-reference.md) - tRPC and WebSocket APIs
- [Package Documentation](../packages/) - Core, CLI, Adapters, Dashboard
- [Architecture](../spec/03-architecture/) - System design and C4 models

### 🔧 For DevOps/Platform Engineers
**Deploying and operating ADO:**
- [Docker Deployment Guide](./DOCKER-DEPLOYMENT.md) - Production Docker deployment
- [Release Workflow](./RELEASE-WORKFLOW.md) - CI/CD and Docker publishing
- [GitHub Secrets Setup](./GITHUB-SECRETS-SETUP.md) - Configure release automation
- [Deployment Guide](./deployment.md) - Kubernetes, Docker, Coolify
- [Scaling Strategies](../spec/07-operations/03-scaling/) - Capacity planning
- [Monitoring & Observability](../spec/07-operations/02-monitoring/) - Metrics and tracing
- [Performance Tuning](./performance.md) - Optimization guide

### 🆘 Need Help?
- [Troubleshooting Guide](./TROUBLESHOOTING.md) - Common issues and solutions
- [Error Codes Reference](./ERROR-CODES.md) - Error explanations
- [FAQ](./TROUBLESHOOTING.md#faq) - Frequently asked questions

### 🧑‍🔬 For Contributors
**Contributing to ADO:**
- [Contributing Guide](../CONTRIBUTING.md) - How to contribute
- [Development Setup](../README.md#development) - Dev environment
- [Project Structure](../AGENTS.md) - Codebase organization
- [Coding Standards](../AGENTS.md#coding-standards) - Code conventions

## Documentation Structure

### `/docs` - User Guides & References
User-facing documentation for installing, configuring, and operating ADO.

### `/spec` - Technical Specification
Detailed technical specification (v2.1.0) with architecture, design decisions, and implementation plans.

### `/packages/*/README.md` - Package Documentation
Detailed documentation for each package (core, cli, adapters, dashboard, api, mcp-server).

### Root Files
- `README.md` - Project overview
- `AGENTS.md` - AI agent context and coding conventions
- `CLAUDE.md` - Claude Code specific context

## Document Index

### Core Documentation
| Document | Description | Audience |
|----------|-------------|----------|
| [Quick Start](./QUICKSTART.md) | 5-minute setup guide | Everyone |
| [Getting Started](./GETTING_STARTED.md) | Step-by-step tutorial | New users |
| [Installation](./installation.md) | Complete installation guide | Everyone |
| [Configuration](./configuration.md) | Config file reference | Developers |
| [Troubleshooting](./TROUBLESHOOTING.md) | Common problems & solutions | Everyone |

### Feature Documentation
| Document | Description | Audience |
|----------|-------------|----------|
| [Providers](./providers.md) | AI agent setup | Developers |
| [Notifications](./notifications.md) | Slack, Email, Webhook setup | DevOps |
| [API Reference](./api-reference.md) | tRPC and WebSocket APIs | Developers |
| [Performance](./performance.md) | Benchmarks and tuning | DevOps |

### Operational Documentation
| Document | Description | Audience |
|----------|-------------|----------|
| [Deployment](./deployment.md) | K8s, Docker overview | DevOps |
| [Coolify Deployment](./COOLIFY_DEPLOYMENT.md) | Deploy on Coolify (recommended for small teams) | DevOps |
| [Remote Execution](./REMOTE_EXECUTION.md) | Local, Remote, Hybrid modes | Developers |
| [Monitoring](../spec/07-operations/02-monitoring/) | Observability setup | DevOps |
| [Scaling](../spec/07-operations/03-scaling/) | Capacity planning | Platform Engineers |

### Technical Specification
| Document | Description | Audience |
|----------|-------------|----------|
| [Spec Overview](../spec/README.md) | Specification navigation | Architects |
| [Architecture](../spec/03-architecture/) | C4 models, components | Architects |
| [Design Documents](../spec/04-design/) | Distributed system, autonomous workflow | Architects |
| [Advanced Features](../spec/DEF.md) | LiteLLM, Temporal.io, Firecracker | Architects |

### Project Status
| Document | Description | Audience |
|----------|-------------|----------|
| [Compliance Report](./COMPLIANCE-REPORT.md) | Specification compliance (95%) | Contributors |
| [Changelog](../spec/CHANGELOG.md) | Version history | Everyone |

## Learning Paths

### Path 1: Individual Developer
**Goal: Use ADO for local development**

1. [Quick Start](./QUICKSTART.md) (5 min)
2. [Installation](./installation.md) (10 min)
3. [Configuration](./configuration.md) (15 min)
4. Run your first task
5. [Providers](./providers.md) - Add more agents
6. [Troubleshooting](./TROUBLESHOOTING.md) - When things go wrong

**Time to productivity: ~30 minutes**

### Path 2: Team Lead / DevOps Engineer
**Goal: Deploy ADO for team use**

1. [Getting Started](./GETTING_STARTED.md) (20 min)
2. [Coolify Deployment](./COOLIFY_DEPLOYMENT.md) (30 min) - Recommended for small teams
3. [Remote Execution](./REMOTE_EXECUTION.md) (15 min) - Configure hybrid mode
4. [Configuration](./configuration.md) - Team setup
5. [Notifications](./notifications.md) - Slack/Email alerts
6. [Monitoring](../spec/07-operations/02-monitoring/) - Observability

**Time to production: ~1.5 hours**

Alternative: [Kubernetes Deployment](../deploy/KUBERNETES.md) for larger teams (20+ people)

### Path 3: Platform Engineer / Architect
**Goal: Understand ADO architecture for customization**

1. [Specification Overview](../spec/README.md) (15 min)
2. [Architecture](../spec/03-architecture/) (1 hour)
3. [Design Documents](../spec/04-design/) (1 hour)
4. [Package Documentation](../packages/) (30 min)
5. [Advanced Features](../spec/DEF.md) (30 min)
6. [API Reference](./api-reference.md) (30 min)

**Time to deep understanding: ~4 hours**

### Path 4: Contributor
**Goal: Contribute code to ADO**

1. [Project Structure](../AGENTS.md) (30 min)
2. [Contributing Guide](../CONTRIBUTING.md) (15 min)
3. [Development Setup](../README.md#development) (20 min)
4. [Architecture](../spec/03-architecture/) (1 hour)
5. [Coding Standards](../AGENTS.md#coding-standards) (15 min)
6. Pick an issue and start coding!

**Time to first contribution: ~2-3 hours**

## Version Information

- **Current Version**: 2.1.0
- **Specification**: v2.1.0 ([spec/](../spec/))
- **Status**: Production-ready (M1-M6 complete, M7-M9 planned)

## Getting Help

### Documentation Issues
Found a problem in the docs? [Open an issue](https://github.com/dxheroes/ado/issues/new?labels=documentation)

### Technical Support
- Check [Troubleshooting Guide](./TROUBLESHOOTING.md)
- Review [Error Codes](./ERROR-CODES.md)
- Search [existing issues](https://github.com/dxheroes/ado/issues)
- [Ask a question](https://github.com/dxheroes/ado/discussions)

### Community
- [GitHub Discussions](https://github.com/dxheroes/ado/discussions)
- [Contributing Guide](../CONTRIBUTING.md)

## Documentation Conventions

### Code Blocks
All code examples use syntax highlighting and include comments explaining key concepts.

### Callouts
- 💡 **Tip**: Helpful suggestions
- ⚠️ **Warning**: Important caveats
- 🚧 **Planned**: Features in specification but not yet implemented
- ✅ **Complete**: Fully implemented and tested

### Cross-References
Links use relative paths and are tested to prevent broken links.

---

**Last Updated**: 2025-01-13
**Maintainers**: DX Heroes Team
