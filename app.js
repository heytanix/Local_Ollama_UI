/* ===================================================
   Ollama Chat UI — app.js
   Connects to Ollama API (http://localhost:11434)
   Features: model selector, streaming, conversation history,
   markdown rendering, code copy, localStorage persistence
=================================================== */

const OLLAMA_BASE = 'http://localhost:11434';

// ── DOM refs ──
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const newChatBtn = document.getElementById('newChatBtn');
const modelSelect = document.getElementById('modelSelect');
const refreshModels = document.getElementById('refreshModels');
const conversationList = document.getElementById('conversationList');
const chatContainer = document.getElementById('chatContainer');
const welcomeScreen = document.getElementById('welcomeScreen');
const messagesWrapper = document.getElementById('messagesWrapper');
const messages = document.getElementById('messages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const topbarModelName = document.getElementById('topbarModelName');

// ── State ──
let conversations = JSON.parse(localStorage.getItem('ollama_conversations') || '[]');
let currentConvId = null;
let isStreaming = false;
let streamAbort = null;

// ── Init ──
(async function init() {
  renderConversationList();
  await checkOllamaStatus();
  await loadModels();
  setupEventListeners();
  autoResizeTextarea();
})();

// ── Event Listeners ──
function setupEventListeners() {
  // Sidebar toggle (desktop collapse)
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });

  // Mobile sidebar open
  mobileSidebarToggle.addEventListener('click', () => {
    sidebar.classList.add('mobile-open');
    sidebarOverlay.classList.add('visible');
  });

  // Close mobile sidebar
  sidebarOverlay.addEventListener('click', closeMobileSidebar);

  // New chat
  newChatBtn.addEventListener('click', () => {
    closeMobileSidebar();
    startNewChat();
  });

  // Clear chat
  clearChatBtn.addEventListener('click', () => {
    if (!currentConvId) return;
    if (confirm('Clear this conversation?')) {
      const conv = getConv(currentConvId);
      if (conv) { conv.messages = []; saveConversations(); }
      renderMessages([]);
      showWelcome(true);
    }
  });

  // Refresh models
  refreshModels.addEventListener('click', async () => {
    refreshModels.style.opacity = '0.5';
    await loadModels();
    refreshModels.style.opacity = '1';
  });

  // Model changed
  modelSelect.addEventListener('change', () => {
    topbarModelName.textContent = modelSelect.value || 'Ollama Chat';
  });

  // Send on Enter (not shift+enter)
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) handleSend();
    }
  });

  // Send button
  sendBtn.addEventListener('click', () => {
    if (isStreaming) {
      abortStream();
    } else {
      handleSend();
    }
  });

  // Enable/disable send based on input
  userInput.addEventListener('input', () => {
    const hasText = userInput.value.trim().length > 0;
    sendBtn.disabled = !hasText || isStreaming;
    autoResizeTextarea();
  });

  // Suggestion cards
  document.querySelectorAll('.suggestion-card').forEach(card => {
    card.addEventListener('click', () => {
      userInput.value = card.dataset.prompt;
      userInput.dispatchEvent(new Event('input'));
      userInput.focus();
      handleSend();
    });
  });
}

// ── Textarea auto-resize ──
function autoResizeTextarea() {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 200) + 'px';
}

// ── Ollama Status ──
async function checkOllamaStatus() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      setStatus('connected', 'Connected');
      return true;
    }
  } catch (_) { }
  setStatus('error', 'Offline');
  return false;
}

function setStatus(state, text) {
  statusDot.className = 'status-dot ' + state;
  statusText.textContent = text;
}

// ── Load Models ──
async function loadModels() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const models = (data.models || []).map(m => m.name).sort();

    modelSelect.innerHTML = '';
    if (models.length === 0) {
      modelSelect.innerHTML = '<option value="">No models found</option>';
      return;
    }
    models.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      modelSelect.appendChild(opt);
    });

    // Restore previously selected model if available
    const saved = localStorage.getItem('ollama_selected_model');
    if (saved && models.includes(saved)) modelSelect.value = saved;
    topbarModelName.textContent = modelSelect.value || 'Ollama Chat';

    setStatus('connected', 'Connected');
  } catch (_) {
    modelSelect.innerHTML = '<option value="">Cannot reach Ollama</option>';
    setStatus('error', 'Offline');
  }
}

