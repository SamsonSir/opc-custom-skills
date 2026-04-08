# Claude Code with Third-Party API

Configure Claude Code to work with third-party API endpoints (e.g., API proxies, aggregators) instead of official Anthropic authentication.

## When to Use

- User wants to use Claude Code with a third-party API key
- User has an API proxy or aggregator service
- User needs to bypass official Claude authentication
- Keywords: "claude code", "third-party api", "api proxy", "custom endpoint"

## Problem

Claude Code (`@anthropic-ai/claude-code`) by default requires:
1. Official Claude Pro/Team subscription
2. OAuth login via `claude auth login`
3. Cannot use custom API endpoints directly

## Solution

Use a three-step approach to configure Claude Code with third-party APIs:

### Step 1: Clean Environment Variables

Remove `ANTHROPIC_API_KEY` from environment to avoid auth conflicts, keep only `ANTHROPIC_BASE_URL`:

```bash
# Edit ~/.bashrc
sed -i '/export ANTHROPIC_API_KEY=/d' ~/.bashrc

# Keep only BASE_URL
grep "export ANTHROPIC_BASE_URL=" ~/.bashrc || \
  echo 'export ANTHROPIC_BASE_URL="https://your-api-proxy.com"' >> ~/.bashrc

# Apply changes
source ~/.bashrc
unset ANTHROPIC_API_KEY
```

### Step 2: Fake "Logged In" State

Create a config file to bypass onboarding:

```bash
echo '{"hasCompletedOnboarding": true}' > ~/.claude.json
```

### Step 3: Inject API Key Helper

Use the `apiKeyHelper` backdoor configuration (originally for enterprise dynamic token retrieval):

```bash
mkdir -p ~/.claude
echo '{"apiKeyHelper": "echo YOUR_API_KEY_HERE"}' > ~/.claude/settings.json
```

Replace `YOUR_API_KEY_HERE` with your actual third-party API key.

## Verification

Test the configuration:

```bash
# Check environment
bash -i -c 'echo "ANTHROPIC_BASE_URL=$ANTHROPIC_BASE_URL"'

# Test Claude Code
claude --print "Test: 1+1=?"
```

Expected output: Claude Code should respond without asking for login.

## Configuration Files

After setup, you should have:

1. **~/.bashrc**: Contains `ANTHROPIC_BASE_URL` only
2. **~/.claude.json**: `{"hasCompletedOnboarding": true}`
3. **~/.claude/settings.json**: `{"apiKeyHelper": "echo YOUR_KEY"}`

## Troubleshooting

### "Not logged in" error
- Verify `~/.claude.json` exists
- Check `~/.claude/settings.json` has correct apiKeyHelper

### "Invalid API key" error
- Verify apiKeyHelper command works: `bash -c 'echo YOUR_KEY'`
- Check ANTHROPIC_BASE_URL is set correctly
- Ensure API key is valid for the proxy service

### "Auth conflict" error
- Make sure ANTHROPIC_API_KEY is NOT in environment
- Run: `unset ANTHROPIC_API_KEY`

## Important Notes

1. **Installation**: Install via `npm install -g @anthropic-ai/claude-code`
2. **Command**: Use `claude` (not `claude-code`)
3. **Shell**: Configuration works in interactive shells (bash -i)
4. **Security**: Keep your API key secure, don't commit to git

## Example: Complete Setup

```bash
# 1. Install
npm install -g @anthropic-ai/claude-code

# 2. Configure environment
cat >> ~/.bashrc << 'EOF'

# Claude Code Third-Party API
export ANTHROPIC_BASE_URL="https://www.packyapi.com"
EOF
source ~/.bashrc

# 3. Fake login state
echo '{"hasCompletedOnboarding": true}' > ~/.claude.json

# 4. Inject API key helper
mkdir -p ~/.claude
echo '{"apiKeyHelper": "echo sk-YOUR-API-KEY-HERE"}' > ~/.claude/settings.json

# 5. Test
claude --print "Hello, test message"
```

## References

- Claude Code npm: `@anthropic-ai/claude-code`
- Official docs: https://code.claude.com/docs
- apiKeyHelper: Enterprise feature for dynamic token retrieval
