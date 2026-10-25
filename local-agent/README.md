# Local Computer Agent — Phases 1–3

A local API that lists/creates files in a **sandboxed workspace** and runs **approved commands**.
Optional `/agent` endpoint lets Claude plan and execute tool calls from a plain-English instruction.

## Run
First time only (Phase 2): `npx playwright install chromium`
```bash
npm install
cp .env.example .env     # set AGENT_TOKEN (long random string); optionally ANTHROPIC_API_KEY
npm start                # http://127.0.0.1:8787
```
Requires Node 20+. Python 3 on PATH for the demo.

## Goal demo: "Create a folder, add a Python file, run it, show the result"
```bash
H="Authorization: Bearer $AGENT_TOKEN"; U=http://127.0.0.1:8787
curl -H "$H" -H 'Content-Type: application/json' -d '{"path":"demo","type":"dir"}' $U/files
curl -H "$H" -H 'Content-Type: application/json' -d '{"path":"demo/hello.py","content":"print(\"hi\")"}' $U/files
curl -H "$H" -H 'Content-Type: application/json' -d '{"command":"python3 hello.py","cwd":"demo"}' $U/run
```
Or in one shot (needs ANTHROPIC_API_KEY):
```bash
curl -H "$H" -H 'Content-Type: application/json' \
  -d '{"instruction":"Create a folder demo, add hello.py that prints the sum of 1..10, run it, show me the result"}' $U/agent
```

## API
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | status |
| GET | `/files?path=` | list directory |
| GET | `/files/read?path=` | read a text file |
| POST | `/files` `{path,type:"file"\|"dir",content}` | create file/folder |
| POST | `/run` `{command,cwd}` | run command (202 + `approvalId` if not allowlisted) |
| GET | `/approvals` | pending commands |
| POST | `/approvals/:id/approve` or `/deny` | human decision |
| POST | `/agent` `{instruction}` | natural-language task via Claude |

## Phase 2: browser control
Goal demo (server running, token exported):
```bash
AGENT_TOKEN=... node scripts/demo-form.mjs     # BROWSER_HEADLESS=false in .env to watch it
```
Or: `{"instruction":"Open http://127.0.0.1:8787/demo/form, fill it with test data, submit, and tell me the result"}` to `/agent`.

| Method | Path | Body |
|---|---|---|
| POST | `/browser/open` | `{url}` |
| GET | `/browser/inspect` | visible text + elements/selectors |
| POST | `/browser/click` | `{target}` (Playwright selector, e.g. `#submit`, `text="Sign in"`) |
| POST | `/browser/fill` / `/select` | `{target,value}` |
| POST | `/browser/press` | `{key}` |
| POST | `/browser/screenshot` | `{name}` → saved in `workspace/screenshots/` |
| POST | `/browser/close` | |

Browser safety: http(s) only; optional `BROWSER_ALLOWED_DOMAINS` allowlist re-checked on every navigation/redirect; one session, auto-closed after 5 min idle; agent is told never to enter real credentials/payment data.
Desktop automation (non-browser apps) is not included yet.

## Phase 3: voice
Open **http://127.0.0.1:8787/voice** in Chrome or Edge, paste your `AGENT_TOKEN`, pick a language, click *Start listening*.
- "Open Chrome" / "launch VS Code" → handled instantly (no API key needed). Allowed apps: chrome, firefox, edge, vscode, terminal, calculator, notepad, files (`GET /apps`).
- Anything else → sent to `/agent` (needs `ANTHROPIC_API_KEY`), and the reply is spoken back.
- **Interrupt:** say "stop" / "cancel" / "quiet", or press *Stop*. This silences speech *and* aborts the in-flight request, so the agent stops before its next step. (A command already running finishes or hits its 30s timeout.)
- While the agent is speaking, only stop-words are acted on, so it won't obey its own voice.
- Commands needing approval show up in the page with Approve / Deny buttons — approvals are never voice-activated.
- Privacy: Chrome/Edge send mic audio to their vendor's speech service. A fully offline engine (e.g. Whisper) can replace it later.

## Safety model
- Binds to `127.0.0.1` only; bearer token required on every request.
- All paths resolved inside `WORKSPACE_DIR`; `../` and symlink escapes blocked.
- Commands run with **no shell** (so `;`, `&&`, `|` are inert), 30s timeout, 64 KB output cap.
- Only `AUTO_APPROVE` programs run immediately; everything else waits for explicit approval.
- Note: an allowlisted program like `python3` can still run arbitrary code inside the workspace. Keep the allowlist tight, and for stronger isolation run the server in Docker.

## Roadmap
Phase 4 Gmail/WhatsApp (draft + confirm) → 5 Autonomous planner with task history.