// ── Conversations ──
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getConv(id) {
  return conversations.find(c => c.id === id);
}

function saveConversations() {
  localStorage.setItem('ollama_conversations', JSON.stringify(conversations));
}

function startNewChat() {
  currentConvId = null;
  messages.innerHTML = '';
  showWelcome(true);
  renderConversationList();
  userInput.value = '';
  autoResizeTextarea();
  sendBtn.disabled = true;
}

function createConversation(firstMessage) {
  const title = firstMessage.length > 40 ? firstMessage.slice(0, 40) + '…' : firstMessage;
  const conv = { id: generateId(), title, messages: [], model: modelSelect.value, createdAt: Date.now() };
  conversations.unshift(conv);
  saveConversations();
  return conv;
}

function renderConversationList() {
  conversationList.innerHTML = '';
  if (conversations.length === 0) {
    conversationList.innerHTML = '<div class="no-conversations">No conversations yet</div>';
    return;
  }
  conversations.forEach(conv => {
    const item = document.createElement('div');
    item.className = 'conversation-item' + (conv.id === currentConvId ? ' active' : '');
    item.innerHTML = `
      <span class="conversation-item-icon">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </span>
      <span class="conversation-item-title">${escapeHtml(conv.title)}</span>
      <button class="conversation-item-del" data-id="${conv.id}" title="Delete">✕</button>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.conversation-item-del')) {
        deleteConversation(conv.id);
        return;
      }
      loadConversation(conv.id);
      closeMobileSidebar();
    });
    conversationList.appendChild(item);
  });
}

function deleteConversation(id) {
  conversations = conversations.filter(c => c.id !== id);
  saveConversations();
  if (currentConvId === id) startNewChat();
  else renderConversationList();
}

function loadConversation(id) {
  currentConvId = id;
  const conv = getConv(id);
  if (!conv) return;
  renderMessages(conv.messages);
  renderConversationList();
  if (conv.model && [...modelSelect.options].some(o => o.value === conv.model)) {
    modelSelect.value = conv.model;
    topbarModelName.textContent = conv.model;
  }
}

// ── Send Message ──
async function handleSend() {
  const text = userInput.value.trim();
  if (!text || isStreaming) return;

  const model = modelSelect.value;
  if (!model) {
    showError('Please select a model first. Make sure Ollama is running.');
    return;
  }

  // Save model preference
  localStorage.setItem('ollama_selected_model', model);

  // Create conversation on first message
  if (!currentConvId) {
    const conv = createConversation(text);
    currentConvId = conv.id;
  }

  const conv = getConv(currentConvId);
  conv.model = model;

  // Clear input
  userInput.value = '';
  autoResizeTextarea();
  sendBtn.disabled = true;

  // Hide welcome, show messages
  showWelcome(false);

  // Add user message
  conv.messages.push({ role: 'user', content: text });
  saveConversations();
  appendMessage('user', text);
  renderConversationList();

  // Scroll down
  scrollToBottom();

  // Show typing indicator
  const typingEl = addTypingIndicator();

  // Start stream
  isStreaming = true;
  updateSendBtn();

  let fullResponse = '';
  let assistantBubble = null;

  try {
    streamAbort = new AbortController();
    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: conv.messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      }),
      signal: streamAbort.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}: ${response.statusText}`);
    }

    typingEl.remove();

    // Create assistant bubble for streaming
    assistantBubble = appendMessage('assistant', '', true);
    const contentEl = assistantBubble.querySelector('.message-content');
    const cursorEl = document.createElement('span');
    cursorEl.className = 'streaming-cursor';

    // Live thinking indicator — shown immediately, dismissed once we know the model type
    const thinkingEl = createThinkingIndicator();
    contentEl.appendChild(thinkingEl);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    // Separate accumulators for thinking vs answer
    let thinkContent = '';      // raw thinking text (from message.thinking field)
    let answerContent = '';     // actual answer (from message.content field)

    // Format char count for display (whole numbers, compact K suffix)
    const fmtChars = n => {
      const c = Math.floor(n);
      return c >= 1000 ? (c / 1000).toFixed(1) + 'K chars' : `${c} chars`;
    };
    let thinkCharCount = 0;
    let contentTokensSeen = 0; // how many message.content tokens seen (used to dismiss indicator)
    let hasThinking = false;   // true if this model sent any thinking tokens
    let thinkPanelInjected = false;
    let indicatorRemoved = false;

    function removeIndicator() {
      if (!indicatorRemoved) { thinkingEl.remove(); indicatorRemoved = true; }
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const json = JSON.parse(line);

          // ── Handle thinking field (Ollama's dedicated thinking stream) ──
          if (json.message?.thinking) {
            hasThinking = true;
            thinkContent += json.message.thinking;
            thinkCharCount = thinkContent.length;
            const counter = thinkingEl.querySelector('.think-token-count');
            if (counter) counter.textContent = fmtChars(thinkCharCount);
          }

          // ── Handle content field (the actual answer) ──
          if (json.message?.content) {
            const token = json.message.content;
            answerContent += token;
            fullResponse += token;
            contentTokensSeen++;

            // If we're receiving answer content and had thinking → inject panel once
            if (hasThinking && !thinkPanelInjected && thinkContent) {
              thinkPanelInjected = true;
              removeIndicator();
              const thinkPanel = buildThinkPanel(thinkContent, thinkCharCount);
              contentEl.appendChild(thinkPanel);
            }

            // If no thinking at all and we've seen 5+ content tokens → not a thinking model
            if (!hasThinking && contentTokensSeen >= 5) {
              removeIndicator();
            }

            // Also handle inline <think> tags in content (fallback for other models)
            if (!hasThinking && answerContent.includes('<think>')) {
              if (answerContent.includes('</think>')) {
                const match = answerContent.match(/<think>([\s\S]*?)<\/think>/);
                thinkContent = match ? match[1].trim() : '';
                thinkCharCount = thinkContent.length;
                answerContent = answerContent.replace(/<think>[\s\S]*?<\/think>/, '').trimStart();
                hasThinking = true;
                if (!thinkPanelInjected && thinkContent) {
                  thinkPanelInjected = true;
                  removeIndicator();
                  const thinkPanel = buildThinkPanel(thinkContent, thinkCharCount);
                  contentEl.appendChild(thinkPanel);
                }
              } else {
                // Still inside an inline think block — update counter
                hasThinking = true;
                const inlineThink = answerContent.replace('<think>', '');
                thinkCharCount = inlineThink.length;
                const counter = thinkingEl.querySelector('.think-token-count');
                if (counter) counter.textContent = fmtChars(thinkCharCount);
              }
            }

            // Render the answer content live (strip any inline think tags)
            const displayAnswer = answerContent.replace(/<think>[\s\S]*?<\/think>/g, '').trimStart();
            if (displayAnswer) {
              contentEl.querySelector('.answer-stream')?.remove();
              const ansDiv = document.createElement('div');
              ansDiv.className = 'answer-stream';
              ansDiv.innerHTML = renderMarkdown(displayAnswer);
              ansDiv.appendChild(cursorEl);
              contentEl.appendChild(ansDiv);
            }

            scrollToBottom();
          }

          if (json.done) {
            // If thinking was accumulated but panel not yet injected (e.g. no content tokens came)
            if (hasThinking && !thinkPanelInjected && thinkContent) {
              thinkPanelInjected = true;
              removeIndicator();
              const thinkPanel = buildThinkPanel(thinkContent, thinkCharCount);
              contentEl.appendChild(thinkPanel);
            }
            removeIndicator();
            break;
          }
        } catch (_) { }
      }
    }

    removeIndicator();

    // Finalize
    const cleanAnswer = answerContent.replace(/<think>[\s\S]*?<\/think>/g, '').trimStart() || answerContent;
    cursorEl.remove();
    const answerStreamEl = contentEl.querySelector('.answer-stream');
    if (answerStreamEl) {
      answerStreamEl.innerHTML = renderMarkdown(cleanAnswer);
    } else {
      contentEl.innerHTML = renderMarkdown(cleanAnswer);
    }
    addMessageActions(assistantBubble, cleanAnswer);
    conv.messages.push({ role: 'assistant', content: cleanAnswer, thinkContent: thinkContent || null });
    saveConversations();

  } catch (err) {
    typingEl?.remove();
    assistantBubble?.remove();
    if (err.name !== 'AbortError') {
      showError(`Error: ${err.message}. Is Ollama running?`);
    }
  } finally {
    isStreaming = false;
    streamAbort = null;
    sendBtn.disabled = userInput.value.trim().length === 0;
    updateSendBtn();
  }
}

