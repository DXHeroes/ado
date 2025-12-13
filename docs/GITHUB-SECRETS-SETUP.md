# GitHub Secrets Setup Guide

Quick guide for setting up GitHub secrets required for the release workflow.

## Required Secrets

The release workflow requires three secrets:

1. **NPM_TOKEN** - For publishing packages to npm registry
2. **DOCKER_USERNAME** - Docker Hub username
3. **DOCKER_PASSWORD** - Docker Hub access token

## Step-by-Step Setup

### 1. NPM Token

#### Create Token

1. Go to [npmjs.com](https://www.npmjs.com/) and log in
2. Click your profile icon → **Access Tokens**
3. Click **Generate New Token** → **Classic Token**
4. Select **Automation** type
5. Copy the token (starts with `npm_...`)

#### Add to GitHub

```bash
# Via GitHub CLI
gh secret set NPM_TOKEN

# Paste your token when prompted
```

Or via web UI:
1. Go to repository → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `NPM_TOKEN`
4. Value: `npm_xxxxxxxxxxxxxxxxxxxxx`
5. Click **Add secret**

### 2. Docker Hub Username

This is simply your Docker Hub username (not email).

```bash
# Via GitHub CLI
gh secret set DOCKER_USERNAME --body "your-dockerhub-username"
```

Or via web UI:
1. Repository → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `DOCKER_USERNAME`
4. Value: `your-dockerhub-username`
5. Click **Add secret**

### 3. Docker Hub Access Token

#### Create Token

1. Go to [hub.docker.com](https://hub.docker.com/) and log in
2. Click your username → **Account Settings**
3. Go to **Security** tab
4. Click **New Access Token**
5. Description: `GitHub Actions ADO Release`
6. Access permissions: **Read, Write, Delete**
7. Click **Generate**
8. Copy the token (starts with `dckr_pat_...`)

⚠️ **Important**: Save this token immediately - you won't be able to see it again!

#### Add to GitHub

```bash
# Via GitHub CLI
gh secret set DOCKER_PASSWORD

# Paste your token when prompted
```

Or via web UI:
1. Repository → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `DOCKER_PASSWORD`
4. Value: `dckr_pat_xxxxxxxxxxxxxxxxxxxxx`
5. Click **Add secret**

## Verify Setup

### Check Secrets

```bash
# Via GitHub CLI
gh secret list

# Should show:
# NPM_TOKEN         Updated YYYY-MM-DD
# DOCKER_USERNAME   Updated YYYY-MM-DD
# DOCKER_PASSWORD   Updated YYYY-MM-DD
```

Or via web UI:
1. Repository → **Settings** → **Secrets and variables** → **Actions**
2. You should see all three secrets listed

### Test Workflow

1. Create a test commit:
   ```bash
   git checkout -b test-release-workflow
   echo "# Test" >> README.md
   git add README.md
   git commit -m "feat: test release workflow"
   git push origin test-release-workflow
   ```

2. Create a PR and merge to `main`

3. Check workflow run:
   - Go to **Actions** tab
   - Look for "Release Please" workflow
   - It should create a release PR

4. Merge the release PR to trigger publishing

## Troubleshooting

### NPM_TOKEN Invalid

**Error**: `401 Unauthorized`

**Solution**:
1. Verify token type is **Automation** (not Publish)
2. Check token hasn't expired
3. Regenerate token if needed
4. Update secret in GitHub

### Docker Login Failed

**Error**: `Error: Cannot perform an interactive login from a non TTY device`

**Solution**:
- Make sure you're using an **access token**, not your Docker Hub password
- Token should start with `dckr_pat_`
- Check username is correct (not email)

### Permission Denied

**Error**: `denied: requested access to the resource is denied`

**Solution**:
1. Verify `DOCKER_USERNAME` matches your Docker Hub username exactly
2. Check access token has **Write** permissions
3. Verify you have access to the `dxheroes` organization on Docker Hub
4. If using personal account, images should be `yourusername/ado` not `dxheroes/ado`

### Secret Not Found

**Error**: `secret not found: NPM_TOKEN`

**Solution**:
1. Verify secret name is exactly `NPM_TOKEN` (case-sensitive)
2. Make sure secret is at repository level, not environment level
3. Check you have admin access to the repository

## Security Best Practices

### 1. Token Scope

- ✅ Use **Automation** token for npm (not Publish)
- ✅ Use **Access Token** for Docker Hub (not password)
- ✅ Limit token permissions to minimum required

### 2. Token Rotation

Rotate tokens regularly:

```bash
# Every 90 days recommended
# 1. Generate new token
# 2. Update GitHub secret
gh secret set NPM_TOKEN
# 3. Revoke old token
```

### 3. Monitor Usage

- Check npm token usage: [npmjs.com](https://www.npmjs.com/settings/tokens)
- Check Docker Hub token usage: [hub.docker.com/settings/security](https://hub.docker.com/settings/security)
- Review GitHub Actions logs for suspicious activity

### 4. Least Privilege

- Don't share tokens across projects
- Use organization-level tokens only when necessary
- Prefer repository-level secrets over organization-level

### 5. Audit Trail

GitHub automatically logs:
- When secrets are added/modified
- When workflows access secrets
- Who made changes

View audit log:
```bash
# Via GitHub CLI
gh api /repos/{owner}/{repo}/actions/secrets/{secret_name}

# Or via web UI
# Settings → Actions → Secrets → Click secret name
```

## Alternative: Organization Secrets

For multiple repositories:

1. Go to Organization → **Settings** → **Secrets and variables** → **Actions**
2. Add secrets at organization level
3. Select which repositories can access them

Benefits:
- Centralized management
- Easier token rotation
- Consistent across repos

Drawbacks:
- Broader access scope
- Requires organization admin permissions

## Verification Checklist

Before merging to main:

- [ ] All three secrets are set in repository settings
- [ ] NPM token is **Automation** type
- [ ] Docker Hub token has **Read, Write, Delete** permissions
- [ ] Docker Hub username matches organization/user
- [ ] Test workflow runs successfully on test branch
- [ ] No credentials are committed in code
- [ ] `.env` files are in `.gitignore`

## Quick Reference

| Secret | Type | Where to Get | Format |
|--------|------|--------------|--------|
| NPM_TOKEN | Automation token | [npmjs.com/settings/tokens](https://www.npmjs.com/settings/tokens) | `npm_...` |
| DOCKER_USERNAME | Username | Your Docker Hub username | Plain text |
| DOCKER_PASSWORD | Access token | [hub.docker.com/settings/security](https://hub.docker.com/settings/security) | `dckr_pat_...` |

## Support

If you encounter issues:

1. Check [Release Workflow](./RELEASE-WORKFLOW.md) documentation
2. Review GitHub Actions logs for detailed error messages
3. Verify tokens haven't expired
4. Test credentials locally:
   ```bash
   # Test npm login
   npm login

   # Test Docker Hub login
   echo $DOCKER_PASSWORD | docker login -u $DOCKER_USERNAME --password-stdin
   ```

## Additional Resources

- [GitHub Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [npm Tokens](https://docs.npmjs.com/creating-and-viewing-access-tokens)
- [Docker Hub Access Tokens](https://docs.docker.com/docker-hub/access-tokens/)
- [GitHub CLI Secrets](https://cli.github.com/manual/gh_secret)
