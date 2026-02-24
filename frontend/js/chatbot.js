/**
 * chatbot.js — STRINEX AI Coach (Google Gemini)
 *
 * Opens a slide-up drawer with run context, auto-generates a full
 * run analysis on open, and handles follow-up Q&A about diet & training.
 *
 * Depends on: config.js (STRINEX_CONFIG.CHATBOT_API_KEY / CHATBOT_API_URL)
 */

// ── State ────────────────────────────────────────────────────────────
let _chatRunData = null;
let _chatHistory = [];
let _chatBusy = false;
let _systemInstruction = '';

// ── Open / Close ─────────────────────────────────────────────────────

function openChatbot(runData) {
    _chatRunData = runData;
    _chatHistory = [];
    _chatBusy = false;

    const drawer = document.getElementById('chatbot-drawer');
    const thread = document.getElementById('chat-thread');
    if (!drawer || !thread) return;

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
- Use bullet points and emojis for readability
- Never give medical advice — suggest consulting a doctor for injuries`;

    // Show drawer
    drawer.classList.add('open');

    // Automatically generate a full run analysis
    _autoAnalyzeRun(runData);
}

function closeChatbot() {
    const drawer = document.getElementById('chatbot-drawer');
    if (drawer) drawer.classList.remove('open');
}

// ── Auto-Analyze Run ─────────────────────────────────────────────────

async function _autoAnalyzeRun(runData) {
    const cfg = window.STRINEX_CONFIG || {};
    const apiKey = cfg.CHATBOT_API_KEY || '';
    const apiUrl = cfg.CHATBOT_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    if (!apiKey || apiKey.includes('PASTE_YOUR')) {
        _appendBubble('ai', '⚠️ <b>API key not configured.</b> Add your Gemini API key in <code>config.js</code>.');
        return;
    }

    // Build the auto-analysis prompt with all run details
    const analysisPrompt = `The user just completed a run on Strinex. Here are the EXACT details:

📊 **RUN STATS:**
- Distance: ${runData.distance}
- Duration: ${runData.duration}
- Average Pace: ${runData.pace}
- Estimated Calories Burned: ${runData.calories || 'N/A'}
- Date/Time: ${runData.timestamp || 'N/A'}
- GPS Points Logged: ${runData.gpsPoints || 'N/A'}

Please provide a COMPLETE post-run analysis with ALL of the following sections:

1. **🏅 Run Summary** — Rate this run (beginner/intermediate/advanced effort), highlight what went well
2. **🍽️ Post-Run Meal Plan** — Exactly what to eat RIGHT NOW for recovery (specific foods, portions). Include both Indian and international options
3. **💧 Hydration** — How much water/electrolytes to drink based on the distance
4. **🧘 Recovery Plan** — Stretches and rest recommendations for today
5. **📈 Next Run Tip** — One actionable suggestion to improve next time on Strinex
6. **🏆 Achievement Progress** — Which Strinex badges they might be close to based on this run

Be thorough and specific. Use the actual run numbers in your analysis.`;

    // Add to conversation history
    _chatHistory.push({ role: 'user', parts: [{ text: analysisPrompt }] });

    // Show typing indicator
    const typingId = _showTyping();
    _chatBusy = true;

    try {
        const reply = await _callGemini(apiKey, apiUrl);
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
        _appendBubble('ai', '⚠️ Could not connect to AI. Check your API key and try again.');
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

    const cfg = window.STRINEX_CONFIG || {};
    const apiKey = cfg.CHATBOT_API_KEY || '';
    const apiUrl = cfg.CHATBOT_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    if (!apiKey || apiKey.includes('PASTE_YOUR')) {
        _appendBubble('ai', '⚠️ <b>API key not configured.</b> Add your Gemini API key in <code>config.js</code>.');
        return;
    }

    _appendBubble('user', _escHtml(text));
    input.value = '';

    // Add context reminder with every user message so Gemini stays on topic
    const contextReminder = `[Context: The user's last run was ${_chatRunData.distance} in ${_chatRunData.duration}, pace ${_chatRunData.pace}, calories ${_chatRunData.calories || 'N/A'}. Always relate your answer to their running and fitness goals on Strinex.]

User's question: ${text}`;

    _chatHistory.push({ role: 'user', parts: [{ text: contextReminder }] });

    const typingId = _showTyping();
    _chatBusy = true;

    try {
        const reply = await _callGemini(apiKey, apiUrl);
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
        _appendBubble('ai', '⚠️ Network error — check your connection and try again.');
    }

    _chatBusy = false;
}

// ── Gemini API Call ──────────────────────────────────────────────────

async function _callGemini(apiKey, apiUrl) {
    const requestBody = {
        system_instruction: {
            parts: [{ text: _systemInstruction }]
        },
        contents: _chatHistory,
        generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 2048,
            topP: 0.95,
            topK: 40,
        }
    };

    const res = await fetch(`${apiUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
        const errBody = await res.text();
        console.error('[chatbot] Gemini API error:', res.status, errBody);
        throw new Error(`API error: ${res.status}`);
    }

    const data = await res.json();

    // Gemini may return multiple parts — concatenate them all
    const parts = data.candidates?.[0]?.content?.parts || [];
    const fullReply = parts.map(p => p.text || '').join('\n');

    return fullReply || null;
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