function abortStream() {
  if (streamAbort) streamAbort.abort();
}

// ── UI Helpers ──
function showWelcome(show) {
  welcomeScreen.classList.toggle('hidden', !show);
  messagesWrapper.classList.toggle('visible', !show);
}

function scrollToBottom() {
  chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
}

function updateSendBtn() {
  if (isStreaming) {
    sendBtn.disabled = false;
    sendBtn.classList.add('loading');
    sendBtn.title = 'Stop generating';
    sendBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
  } else {
    sendBtn.classList.remove('loading');
    sendBtn.title = 'Send message';
    sendBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
  }
}

function addTypingIndicator() {
  const el = document.createElement('div');
  el.className = 'message assistant typing-indicator';
  el.innerHTML = `
    <div class="message-avatar">AI</div>
    <div class="message-body">
      <div class="message-bubble">
        <div class="loading-indicator">
          <span class="loading-bar"></span>
          <span class="loading-bar"></span>
          <span class="loading-bar"></span>
          <span class="loading-bar"></span>
          <span class="loading-bar"></span>
        </div>
      </div>
    </div>
  `;
  messages.appendChild(el);
  scrollToBottom();
  return el;
}

// ── Thinking Indicator (live, with token counter) ──
function createThinkingIndicator() {
  const el = document.createElement('div');
  el.className = 'think-indicator';
  el.innerHTML = `
    <div class="think-indicator-inner">
      <span class="think-orb"></span>
      <span class="think-label">Reasoning</span>
      <span class="think-token-count">0 tokens</span>
    </div>
    <div class="think-progress-bar"><span class="think-progress-fill"></span></div>
  `;
  return el;
}

