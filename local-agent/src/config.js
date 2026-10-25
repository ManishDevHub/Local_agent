import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';

export const config = {
  workspace: path.resolve(process.env.WORKSPACE_DIR || './workspace'),
  token: process.env.AGENT_TOKEN || '',
  port: Number(process.env.PORT || 8787),
  model: process.env.AGENT_MODEL || 'claude-sonnet-5-5',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  autoApprove: new Set(
    (process.env.AUTO_APPROVE || 'python3,python,node,npm,npx,pip,pip3,ls,cat,echo,pwd,git,mkdir,touch')
      .split(',').map(s => s.trim()).filter(Boolean)
  ),
  timeoutMs: Number(process.env.COMMAND_TIMEOUT_MS || 30000),
  browserHeadless: process.env.BROWSER_HEADLESS !== 'false',
  browserAllowedDomains: (process.env.BROWSER_ALLOWED_DOMAINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  maxOutputBytes: 64 * 1024,
  maxFileBytes: 1024 * 1024,
};

fs.mkdirSync(config.workspace, { recursive: true });
