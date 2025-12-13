# Release Workflow

This document describes the automated release and Docker publishing workflow for ADO.

## Overview

The release workflow is triggered automatically when changes are pushed to the `main` branch. It uses [Release Please](https://github.com/googleapis/release-please) to manage versioning and changelog generation.

## Workflow Steps

1. **Release Please**: Creates or updates release PRs with version bumps and changelog updates
2. **NPM Publishing**: Publishes packages to npm registry when releases are created
3. **Docker Publishing**: Builds and publishes Docker images to Docker Hub and GitHub Container Registry

## Docker Images

Three Docker images are published:

- `dxheroes/ado` - Main CLI application with API server (multi-stage build)
- `dxheroes/ado-api` - Standalone API server
- `dxheroes/ado-dashboard` - Web dashboard (nginx-based)

Each image is also published to GitHub Container Registry:

- `ghcr.io/dxheroes/ado`
- `ghcr.io/dxheroes/ado-api`
- `ghcr.io/dxheroes/ado-dashboard`

## Image Tags

For version `0.1.5`, the following tags are created:

- `0.1.5` - Exact version
- `0.1` - Minor version
- `0` - Major version
- `latest` - Latest release
- `main-abc123def` - Branch and commit SHA

## Platform Support

All images are built for:
- `linux/amd64` (x86_64)
- `linux/arm64` (Apple Silicon, ARM servers)

## Required GitHub Secrets

### NPM Publishing

- `NPM_TOKEN` - NPM authentication token with publish permissions
  - Create at: https://www.npmjs.com/settings/[username]/tokens
  - Type: Automation token
  - Scope: Read and write

### Docker Hub

- `DOCKER_USERNAME` - Docker Hub username
- `DOCKER_PASSWORD` - Docker Hub access token (NOT your password)
  - Create at: https://hub.docker.com/settings/security
  - Description: "GitHub Actions ADO Release"
  - Permissions: Read, Write, Delete

### GitHub Container Registry

No additional secrets required. The workflow uses the built-in `GITHUB_TOKEN` with automatic permissions.

## Setting Up Secrets

### Via GitHub Web UI

1. Go to your repository on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret:
   - Name: `NPM_TOKEN` / `DOCKER_USERNAME` / `DOCKER_PASSWORD`
   - Value: (paste your token)
   - Click **Add secret**

### Via GitHub CLI

```bash
# Set NPM token
gh secret set NPM_TOKEN --body "npm_xxxxxxxxxxxxxxxxxxxxx"

# Set Docker Hub credentials
gh secret set DOCKER_USERNAME --body "your-dockerhub-username"
gh secret set DOCKER_PASSWORD --body "dckr_pat_xxxxxxxxxxxxxxxxxxxxx"
```

## How Releases Work

### 1. Commit with Conventional Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```bash
feat: add new parallel execution engine
fix: resolve race condition in worker pool
docs: update installation guide
chore: upgrade dependencies
```

Commit types:
- `feat:` - New feature (minor version bump)
- `fix:` - Bug fix (patch version bump)
- `feat!:` or `BREAKING CHANGE:` - Breaking change (major version bump)
- `docs:`, `chore:`, `refactor:`, `test:`, `ci:` - No version bump

### 2. Release Please Creates PR

When you push to `main`, Release Please:
- Analyzes commit messages since last release
- Determines version bump (major/minor/patch)
- Creates/updates a release PR with:
  - Version bumps in `package.json` files
  - Updated `CHANGELOG.md`

### 3. Merge Release PR

When you merge the release PR:
- Release Please creates a GitHub release
- Workflow publishes to npm
- Workflow builds and publishes Docker images

## Manual Release

To manually trigger a release:

1. **Update Version**:
   ```bash
   # Update .release-please-manifest.json manually
   # Then commit:
   git add .release-please-manifest.json
   git commit -m "chore: release 0.2.0"
   git push origin main
   ```

2. **Force Release PR**:
   - Release Please will detect the version change
   - It will create a release PR

## Testing Docker Images

### Pull from Docker Hub

```bash
# Pull latest
docker pull dxheroes/ado:latest

# Pull specific version
docker pull dxheroes/ado:0.1.5

# Pull from GHCR
docker pull ghcr.io/dxheroes/ado:latest
```

### Run Locally

```bash
# API Server (main image)
docker run -p 8080:8080 \
  -e DATABASE_URL=postgresql://... \
  dxheroes/ado:latest

# Dashboard
docker run -p 3000:3000 \
  dxheroes/ado-dashboard:latest

# CLI (one-off command)
docker run --rm dxheroes/ado:latest \
  node packages/cli/dist/index.js --version
```

### Docker Compose

```yaml
version: '3.8'
services:
  api:
    image: dxheroes/ado:latest
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/ado
      - NODE_ENV=production
    depends_on:
      - db

  dashboard:
    image: dxheroes/ado-dashboard:latest
    ports:
      - "3000:3000"
    environment:
      - API_URL=http://api:8080

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=ado
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
```

## Troubleshooting

### NPM Publish Fails

- **Error**: `401 Unauthorized`
  - Check `NPM_TOKEN` is valid and has publish permissions
  - Verify token is for the correct npm account
  - Check package scoping matches your npm account

- **Error**: `403 Forbidden`
  - Package name may be taken
  - Update scope in `package.json`: `@yourorg/package-name`

### Docker Push Fails

- **Error**: `denied: requested access to the resource is denied`
  - Verify `DOCKER_USERNAME` and `DOCKER_PASSWORD` are correct
  - Check Docker Hub organization permissions
  - Ensure image name matches your Docker Hub username/org

- **Error**: `authentication required`
  - Token may have expired
  - Recreate Docker Hub access token

### Build Fails

- **Error**: `platform not supported`
  - Remove `platforms: linux/amd64,linux/arm64` to build for single platform
  - Or use GitHub's larger runners for multi-platform builds

## Build Optimization

The workflow uses GitHub Actions cache for:
- Docker layer caching (`cache-from: type=gha`)
- pnpm dependencies (`cache: 'pnpm'`)

Typical build times:
- First build: ~8-12 minutes (no cache)
- Cached build: ~3-5 minutes
- No code changes: ~1-2 minutes (cache hit)

## Security

- Secrets are encrypted and only accessible during workflow runs
- Use access tokens, not passwords
- Rotate tokens regularly
- Use scoped tokens with minimal permissions
- Never commit secrets to the repository

## Version Strategy

ADO follows [Semantic Versioning](https://semver.org/):

- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backwards compatible
- **Patch** (0.0.1): Bug fixes, backwards compatible

Pre-release tags:
- Alpha: `0.1.0-alpha.1`
- Beta: `0.1.0-beta.1`
- RC: `0.1.0-rc.1`

## CI/CD Pipeline

```
┌─────────────────────────────────────────────────────────┐
│ Push to main                                            │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ Release Please                                          │
│ - Analyze commits                                       │
│ - Calculate version bump                                │
│ - Create/update release PR                              │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ Merge Release PR                                        │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ├─────────────────┬────────────────────┐
                  ▼                 ▼                    ▼
         ┌────────────────┐ ┌──────────────┐  ┌─────────────────┐
         │ Create Release │ │ NPM Publish  │  │ Docker Publish  │
         │ & Git Tag      │ │ - Build pkgs │  │ - Build images  │
         │                │ │ - Publish    │  │ - Push to Hub   │
         └────────────────┘ └──────────────┘  │ - Push to GHCR  │
                                               └─────────────────┘
```

## References

- [Release Please Documentation](https://github.com/googleapis/release-please)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [Docker Build Push Action](https://github.com/docker/build-push-action)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
