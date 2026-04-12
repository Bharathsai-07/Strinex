/**
 * chatbot.js — STRINEX AI Coach (backend-routed Gemini)
 *
 * Opens a slide-up drawer with run context, auto-generates a full
 * run analysis on open, and handles follow-up Q&A about diet & training.
 * All messages are persisted to MongoDB via HTTP and loaded on open.
 *
 * Depends on: api.js (backendFetch), auth.js (session)
 */

// ── State ────────────────────────────────────────────────────────────
let _chatRunData = null;
let _chatHistory = [];
let _chatBusy = false;
let _systemInstruction = '';
let _chatSessionId = '';
let _chatHistoryLoaded = false;

// ── Open / Close ─────────────────────────────────────────────────────

function openChatbot(runData) {
    _chatRunData = runData;
    _chatHistory = [];
    _chatBusy = false;
    _chatHistoryLoaded = false;

    // Generate a new session ID or retain a persistent one per browser session
    if (!_chatSessionId) {
        _chatSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    }

    const thread = document.getElementById('chat-thread');
    if (!thread) return;

    thread.innerHTML = '';

    // Build system instruction — Strinex-branded AI Coach
    _systemInstruction = `You are **STRINEX AI Coach** — the official built-in running coach and sports nutritionist for the Strinex fitness platform.

## ABOUT STRINEX
Strinex is a real-time GPS fitness tracker web app. Features:
- Live Map Tracking with red polyline routes on Leaflet.js maps
- Browser GPS via native Geolocation API
- Instant Metrics: distance (km), pace (min/km), speed (km/h), duration
- Streak Engine: goal-based daily streaks to build consistency
- Leaderboard: weekly Global, City, Friends rankings
- XP & Levels system with achievements (First Run, 10K Club, Week Warrior, Century, Speed Demon, Globe Trotter)

## YOUR RULES
- Be energetic, motivating, and supportive
- Reference Strinex achievements naturally (e.g. "You're close to the Speed Demon badge!")
- For diet: give SPECIFIC meals, portions, and timing (pre-run, post-run, rest day). Include both Indian and international options
- For recovery: hydration targets in litres, stretching routines, foam rolling, sleep hours
- For training: progression tips, tempo runs, intervals, easy runs, cross-training
- Always relate advice to improving Strinex stats
- Keep responses short and practical
- Default format: 3 to 5 bullet points max
- Keep each bullet to one short sentence
- Use plain language; avoid long paragraphs
- Never give medical advice — suggest consulting a doctor for injuries`;

    // Load chat history from backend first, then auto-analyze if needed
    _loadChatHistory(runData);
}

function closeChatbot() {
    if (typeof showPage === 'function') {
        showPage('run');
    }
}

// ── Load Chat History from MongoDB ──────────────────────────────────

function _getBackendBaseUrl() {
    return (window.STRINEX_CONFIG || {}).BACKEND_API_URL || 'http://localhost:5000';
}

