# AI Chat

A full-stack AI chat application with an Express backend, a vanilla-JS frontend,
and optional voice input/output. The backend proxies chat through OpenRouter,
generates images through Replicate, and exposes a small code-agent API.

Everything in this file is verified against the repository source.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Starting the server](#starting-the-server)
- [Environment variables](#environment-variables)
- [Authentication](#authentication)
- [Testing](#testing)
- [Project structure](#project-structure)
- [API overview](#api-overview)
- [Voice features](#voice-features)
- [Security notes](#security-notes)
- [Development notes](#development-notes)
- [Known limitations and dormant features](#known-limitations-and-dormant-features)

## Overview

The app is a single-page chat client (`index.html` + `js/`) served by an Express
server (`server/server.js`). The browser talks only to this server; provider API
keys never reach the client.

The server-side code agent (`agent/codeAgent.js`, exposed through `/codex`)
can parse natural-language tasks and perform sandboxed file operations inside the
project directory.

## Features

Verified working features:

- **AI chat** with streaming (SSE) and non-streaming responses via OpenRouter
  (`POST /api/chat`). The default model is `openai/gpt-4o-mini`.
- **Bilingual chat behavior**: the system prompt instructs the assistant to reply
  in the language of the user's latest message (English, Urdu script, Hindi, or
  Pakistani Roman Urdu).
- **Markdown rendering and code blocks** for assistant replies
  (`js/markdown.js`, `js/codeblock.js`).
- **Conversation history** stored in the browser's `localStorage`
  (`ai_chat_chats`, `ai_chat_current_chat`), with a sidebar listing past chats.
- **Settings** (theme, language, sound, font size, animations, auto-scroll,
  send-with-enter) persisted in `localStorage` under `ai_chat_settings`.
- **Image generation** through Replicate (`POST /generate-image`) using the
  `black-forest-labs/flux-schnell` model.
- **Voice input** (speech-to-text into the composer) via the browser
  `SpeechRecognition` API.
- **Voice output** (text-to-speech) via the browser `speechSynthesis` API.
- **Voice settings UI** (provider, language, rate, pitch, volume, streaming,
  roman-Urdu fallback) persisted in `localStorage` under `voice-settings`.
- **Authentication** with a token password and HttpOnly session cookies.
- **Health check** endpoint at `GET /api/health`.

## Requirements

- Node.js with ES module support. The server uses Express 5,
  which requires Node.js 18 or newer. This repository was verified on
  **Node v22.23.2**.
- npm (for installing dependencies).
- API keys:
  - `OPENROUTER_API_KEY` — required for AI chat.
  - `REPLICATE_API_KEY` — required for image generation.

No build step is required; the frontend is plain JavaScript and CSS served
directly by the Express server.

## Installation

```bash
npm install
```

This installs the runtime dependencies declared in `package.json`
(`express`, `cors`, `dotenv`).

Then create the environment file from the template:

```bash
cp .env.example server/.env
```

Open `server/.env` and fill in at least `OPENROUTER_API_KEY`, `REPLICATE_API_KEY`
(if you want image generation), and `SERVER_API_TOKEN`.

> The server loads `.env` from the `server/` directory
> (`dotenv.config({ path: path.join(__dirname, ".env") })`), so the copied file
> **must** live at `server/.env`, not the repository root.

## Starting the server

```bash
npm start
```

or equivalently:

```bash
node server/server.js
```

By default the server binds `0.0.0.0:3000` (both overridable — see the
environment variables below). On success it prints:

```
AI Chat Server running on http://<HOST>:<PORT>
```

Open `http://localhost:3000` (or the bound host/port) in a browser.

## Environment variables

Loaded by the server from `server/.env` (see `.env.example` for the documented
template). All are optional at boot except the provider keys:

| Variable | Purpose | Default |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Key for the AI chat proxy (OpenRouter). Chat returns 503 without it. | _unset_ |
| `REPLICATE_API_KEY` | Key for image generation (Replicate). Image endpoints return 503 without it. | _unset_ |
| `PORT` | TCP port to bind. `"0"` binds an ephemeral OS-assigned port. | `3000` |
| `HOST` | Network interface to bind. `0.0.0.0` is chosen so externally reachable hosting platforms work out of the box. | `0.0.0.0` |
| `SERVER_API_TOKEN` | API token (password) required by protected endpoints. See [Authentication](#authentication). | _unset_ |
| `NODE_ENV` | `production` or `prod` switches on production auth behavior. | `development` |
| `ALLOW_NO_AUTH` | `true` enables the local-development no-auth mode. See [Authentication](#authentication). | _unset_ |
| `CORS_ORIGIN` | Comma-separated allowlist of browser origins allowed to call the API cross-origin. Empty = same-origin only. | _unset_ (same-origin) |

## Authentication

Authentication **fails closed**. The policy is resolved in
`server/authPolicy.js` and enforced by `server/authMiddleware.js`:

- A configured `SERVER_API_TOKEN` is **always** enforced. The `ALLOW_NO_AUTH`
  flag is ignored whenever a token is present.
- Local development "no auth" mode (`ALLOW_NO_AUTH=true`) only applies when
  **all** of the following hold:
  - `NODE_ENV` is not `production`/`prod`, and
  - `ALLOW_NO_AUTH` is exactly `true`, and
  - no `SERVER_API_TOKEN` is configured.
- Production with a missing token fails safely: protected endpoints return
  `503` until a token is configured — they never become public.

Browser flow (`js/auth.js`):

1. The client POSTs the password to `/api/login`.
2. The server verifies it with a timing-safe comparison
   (`crypto.timingSafeEqual`).
3. On success it sets an **HttpOnly**, `Secure`, `SameSite=Strict` session cookie
   (`ai_chat_session`) valid for 8 hours.
4. The token/providers keys are never exposed to JavaScript, HTML, or
   `localStorage`. The client only ever holds the session cookie.
5. `GET /api/session` reports `{ authenticated: boolean }` (in no-auth dev mode
   it always reports `true` so the login overlay does not block local work).
6. `POST /api/logout` invalidates the session and clears the cookie.

Note: the session cookie uses `Secure`, so it is only sent over HTTPS. For local
development without a token, `ALLOW_NO_AUTH=true` is the supported path.

## Testing

```bash
npm test
```

`npm test` runs `tests/testRunner.js`, which executes every real assertion-based
test in `tests/` as a child process and enforces its exit code. Any non-zero exit,
crash, or uncaught error aborts the run with a non-zero code.

Current verified result:

```
REAL TESTS: 51 passed, 0 failed
```

The suite covers server config, auth policy/middleware/session, static path
guards, streaming chat, the `/codex` handler, file operations, diffing, patching,
backups, the project indexer/dependency analyzer, runtime path independence,
and the voice pipeline (input, settings, TTS, composer integration).

## Project structure

```
ai-chat/
├── index.html          # Frontend entry point
├── package.json        # Runtime dependencies + start/test scripts
├── .env.example        # Documented environment variable template
├── css/                # Frontend stylesheets
├── js/                 # Frontend modules (chat, ui, voice, api, ...)
│   ├── index.html loads js/main.js
│   ├── main.js         # App bootstrap + auth init
│   ├── app.js          # Application controller / wiring hub
│   ├── chat.js         # Chat manager (messages, history)
│   ├── api.js          # Backend API client (JSON + SSE streaming)
│   ├── voice*.js       # TTS output, voice settings UI, voice input
│   └── ...
├── server/             # Express backend
│   ├── server.js       # App entry point, routes, middleware
│   ├── serverConfig.js # PORT / HOST / CORS_ORIGIN resolution
│   ├── authPolicy.js   # Auth policy resolver (fails closed)
│   ├── authMiddleware.js
│   ├── sessionAuth.js  # Session cookie store + timing-safe compare
│   ├── staticGuard.js  # Static asset path allowlist
│   ├── pathGuard.js    # Sensitive-file path checks
│   ├── streamChat.js   # SSE streaming proxy for /api/chat
│   ├── codexHandler.js # /codex request handling
│   └── upstreamErrors.js
├── agent/              # Code agent (file ops, diffing, planning, indexing)
├── core/               # Memory + session managers (agent-side)
├── filesystem/         # File/project scanners
├── editor/             # Code editing helpers (agent-side)
├── terminal/           # Terminal helpers (agent-side)
├── memory/             # Memory JSON fixtures (see Known limitations)
└── tests/              # Assertion-based tests + runner
```

## API overview

All endpoints are defined in `server/server.js`. Protected endpoints require a
valid session cookie (browser) or `Authorization: Bearer <SERVER_API_TOKEN>`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | no | Server status |
| `GET` | `/api/session` | no | `{ authenticated }` check |
| `POST` | `/api/login` | no | Exchange password for a session cookie |
| `POST` | `/api/logout` | no | Destroy the session |
| `POST` | `/api/chat` | yes | Chat proxy (JSON, or SSE when `stream: true`) |
| `POST` | `/codex` | yes | Code agent task / file operation |
| `GET` | `/file?path=...` | yes | Read a project file (guarded) |
| `POST` | `/codex/analyze-file` | yes | Analyze a project file (guarded) |
| `POST` | `/generate-image` | yes | Start a Replicate image prediction |
| `GET` | `/generate-image/:id` | yes | Poll a Replicate prediction |

Static assets are served from the repository root, but only through an allowlist
(`/`, `/index.html`, `/css/<file>`, `/js/<file>`) enforced by `staticGuard.js`.
Encoded characters and paths outside that allowlist are rejected.

## Voice features

All voice functionality runs in the browser; there is no voice backend.

- **Speech-to-text (input)**: `js/voice-input.js` wraps the browser
  `SpeechRecognition` API. The mic button in the composer inserts recognized
  text into the input without auto-sending. The mic button is disabled when the
  browser does not support `SpeechRecognition`.
- **Text-to-speech (output)**: `js/voice.js` splits assistant replies into chunks
  and plays them through `speechSynthesis` (`js/voicePlayer.js`, queue in
  `js/voiceQueue.js`). Language detection (`js/languageDetector.js`) picks the
  output language.
- **Voice settings UI**: `js/voiceUI.js` provides a settings modal (provider,
  language, rate, pitch, volume, streaming, roman-Urdu fallback) opened from the
  speaker toggle in the header. Changes are saved to `localStorage` and applied
  to the next playback.

Because `SpeechRecognition` only exists in secure contexts, voice input requires
the page to be served over HTTPS in production.

## Security notes

All of the following are implemented in the source:

- **Fails-closed authentication** — protected routes are never public when a
  token is missing; see [Authentication](#authentication).
- **Secrets stay server-side** — `SERVER_API_TOKEN`, `OPENROUTER_API_KEY`, and
  `REPLICATE_API_KEY` are never sent to the browser. The client sends only the
  HttpOnly session cookie.
- **Provider errors are sanitized** (`server/upstreamErrors.js`,
  `js/api.js`) — raw provider internals, keys, and stack traces are never
  forwarded to the client.
- **Security headers** — `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a strict
  `Content-Security-Policy` are set on every response.
- **Path guards** — `/file` and `/codex/analyze-file` reject path traversal and
  sensitive paths (`server/pathGuard.js`); static files are served through a
  decode-free allowlist (`server/staticGuard.js`).
- **Rate limiting** — in-memory per-IP, per-route limits on session, chat,
  codex, file, and image endpoints.
- **CORS** — by default no cross-origin browser can call the API; only origins
  listed in `CORS_ORIGIN` are allowed.

## Development notes

- The project uses ES modules everywhere (`"type": "module"` in
  `package.json`).
- No linter is configured in the run scripts (`eslint.config.js` exists but
  ESLint is not installed); no lint task exists.
- Runtime data directories (`backups/`, `sessions/`, `memory.json`, `memory/`)
  are produced at runtime and are not part of the shipped application.
- The code agent (`agent/`) was audited so its default paths resolve relative
  to the module location, not the caller's working directory.

## Known limitations and dormant features

The following are present in the source but are **not** currently wired up or
reachable. Do not rely on them as working features:

- **Voice commands** (`js/voiceCommands.js`) — the `VoiceCommands` instance is
  created inside `js/voice.js`, but its `.handle()` method is **never called**,
  so the command events it emits (`voice:stop`, `voice:pause`, `voice:resume`,
  `voice:repeat`, `voice:settings`, `chat:new`, `chat:clear`) never fire through
  a live path. The working voice features are the input/output/settings ones
  listed above.
- **Dormant speech recognition inside `js/voice.js`** — `setupSpeechRecognition()`
  creates a second `SpeechRecognition` instance inside the TTS manager and emits
  `voice:start/text/error/end` events that have no listeners. The live mic
  pipeline is `js/voice-input.js`, not this code path.
- **Chat clear / regenerate** — `chat.clearChat()` (and the `chat:cleared`
  event) and `chat.regenerate()` (and the `ai:regenerate` event) in
  `js/chat.js` have no callers and no UI. There is no regenerate button.
- **Video generation** — `js/videoGenerator.js` references a `/generate-video`
  endpoint that does **not** exist in `server/server.js`, and it is not imported
  by the app. Video generation is not a working feature.
- **Semantic memory** — the app's chat feature does not use semantic memory.
  `agent/memoryRetriever.js` exists as an internal component of the code agent,
  but there is no user-facing semantic-memory feature.