// ── Collapsible Think Panel ──
function buildThinkPanel(thinkContent, tokenCount) {
  const panel = document.createElement('div');
  panel.className = 'think-panel';
  const tokenStr = tokenCount ? `${tokenCount} tokens` : '';
  panel.innerHTML = `
    <button class="think-panel-header" aria-expanded="false">
      <span class="think-panel-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4l3 3"/>
        </svg>
      </span>
      <span class="think-panel-title">Thinking</span>
      ${tokenStr ? `<span class="think-panel-tokens">${tokenStr}</span>` : ''}
      <svg class="think-panel-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
    <div class="think-panel-body">
      <div class="think-panel-content">${escapeHtml(thinkContent)}</div>
    </div>
  `;
  const btn = panel.querySelector('.think-panel-header');
  const body = panel.querySelector('.think-panel-body');
  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    panel.classList.toggle('expanded', !expanded);
  });
  return panel;
}

function appendMessage(role, content, isStreaming = false, thinkContent = null) {
  const el = document.createElement('div');
  el.className = `message ${role}`;
  const avatarText = role === 'user' ? 'YOU' : 'AI';
  el.innerHTML = `
    <div class="message-avatar">${avatarText}</div>
    <div class="message-body">
      <div class="message-bubble">
        <div class="message-content">${isStreaming ? '' : renderMarkdown(content)}</div>
      </div>
      ${role === 'assistant' && !isStreaming ? buildMessageActions(content) : ''}
    </div>
  `;
  // Inject think panel for saved assistant messages that have reasoning
  if (!isStreaming && role === 'assistant' && thinkContent) {
    const bubble = el.querySelector('.message-bubble');
    const contentDiv = el.querySelector('.message-content');
    const panel = buildThinkPanel(thinkContent, null);
    bubble.insertBefore(panel, contentDiv);
  }
  if (!isStreaming && role === 'assistant') {
    setupCopyButtons(el);
  }
  messages.appendChild(el);
  scrollToBottom();
  return el;
}

function addMessageActions(el, content) {
  const body = el.querySelector('.message-body');
  const existing = body.querySelector('.message-actions');
  if (existing) existing.remove();
  body.insertAdjacentHTML('beforeend', buildMessageActions(content));
  setupCopyButtons(el);
}

