# Ollama Chat UI

A clean, ChatGPT-like web interface for your locally running [Ollama](https://ollama.com) instance — built with pure HTML, CSS, and JavaScript. No frameworks, no dependencies, no data leaves your machine.

---

## Features

- **Streaming responses** — token-by-token output with a live blinking cursor
- **Model selector** — auto-fetches all locally installed Ollama models
- **Conversation history** — persisted in `localStorage`, survives page refreshes
- **Markdown rendering** — headings, bold, italic, lists, blockquotes, tables, code blocks
- **Code copy button** — one-click copy on every code block
- **Stop generation** — abort a response mid-stream
- **Suggestion cards** — quick-start prompts on the welcome screen
- **Responsive UI** — collapsible sidebar, full mobile support
- **Connection status** — live green/red indicator for Ollama availability
- **Dark theme** — premium indigo/violet design, no light mode flicker

---

## Quick Start

### 1. Prerequisites

- [Ollama](https://ollama.com) installed and at least one model pulled:
  ```bash
  ollama pull deepseek-r1:8b   # or any model you prefer
  ```

### 2. Start Ollama

```bash
ollama serve
```

### 3. Serve the UI

```bash
cd Local_Ollama_UI
python3 -m http.server 8080
```

### 4. Open in browser

```
http://localhost:8080
```

> **Why a local server?** Browsers block requests from `file://` pages to localhost due to CORS — the `null` origin isn't trusted. Serving over `http://localhost` works with Ollama's default CORS policy out of the box.

---

## Project Structure

```
Local_Ollama_UI/
├── index.html   # Layout — sidebar, chat area, input
├── style.css    # Dark theme, animations, responsive design
└── app.js       # Ollama API, streaming, markdown, persistence
```

---

## Configuration

By default the UI connects to `http://localhost:11434`. If you run Ollama on a different host/port, edit the top of `app.js`:

```js
const OLLAMA_BASE = 'http://localhost:11434';
```

---

## Privacy

Everything runs locally. No analytics, no telemetry, no external requests. Your conversations are stored only in your browser's `localStorage`.

---

## License

MIT