# Badson AI Code Editor

A modern, AI-powered code editor built for web development. Write HTML, CSS, and JavaScript with live preview and an intelligent AI assistant that can read and edit your files.

![Badson Logo](public/images/badson-logo.png)

## Features

- **Monaco Editor** — The same powerful editor that powers VS Code
- **Multi-file workspace** — Tabs, file explorer, create/delete files & folders
- **Live Preview** — Instant preview of your HTML/CSS/JS
- **AI Coding Assistant** — Chat with context of your project files
  - Supports **OpenRouter**, **Groq**, and **Gemini**
  - AI can suggest and apply edits to your files
- **Modern dark UI** — Clean, focused interface
- **Local + Deployed** — Works locally and on Render

## Quick Start (Local)

### Prerequisites
- Node.js 18+
- npm 9+

### 1. Install dependencies

```bash
npm install
```

This also installs backend dependencies automatically.

### 2. Configure API keys (optional but recommended)

Create `backend/.env`:

```env
PORT=5002
JWT_SECRET=dev-secret-change-me
OPENROUTER_API_KEY=your_key_here
GROQ_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
FRONTEND_URL=http://localhost:3000
```

You only need **one** provider key for AI to work.

### 3. Run the app

**Terminal 1 — Backend**
```bash
npm run server:dev
```

**Terminal 2 — Frontend**
```bash
npm run dev
```

Open **http://localhost:3000**

> AI endpoints are public (no login required for basic chat). Auth is only needed for uploads/projects.

## Production (Render)

The repo includes a `render.yaml` for easy deployment:

- `badlson-backend` — Node API
- `badlson-frontend` — Static site

Set the environment variables in the Render dashboard:
- `OPENROUTER_API_KEY` / `GROQ_API_KEY` / `GEMINI_API_KEY`
- `FRONTEND_URL` = your frontend URL
- `VITE_API_URL` = your backend URL (without `/api` suffix)

## Tech Stack

| Layer     | Tech                                      |
|-----------|-------------------------------------------|
| Frontend  | React 19, TypeScript, Vite, Tailwind, Monaco |
| State     | Zustand                                   |
| Backend   | Express 5, Node.js                        |
| AI        | OpenRouter · Groq · Gemini                |

## Project Structure

```
├── src/                  # Frontend React app
│   ├── components/       # UI components
│   ├── Editor/           # Monaco editor + tabs
│   ├── ai/               # AI client & config
│   ├── store/            # Zustand stores
│   └── ...
├── backend/              # Express API
│   ├── routes/
│   ├── services/         # AI providers
│   └── server.mjs
├── public/
└── render.yaml
```

## License

MIT

---

Made with ❤️ for developers who want a smarter way to code.
