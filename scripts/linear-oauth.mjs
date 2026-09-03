#!/usr/bin/env node
// One-time helper: run the Linear OAuth2 authorization-code flow on localhost
// and print a long-lived access token to paste into:
//   npx wrangler pages secret put LINEAR_TOKEN
//
// Prerequisites — create a Linear OAuth application first
// (Linear → Settings → API → OAuth applications):
//   • Redirect URI:  http://localhost:8788/callback
//   • Scope:         read
// then note its Client ID and Client Secret.
//
// Usage:
//   LINEAR_CLIENT_ID=xxx LINEAR_CLIENT_SECRET=yyy npm run linear:auth
//   (or run with no env and answer the prompts)
//
// Flags:
//   --actor=application   (default) token acts as the app; needs workspace admin
//   --actor=user          token acts as you
//   --port=8788           local callback port (must match the redirect URI)

import http from 'node:http';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn } from 'node:child_process';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=?(.*)$/);
    return m ? [m[1], m[2] || true] : [a, true];
  }),
);

const PORT = Number(args.port || process.env.LINEAR_OAUTH_PORT || 8788);
const ACTOR = args.actor === 'user' ? 'user' : 'application';
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const AUTHORIZE_URL = 'https://linear.app/oauth/authorize';
const TOKEN_URL = 'https://api.linear.app/oauth/token';
const SCOPE = 'read';

async function prompt(question, fallback) {
  if (fallback) return fallback;
  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question(question)).trim();
    return answer;
  } finally {
    rl.close();
  }
}

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const cmdArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* fall back to manual open */
  }
}

const clientId = await prompt('Linear OAuth Client ID: ', process.env.LINEAR_CLIENT_ID);
const clientSecret = await prompt(
  'Linear OAuth Client Secret: ',
  process.env.LINEAR_CLIENT_SECRET,
);
if (!clientId || !clientSecret) {
  console.error('Client ID and Client Secret are both required.');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');
const authUrl = new URL(AUTHORIZE_URL);
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: SCOPE,
  state,
  actor: ACTOR,
  prompt: 'consent',
}).toString();

const token = await new Promise((resolve, reject) => {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname !== '/callback') {
      res.writeHead(404).end('Not found');
      return;
    }
    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    const finish = (msg, statusCode = 200) => {
      res.writeHead(statusCode, { 'content-type': 'text/html' });
      res.end(`<!doctype html><meta charset=utf-8><body style="font:15px system-ui;padding:40px">${msg}</body>`);
      server.close();
    };

    if (error) {
      finish(`Authorization failed: <b>${error}</b>. You can close this tab.`, 400);
      reject(new Error(`Authorization error: ${error}`));
      return;
    }
    if (!code || returnedState !== state) {
      finish('State mismatch or missing code. You can close this tab.', 400);
      reject(new Error('State mismatch or missing authorization code.'));
      return;
    }

    try {
      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });
      const body = await tokenRes.json();
      if (!tokenRes.ok || !body.access_token) {
        finish(`Token exchange failed (${tokenRes.status}). You can close this tab.`, 400);
        reject(new Error(`Token exchange failed: ${JSON.stringify(body)}`));
        return;
      }
      finish('Got the token. You can close this tab and return to the terminal.');
      resolve(body);
    } catch (e) {
      finish('Token exchange threw. You can close this tab.', 500);
      reject(e);
    }
  });

  server.listen(PORT, () => {
    console.log(`\nOpening Linear authorization (actor=${ACTOR})…`);
    console.log(`If your browser doesn't open, visit:\n${authUrl}\n`);
    openBrowser(authUrl.toString());
  });
});

console.log('\n─────────────────────────────────────────────');
console.log('LINEAR_TOKEN (access_token):\n');
console.log(token.access_token);
console.log('\nscope:', token.scope, '| token_type:', token.token_type);
if (token.expires_in) {
  console.log('expires_in:', token.expires_in, 'seconds');
} else {
  console.log('(no expiry returned — long-lived)');
}
console.log('\nSet it with:\n  npx wrangler pages secret put LINEAR_TOKEN');
console.log('─────────────────────────────────────────────\n');