async function _loadChatHistory(runData) {
    if (typeof backendFetch !== 'function') {
        _appendBubble('ai', 'Ask me about training, recovery, pace, or nutrition. If you start a run, I can also analyze live stats from the run page.');
        document.getElementById('chat-input')?.focus();
        return;
    }

    if (typeof checkBackendHealth === 'function') {
        const backendUp = await checkBackendHealth();
        if (!backendUp) {
            const backendUrl = _getBackendBaseUrl();
            _appendBubble('ai', `⚠️ Cannot connect to Strinex backend. Make sure it is reachable at ${backendUrl}.`);
            document.getElementById('chat-input')?.focus();
            return;
        }
    }

    try {
        const data = await backendFetch('/ai-analysis/history?limit=50');
        const messages = data?.messages || [];

        if (messages.length > 0) {
            _chatHistoryLoaded = true;
            // Render saved messages
            messages.forEach(msg => {
                if (msg.role === 'user') {
                    // Show a cleaned-up version of user messages (strip context prefix)
                    let displayText = msg.content;
                    const contextMatch = displayText.match(/User's question:\s*(.+)/s);
                    if (contextMatch) {
                        displayText = contextMatch[1].trim();
                    }
                    // Don't show auto-analysis prompts as user bubbles
                    if (!displayText.startsWith('The user just completed a run') && displayText !== 'Run analysis request') {
                        _appendBubble('user', _escHtml(displayText));
                    }
                } else if (msg.role === 'ai') {
                    _appendBubble('ai', _mdToHtml(msg.content));
                }
                _chatHistory.push({ role: msg.role, parts: [{ text: msg.content }] });
            });

            // Add separator for existing history
            const thread = document.getElementById('chat-thread');
            if (thread && messages.length > 0) {
                const sep = document.createElement('div');
                sep.className = 'chat-history-separator';
                sep.innerHTML = '<span>— Previous messages loaded —</span>';
                thread.appendChild(sep);
                thread.scrollTop = thread.scrollHeight;
            }
        }
    } catch (err) {
        console.log('[chatbot] Could not load chat history:', err.message);
    }

    // If there's run data, always generate a fresh next-run plan for this run.
    if (runData) {
        _autoAnalyzeRun(runData);
    } else if (!runData && !_chatHistoryLoaded) {
        _appendBubble('ai', 'Ask me about training, recovery, pace, or nutrition. If you start a run, I can also analyze live stats from the run page.');
    }

    document.getElementById('chat-input')?.focus();
}

// ── Auto-Analyze Run ─────────────────────────────────────────────────

async function _autoAnalyzeRun(runData) {
    if (typeof backendFetch !== 'function') {
        _appendBubble('ai', '⚠️ AI service is unavailable. Backend API helper not found.');
        return;
    }

    // Build a concise, next-run-focused prompt.
    const analysisPrompt = `The user just completed a run on Strinex. Here are the exact details:

📊 **RUN STATS:**
- Distance: ${runData.distance}
- Duration: ${runData.duration}
- Average Pace: ${runData.pace}
- Estimated Calories Burned: ${runData.calories || 'N/A'}
- Date/Time: ${runData.timestamp || 'N/A'}
- GPS Points Logged: ${runData.gpsPoints || 'N/A'}

Give a very short "Next Run Improvement Plan" based on these numbers.

STRICT OUTPUT RULES:
- Maximum 5 bullet points total
- Each bullet must be one short sentence
- Focus on the next run only (what to change next time)
- Include: 1 pacing fix, 1 distance/time target, 1 recovery action, 1 nutrition/hydration action
- End with one motivational one-liner
- No long explanations and no extra sections.`;

    // Keep a lightweight local history for UX continuity.
    _chatHistory.push({ role: 'user', parts: [{ text: analysisPrompt }] });

    // Show typing indicator
    const typingId = _showTyping();
    _chatBusy = true;

    try {
        const reply = await _callBackendAI({
            userPrompt: analysisPrompt,
            runData,
        });
        _removeTyping(typingId);

        if (reply) {
            _chatHistory.push({ role: 'model', parts: [{ text: reply }] });
            _appendBubble('ai', _mdToHtml(reply));
        } else {
            _appendBubble('ai', '⚠️ Could not generate analysis. Try asking a question below.');
        }
    } catch (err) {
        _removeTyping(typingId);
        console.error('[chatbot] Auto-analysis error:', err);
        if (err?.status === 401) {
            _appendBubble('ai', '⚠️ You are not authenticated. Please sign in again and reopen AI Coach.');
        } else if (err?.status === 403) {
            _appendBubble('ai', '⚠️ Access denied for AI Coach. Check your auth session and try again.');
        } else {
            const backendUrl = _getBackendBaseUrl();
            _appendBubble('ai', `⚠️ Could not connect to AI service. Verify backend is running on ${backendUrl} and try again.`);
        }
    }

    _chatBusy = false;
    document.getElementById('chat-input')?.focus();
}

// ── Send User Message ────────────────────────────────────────────────

async function sendChatMessage() {
    if (_chatBusy) return;

    const input = document.getElementById('chat-input');
    const text = (input?.value || '').trim();
    if (!text) return;

    if (typeof backendFetch !== 'function') {
        _appendBubble('ai', '⚠️ AI service is unavailable. Backend API helper not found.');
        return;
    }

    _appendBubble('user', _escHtml(text));
    input.value = '';

    // Add context reminder with every user message so Gemini stays on topic
    let contextReminder = `User's question: ${text}`;
    if (_chatRunData) {
        contextReminder = `[Context: The user's last run was ${_chatRunData.distance} in ${_chatRunData.duration}, pace ${_chatRunData.pace}, calories ${_chatRunData.calories || 'N/A'}. Keep advice concise (3-5 short bullet points). Always relate your answer to their running and fitness goals on Strinex.]

User's question: ${text}`
    };

    _chatHistory.push({ role: 'user', parts: [{ text: contextReminder }] });

    const typingId = _showTyping();
    _chatBusy = true;

    try {
        const reply = await _callBackendAI({
            userPrompt: contextReminder,
            runData: _chatRunData,
        });
        _removeTyping(typingId);

        if (reply) {
            _chatHistory.push({ role: 'model', parts: [{ text: reply }] });
            _appendBubble('ai', _mdToHtml(reply));
        } else {
            _appendBubble('ai', '⚠️ No response received. Please try again.');
        }
    } catch (err) {
        _removeTyping(typingId);
        console.error('[chatbot] Send error:', err);
        if (err?.status === 401) {
            _appendBubble('ai', '⚠️ Session expired. Please sign in again to continue chatting.');
        } else if (err?.status === 400) {
            _appendBubble('ai', '⚠️ Invalid request sent to AI Coach. Try again after starting a run.');
        } else {
            const backendUrl = _getBackendBaseUrl();
            _appendBubble('ai', `⚠️ Network error — ensure backend is running and reachable at ${backendUrl}.`);
        }
    }

    _chatBusy = false;
}

// ── Backend AI Call ─────────────────────────────────────────────────

function _parseDistanceKm(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = parseFloat(String(value || '').replace(/[^\d.]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

function _parseDurationSec(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const m = String(value || '').match(/^(\d+):(\d{2})$/);
    if (!m) return 0;
    return (parseInt(m[1], 10) * 60) + parseInt(m[2], 10);
}

function _parsePaceMinPerKm(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const match = String(value || '').match(/(\d+):(\d{2})/);
    if (!match) return 0;
    return parseInt(match[1], 10) + (parseInt(match[2], 10) / 60);
}

async function _callBackendAI({ userPrompt, runData }) {
    const distance = _parseDistanceKm(runData?.distanceRaw ?? runData?.distance);
    const duration = _parseDurationSec(runData?.durationRaw ?? runData?.duration);
    const pace = _parsePaceMinPerKm(runData?.paceRaw ?? runData?.pace);

    const payload = {
        distance,
        duration,
        pace,
        userPrompt,
        systemInstruction: _systemInstruction,
        sessionId: _chatSessionId,
        runContext: {
            calories: runData?.calories,
            timestamp: runData?.timestamp,
            gpsPoints: runData?.gpsPoints,
        },
    };

    const data = await backendFetch('/ai-analysis', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    return data?.suggestions || null;
}

// ── Clear Chat History ──────────────────────────────────────────────

async function clearChatHistory() {
    if (typeof backendFetch !== 'function') return;

    try {
        await backendFetch('/ai-analysis/history', { method: 'DELETE' });
        _chatHistory = [];
        _chatSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const thread = document.getElementById('chat-thread');
        if (thread) {
            thread.innerHTML = '';
            _appendBubble('ai', '🗑️ Chat history cleared. Ask me anything about training, recovery, or nutrition!');
        }
    } catch (err) {
        console.error('[chatbot] Clear history error:', err);
    }
}

// ── Helpers ──────────────────────────────────────────────────────────

function _appendBubble(role, html) {
    const thread = document.getElementById('chat-thread');
    if (!thread) return;

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;

    if (role === 'ai') {
        bubble.innerHTML = `<div class="chat-avatar">🤖</div><div class="chat-content">${html}</div>`;
    } else {
        bubble.innerHTML = `<div class="chat-content">${html}</div><div class="chat-avatar">🏃</div>`;
    }

    thread.appendChild(bubble);
    thread.scrollTop = thread.scrollHeight;
}

function _showTyping() {
    const thread = document.getElementById('chat-thread');
    if (!thread) return '';
    const id = 'typing-' + Date.now();
    const el = document.createElement('div');
    el.className = 'chat-bubble ai typing-indicator';
    el.id = id;
    el.innerHTML = `<div class="chat-avatar">🤖</div><div class="chat-content"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`;
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
    return id;
}

function _removeTyping(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

/**
 * Markdown → HTML converter
 * Handles: **bold**, *italic*, `code`, headers, bullet lists, numbered lists, line breaks
 */
function _mdToHtml(md) {
    if (!md) return '';
    let html = _escHtml(md);

    // Headers: ## Header → <h4>, ### Header → <h5>
    html = html.replace(/^### (.+)$/gm, '<h5 style="margin:8px 0 4px;color:#f9fafb;">$1</h5>');
    html = html.replace(/^## (.+)$/gm, '<h4 style="margin:10px 0 4px;color:#f9fafb;">$1</h4>');

    // Bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Inline code
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');

    // Numbered lists: "1. item" → <li>
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

    // Bullet lists: "- item" or "• item" or "* item" (at start of line)
    html = html.replace(/^[-•*]\s+(.+)$/gm, '<li>$1</li>');

    // Wrap consecutive <li> items in <ul>
    html = html.replace(/((?:<li>.*?<\/li>\s*)+)/gs, '<ul style="margin:4px 0;padding-left:18px;">$1</ul>');

    // Line breaks (but not inside tags)
    html = html.replace(/\n/g, '<br>');

    // Clean up double <br> after block elements
    html = html.replace(/(<\/h[45]>)<br>/g, '$1');
    html = html.replace(/(<\/ul>)<br>/g, '$1');

    return html;
}

function _escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

/** Handle Enter key in chat input */
function _chatKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
}