function buildMessageActions(content) {
  return `<div class="message-actions">
    <button class="msg-action-btn copy-msg-btn" title="Copy message">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      Copy
    </button>
  </div>`;
}

function renderMessages(msgs) {
  messages.innerHTML = '';
  if (msgs.length === 0) { showWelcome(true); return; }
  showWelcome(false);
  msgs.forEach(m => appendMessage(m.role, m.content, false, m.thinkContent));
  setTimeout(scrollToBottom, 50);
}

function showError(msg) {
  const el = document.createElement('div');
  el.className = 'message-error';
  el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" flex-shrink="0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>${escapeHtml(msg)}</span>`;
  messages.appendChild(el);
  scrollToBottom();
  setTimeout(() => el.remove(), 8000);
}

// ── Copy buttons ──
function setupCopyButtons(messageEl) {
  // Copy code buttons
  messageEl.querySelectorAll('.copy-code-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Prefer the raw stored code (preserves indentation perfectly)
      const pre = btn.closest('pre');
      const code = pre?.dataset?.rawCode ?? pre?.querySelector('code')?.textContent ?? '';
      copyToClipboard(code, btn, 'Copied!', 'Copy');
    });
  });
  // Copy message button
  const copyMsgBtn = messageEl.querySelector('.copy-msg-btn');
  if (copyMsgBtn) {
    copyMsgBtn.addEventListener('click', () => {
      const content = messageEl.querySelector('.message-content')?.innerText || '';
      copyToClipboard(content, copyMsgBtn, '✓ Copied', 'Copy');
    });
  }
}

function copyToClipboard(text, btn, successLabel, defaultLabel) {
  navigator.clipboard.writeText(text).then(() => {
    const originalHTML = btn.innerHTML;
    btn.textContent = successLabel;
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = originalHTML; btn.classList.remove('copied'); }, 2000);
  });
}

// ── Think-block stripper (for reasoning models like DeepSeek-R1) ──
function stripThinkBlocks(text, resolved) {
  if (!text) return '';
  // If the think block is fully closed, remove it and return the answer
  if (text.includes('</think>')) {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trimStart();
  }
  // If we're still inside a think block, return empty (don't render thinking)
  if (text.includes('<think>')) {
    return '';
  }
  return text;
}

// ── Markdown Renderer ──
function renderMarkdown(text) {
  if (!text) return '';
  // Strip any residual think tags before rendering
  text = stripThinkBlocks(text, true);

  // Code blocks (```lang ... ```) — extract BEFORE escaping so we get the raw code
  let html = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, rawCode) => {
    const langLabel = lang || 'code';
    const trimmedCode = rawCode.trimEnd();
    // Store the raw code in a data attribute for copy button; display it HTML-escaped
    const safeCode = escapeHtml(trimmedCode);
    const safeRaw = trimmedCode.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\r\n/g, '&#10;').replace(/\n/g, '&#10;').replace(/\r/g, '&#10;');
    return `<pre data-raw-code="${safeRaw}"><div class="code-header"><span class="code-lang">${escapeHtml(langLabel)}</span><button class="copy-code-btn">Copy</button></div><code>${safeCode}</code></pre>`;
  });

  // Escape HTML for the remaining non-code parts
  html = html
    .split(/(<pre[\s\S]*?<\/pre>)/g)
    .map((part, i) => i % 2 === 0 ? escapeHtml(part) : part)
    .join('');

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr>');

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)(?=\n<li>|$)/gm, '<ul>$&</ul>');
  // Collapse consecutive ul tags
  html = html.replace(/<\/ul>\n<ul>/g, '');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Paragraphs — wrap consecutive non-block lines
  html = html
    .split('\n\n')
    .map(block => {
      if (/^<(h[1-6]|pre|ul|ol|blockquote|hr)/.test(block.trimStart())) return block;
      const inner = block.replace(/\n/g, '<br>');
      return `<p>${inner}</p>`;
    })
    .join('\n');

  return html;
}

// ── Helpers ──
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function closeMobileSidebar() {
  sidebar.classList.remove('mobile-open');
  sidebarOverlay.classList.remove('visible');
}
