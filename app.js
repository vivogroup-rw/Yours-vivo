// ============================================================
//  Yours Vivo — Core App Controller (v2)
// ============================================================

const AVATARS = ['😊', '😎', '🦁', '🐼', '🦊', '🐨', '🐸', '🐙', '🦋', '🌟', '🔥', '⚡', '🌈', '🎯', '🚀', '🧠', '🎵', '🏆', '🌸', '🍀', '🐉', '🦚', '🌊', '🎪'];

// ─── Auth helpers (localStorage) ───────────────────────────
function getUsers() { return JSON.parse(localStorage.getItem('vivo_users') || '{}'); }
function saveUsers(u) { localStorage.setItem('vivo_users', JSON.stringify(u)); }
function getSession() { return JSON.parse(localStorage.getItem('vivo_session') || 'null'); }
function setSession(user) { localStorage.setItem('vivo_session', JSON.stringify(user)); }
function clearSession() { localStorage.removeItem('vivo_session'); }

// ─── DOM Refs ───────────────────────────────────────────────
const authScreen = document.getElementById('auth-screen');
const appContainer = document.getElementById('app-container');
const avatarBadge = document.getElementById('user-avatar-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send-message');
const typingInd = document.getElementById('typing-indicator');
const agendaList = document.getElementById('agenda-list-container');
const bubbleContainer = document.getElementById('bubble-container');
const banner = document.getElementById('notification-banner');
const modalAgenda = document.getElementById('modal-agenda');
const modalMemory = document.getElementById('modal-memory');
const geminiKeyWrap = document.getElementById('gemini-key-container');

let activeMemoryId = null;
let currentUser = null; // { username, avatar, passwordHash }

// ─── Simple hash (not cryptographic, just for local demo) ───
async function hashStr(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
//  BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Render avatar grids
    renderAvatarGrid('avatar-grid', null, (a) => { window._signupAvatar = a; });
    renderAvatarGrid('settings-avatar-grid', null, async (a) => {
        if (!currentUser) return;
        currentUser.avatar = a;
        const users = getUsers();
        users[currentUser.username] = currentUser;
        saveUsers(users);
        setSession(currentUser);
        avatarBadge.textContent = a;
        renderAvatarGrid('settings-avatar-grid', a, async (av) => {
            currentUser.avatar = av;
            const us = getUsers(); us[currentUser.username] = currentUser; saveUsers(us); setSession(currentUser);
            avatarBadge.textContent = av;
        });
    });

    // Apply theme from localstorage
    applyStoredTheme();

    // Check for existing session
    const session = getSession();
    if (session) {
        currentUser = session;
        await launchApp();
    } else {
        authScreen.style.display = 'flex';
        appContainer.style.display = 'none';
    }

    // ── Auth: Sign Up ────────────────────────────────────────
    document.getElementById('btn-signup').addEventListener('click', async () => {
        const username = document.getElementById('signup-username').value.trim();
        const password = document.getElementById('signup-password').value;
        const avatar = window._signupAvatar || '😊';
        const errEl = document.getElementById('signup-error');

        if (!username || !password) { errEl.textContent = 'Fill in all fields.'; return; }
        if (username.length < 3) { errEl.textContent = 'Username must be ≥ 3 chars.'; return; }

        const users = getUsers();
        if (users[username]) { errEl.textContent = 'Username already taken.'; return; }

        const hash = await hashStr(password);
        users[username] = { username, avatar, passwordHash: hash };
        saveUsers(users);

        currentUser = users[username];
        setSession(currentUser);
        errEl.textContent = '';
        await launchApp(true);
    });

    // ── Auth: Sign In ────────────────────────────────────────
    document.getElementById('btn-login').addEventListener('click', async () => {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const errEl = document.getElementById('login-error');

        if (!username || !password) { errEl.textContent = 'Fill in all fields.'; return; }

        const users = getUsers();
        if (!users[username]) { errEl.textContent = 'No account found.'; return; }

        const hash = await hashStr(password);
        if (users[username].passwordHash !== hash) { errEl.textContent = 'Wrong password.'; return; }

        currentUser = users[username];
        setSession(currentUser);
        errEl.textContent = '';
        await launchApp();
    });

    // Enter key in auth inputs
    ['login-username', 'login-password', 'signup-username', 'signup-password'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.closest('.auth-form').querySelector('.btn-auth').click(); } });
    });
});

// ============================================================
//  LAUNCH APP
// ============================================================
async function launchApp(isNewUser = false) {
    // Hide auth, show app
    authScreen.classList.add('hidden');
    setTimeout(() => { authScreen.style.display = 'none'; }, 420);
    appContainer.style.display = 'flex';

    // Set avatar badge
    avatarBadge.textContent = currentUser.avatar || '😊';

    // Update settings avatar grid selection
    renderAvatarGrid('settings-avatar-grid', currentUser.avatar, async (av) => {
        currentUser.avatar = av;
        const users = getUsers(); users[currentUser.username] = currentUser; saveUsers(users); setSession(currentUser);
        avatarBadge.textContent = av;
    });

    // Open DB (namespaced per user)
    window.appDb = new DeviceDatabase(`vivo_db_${currentUser.username}`);
    await window.appDb.open();

    // Load settings into UI
    await loadSettings();
    await renderAll();

    // Start proactive scheduler
    window.agendaScheduler.start();

    // Initial greeting
    const msgs = await window.appDb.getMessages();
    if (msgs.length === 0 || isNewUser) {
        await window.appDb.clearMessages();
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        await window.appDb.addMessage('assistant',
            `${greeting}, ${currentUser.username}! 👋 I'm **Vivo**, here to help you stay on track.\n\nTell me what's on your agenda today, or just say hi!`
        );
        await renderChat();
    }

    // Navigate to chat panel
    switchPanel('chat');

    // Set up nav listeners
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            switchPanel(item.getAttribute('data-panel'));
        });
    });

    // Avatar badge → settings
    avatarBadge.addEventListener('click', () => switchPanel('settings'));

    // Banner close
    document.getElementById('btn-close-banner').addEventListener('click', () => {
        banner.classList.remove('active');
    });

    // Sign out
    document.getElementById('btn-logout').addEventListener('click', () => {
        if (confirm('Sign out?')) {
            clearSession();
            window.agendaScheduler.stop();
            window.location.reload();
        }
    });

    // Clear data
    document.getElementById('btn-clear-data').addEventListener('click', async () => {
        if (confirm('Clear all data for this account?')) {
            const tx = window.appDb.db.transaction(['settings', 'messages', 'agendas', 'memories'], 'readwrite');
            ['settings', 'messages', 'agendas', 'memories'].forEach(s => tx.objectStore(s).clear());
            window.location.reload();
        }
    });

    // Chat send
    btnSend.addEventListener('click', e => { e.preventDefault(); submitMessage(); });
    chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitMessage(); } });

    // Office
    document.getElementById('btn-open-agenda-modal').addEventListener('click', openAgendaModal);
    document.getElementById('btn-cancel-agenda').addEventListener('click', () => modalAgenda.classList.remove('active'));
    document.getElementById('btn-save-agenda').addEventListener('click', saveAgenda);

    // Memory modal
    document.getElementById('btn-close-memory').addEventListener('click', () => { modalMemory.classList.remove('active'); activeMemoryId = null; });
    document.getElementById('btn-delete-memory').addEventListener('click', async () => {
        if (activeMemoryId) {
            await window.appDb.deleteMemory(activeMemoryId);
            modalMemory.classList.remove('active');
            activeMemoryId = null;
            renderMemories();
        }
    });

    // Settings listeners
    bindSettings();

    // Expose globals for agenda.js
    window.refreshChatUI = renderChat;
    window.scrollToChatBottom = scrollBottom;
    window.refreshOfficeUI = renderAgendas;
    window.getCurrentUser = () => currentUser;
}

// ============================================================
//  PANEL SWITCHING
// ============================================================
function switchPanel(name) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.getAttribute('data-panel') === name));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${name}`));
    if (name === 'office') renderAgendas();
    if (name === 'park') renderMemories();
    if (name === 'chat') scrollBottom();
}

// ============================================================
//  THEME
// ============================================================
function applyStoredTheme() {
    const t = localStorage.getItem('vivo_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
    const darkBtn = document.getElementById('theme-dark');
    const lightBtn = document.getElementById('theme-light');
    if (darkBtn) darkBtn.classList.toggle('active', t === 'dark');
    if (lightBtn) lightBtn.classList.toggle('active', t === 'light');
}

// ============================================================
//  AVATAR GRID RENDERER
// ============================================================
function renderAvatarGrid(containerId, selected, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    AVATARS.forEach(av => {
        const el = document.createElement('div');
        el.className = 'avatar-option' + (av === selected ? ' selected' : '');
        el.textContent = av;
        el.addEventListener('click', () => {
            container.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
            el.classList.add('selected');
            onSelect(av);
        });
        container.appendChild(el);
    });
}

// ============================================================
//  RENDER FUNCTIONS
// ============================================================
async function renderAll() {
    await renderChat();
    await renderAgendas();
    await renderMemories();
}

async function renderChat() {
    if (!chatMessages) return;
    chatMessages.innerHTML = '';
    const messages = await window.appDb.getMessages();
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.role}`;
        const formatted = msg.content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        div.innerHTML = `${formatted}<span class="msg-time">${time}</span>`;
        chatMessages.appendChild(div);
    });
    scrollBottom();
}

function scrollBottom() {
    setTimeout(() => { if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight; }, 50);
}

async function renderAgendas() {
    if (!agendaList) return;
    agendaList.innerHTML = '';
    const agendas = await window.appDb.getAgendas();

    if (!agendas.length) {
        agendaList.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
      No schedules yet. Tap + or tell Vivo!
    </div>`;
        return;
    }

    agendas.forEach(item => {
        const card = document.createElement('div');
        card.className = 'agenda-card';
        const timeStr = new Date(item.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        card.innerHTML = `
      <div class="agenda-info">
        <div class="agenda-title">${item.title}</div>
        <div class="agenda-time-span">
          <svg style="width:11px;height:11px;stroke:currentColor;fill:none" viewBox="0 0 24 24" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${timeStr} · ${item.duration}m
        </div>
      </div>
      <div class="agenda-actions">
        <span class="agenda-status-pill ${item.status}">${item.status}</span>
        ${item.status !== 'completed' ? `<button class="btn-card-action check" data-id="${item.id}" title="Done">
          <svg style="width:13px;height:13px;stroke:currentColor;fill:none" viewBox="0 0 24 24" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </button>` : ''}
        <button class="btn-card-action delete" data-id="${item.id}" title="Remove">
          <svg style="width:13px;height:13px;stroke:currentColor;fill:none" viewBox="0 0 24 24" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>`;

        const checkBtn = card.querySelector('.btn-card-action.check');
        if (checkBtn) checkBtn.addEventListener('click', async e => { e.stopPropagation(); await completeAgenda(item); });
        card.querySelector('.btn-card-action.delete').addEventListener('click', async e => { e.stopPropagation(); await window.appDb.deleteAgenda(item.id); renderAgendas(); });
        agendaList.appendChild(card);
    });
}

async function completeAgenda(item) {
    item.status = 'completed';
    await window.appDb.saveAgenda(item);
    await window.appDb.saveMemory({
        title: item.title,
        content: `Completed: "${item.title}" on ${new Date(item.time).toLocaleString()}. Duration: ${item.duration}m.`,
        type: 'achievement'
    });
    renderAgendas();
    await window.appDb.addMessage('assistant', `✅ "${item.title}" marked done! Saved to your Memory Park.`);
    renderChat();
}

async function renderMemories() {
    if (!bubbleContainer) return;
    bubbleContainer.innerHTML = '';
    const memories = await window.appDb.getMemories();

    if (!memories.length) {
        bubbleContainer.innerHTML = `<div class="empty-state" style="position:absolute;width:100%;top:38%;left:0">
      <svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
      No memories yet. Complete agenda items!
    </div>`;
        return;
    }

    memories.forEach((mem, i) => {
        const bubble = document.createElement('div');
        bubble.className = 'memory-bubble';
        const cols = 3, row = Math.floor(i / cols), col = i % cols;
        bubble.style.left = `${5 + col * 32 + Math.random() * 6}%`;
        bubble.style.top = `${row * 120 + 20 + Math.random() * 16}px`;
        const size = 80 + Math.min(mem.title.length * 1.4, 36);
        bubble.style.width = `${size}px`;
        bubble.style.height = `${size}px`;
        bubble.style.animationDelay = `${i * 0.35}s`;
        bubble.innerHTML = `<div class="memory-bubble-title">${mem.title}</div><div class="memory-bubble-type">${mem.type}</div>`;
        bubble.addEventListener('click', () => {
            activeMemoryId = mem.id;
            document.getElementById('memory-view-title').textContent = mem.title;
            document.getElementById('memory-view-date').textContent = `Captured: ${new Date(mem.date || Date.now()).toLocaleDateString()}`;
            document.getElementById('memory-view-content').textContent = mem.content;
            modalMemory.classList.add('active');
        });
        bubbleContainer.appendChild(bubble);
    });
}

// ============================================================
//  AGENDA MODAL
// ============================================================
function openAgendaModal() {
    modalAgenda.classList.add('active');
    const d = new Date(); d.setMinutes(d.getMinutes() + 10);
    const off = d.getTimezoneOffset();
    document.getElementById('agenda-input-time').value = new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

async function saveAgenda() {
    const title = document.getElementById('agenda-input-title').value.trim();
    const timeVal = document.getElementById('agenda-input-time').value;
    const duration = parseInt(document.getElementById('agenda-input-duration').value) || 30;
    if (!title || !timeVal) { alert('Fill in title and time.'); return; }

    const item = { title, time: timeVal, duration, status: 'pending', checkin_shown: false };
    await window.appDb.saveAgenda(item);
    modalAgenda.classList.remove('active');
    document.getElementById('agenda-input-title').value = '';
    document.getElementById('agenda-input-duration').value = '30';

    await renderAgendas();
    const display = new Date(timeVal).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    await window.appDb.addMessage('assistant', `📅 **${title}** added for ${display} (${duration}m). I'll alert you on time!`);
    await renderChat();
}

// ============================================================
//  SETTINGS
// ============================================================
async function loadSettings() {
    const useGemini = await window.appDb.getSetting('setting-use-gemini', false);
    document.getElementById('setting-use-gemini').checked = useGemini;
    geminiKeyWrap.style.display = useGemini ? 'flex' : 'none';
    document.getElementById('setting-gemini-key').value = await window.appDb.getSetting('setting-gemini-key', '');
    document.getElementById('setting-sound').checked = await window.appDb.getSetting('setting-sound', true);
    document.getElementById('setting-eod-time').value = await window.appDb.getSetting('setting-eod-time', '21:00');
    document.getElementById('setting-tomorrow-time').value = await window.appDb.getSetting('setting-tomorrow-time', '22:00');
    applyStoredTheme();
}

function bindSettings() {
    const pairs = [
        ['setting-gemini-key', 'setting-gemini-key'],
        ['setting-eod-time', 'setting-eod-time'],
        ['setting-tomorrow-time', 'setting-tomorrow-time']
    ];
    pairs.forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('blur', () => window.appDb.setSetting(key, el.value));
    });

    const geminiToggle = document.getElementById('setting-use-gemini');
    geminiToggle.addEventListener('change', async () => {
        await window.appDb.setSetting('setting-use-gemini', geminiToggle.checked);
        geminiKeyWrap.style.display = geminiToggle.checked ? 'flex' : 'none';
    });

    const soundToggle = document.getElementById('setting-sound');
    soundToggle.addEventListener('change', () => window.appDb.setSetting('setting-sound', soundToggle.checked));
}

// ============================================================
//  SMART RECURRING SUGGESTION ENGINE
// ============================================================
async function checkRecurringPatterns() {
    if (!currentUser || !window.appDb) return;
    const memories = await window.appDb.getMemories();
    const agendas = await window.appDb.getAgendas();

    // Count title frequency from memories
    const freq = {};
    memories.forEach(m => {
        const key = m.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        if (key) freq[key] = (freq[key] || 0) + 1;
    });

    // Find titles that appear 2+ times (recurring patterns)
    const todayTitles = agendas.map(a => a.title.toLowerCase());
    const recurring = Object.entries(freq)
        .filter(([k, c]) => c >= 2 && !todayTitles.some(t => t.includes(k)))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 1); // suggest at most 1 at a time

    if (recurring.length) {
        const [title] = recurring[0];
        const formatted = title.charAt(0).toUpperCase() + title.slice(1);
        await window.appDb.addMessage('assistant',
            `💡 You usually plan **${formatted}** regularly — but I don't see it today. Want me to schedule it?`
        );
        await renderChat();
    }
}

// Run pattern check once daily (10 min after launch)
setTimeout(checkRecurringPatterns, 10 * 60 * 1000);

// ============================================================
//  MESSAGE SUBMISSION
// ============================================================
async function submitMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    await window.appDb.addMessage('user', text);
    await renderChat();
    typingInd.style.display = 'flex';
    scrollBottom();

    setTimeout(async () => {
        try {
            const reply = await processResponse(text);
            await window.appDb.addMessage('assistant', reply);
        } catch (err) {
            await window.appDb.addMessage('assistant', `⚠️ Something went wrong. (${err.message})`);
        }
        typingInd.style.display = 'none';
        await renderChat();
        await renderAgendas();
    }, 900 + Math.random() * 400);
}

// ============================================================
//  AI RESPONSE ROUTING
// ============================================================
async function processResponse(userMsg) {
    const lower = userMsg.toLowerCase();
    const useGemini = await window.appDb.getSetting('setting-use-gemini', false);
    const geminiKey = await window.appDb.getSetting('setting-gemini-key', '');
    const name = currentUser?.username || 'there';

    // Check-in yes keywords → auto-complete last active agenda
    const yesWords = ['yes', 'yeah', 'did it', 'done', 'completed', 'yep', 'finished', 'sure', 'aye'];
    if (yesWords.some(k => lower.includes(k))) {
        const agendas = await window.appDb.getAgendas();
        const active = agendas.filter(a => a.status === 'active' || a.checkin_shown);
        if (active.length) {
            const last = active[active.length - 1];
            await completeAgenda(last);
            return `Well done, ${name}! 🎉 "${last.title}" saved to Memory Park.`;
        }
    }

    if (useGemini && geminiKey) return await callGemini(userMsg, geminiKey, name);
    return await localBot(userMsg, name);
}

// ============================================================
//  GEMINI API
// ============================================================
async function callGemini(userMsg, apiKey, name) {
    const agendas = await window.appDb.getAgendas();
    const pending = agendas.filter(a => a.status === 'pending')
        .map(a => `- "${a.title}" at ${new Date(a.time).toLocaleString()} (${a.duration}m)`).join('\n');

    const system = `You are Vivo, a friendly personal assistant. The user's name is ${name}.
Current time: ${new Date().toLocaleString()}.
Upcoming agendas:\n${pending || 'None yet.'}

Keep replies SHORT and friendly. If the user wants to schedule something, return ONLY raw JSON (no markdown):
{"reply":"...", "schedule":{"create":true,"title":"...","time":"YYYY-MM-DDTHH:MM","duration":30}}
Otherwise: {"reply":"...", "schedule":{"create":false}}`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: `${system}\n\nUser: "${userMsg}"` }] }] })
    });

    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    try {
        raw = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(raw);
        if (parsed.schedule?.create) {
            await window.appDb.saveAgenda({
                title: parsed.schedule.title,
                time: parsed.schedule.time,
                duration: parsed.schedule.duration || 30,
                status: 'pending', checkin_shown: false
            });
        }
        return parsed.reply;
    } catch {
        return raw;
    }
}

// ============================================================
//  LOCAL OFFLINE BOT
// ============================================================
async function localBot(userMsg, name) {
    const msg = userMsg.toLowerCase().trim();
    
    // Check if user is trying to schedule/remind
    if (!/(schedule|plan|add|remind|remind me to)/i.test(msg)) {
        return null; // Pass to AI if not a scheduling action
    }

    // Clean action prefixes to find the actual task title
    let title = userMsg.replace(/(schedule|plan|add|remind me to|remind me|remind)/i, "").trim();
    
    let targetDate = new Date();
    let timeFound = false;

    // Pattern A: Match relative times like "in 30 min", "in 2 hours"
    const relativeMatch = msg.match(/in\s+(\d+)\s*(min|minute|hour|hr)s?/i);
    
    // Pattern B: Match static times like "at 6pm", "at 18:30", "@ 5:15 am"
    const staticMatch = msg.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}:\d{2})/i);

    if (relativeMatch) {
        const amount = parseInt(relativeMatch[1], 10);
        const unit = relativeMatch[2].toLowerCase();
        
        if (unit.startsWith("min")) {
            targetDate.setMinutes(targetDate.getMinutes() + amount);
        } else if (unit.startsWith("hour") || unit.startsWith("hr")) {
            targetDate.setHours(targetDate.getHours() + amount);
        }
        
        // Clean the time phrasing out of the final task title
        title = title.replace(/in\s+\d+\s*(min|minute|hour|hr)s?/i, "").trim();
        timeFound = true;
    } else if (staticMatch) {
        let timeRaw = staticMatch[1].toLowerCase().trim();
        let hours = 0, minutes = 0;

        if (timeRaw.includes('am') || timeRaw.includes('pm')) {
            const isPm = timeRaw.includes('pm');
            const digits = timeRaw.replace(/(am|pm)/, '').trim();
            if (digits.includes(':')) {
                const parts = digits.split(':');
                hours = parseInt(parts[0], 10);
                minutes = parseInt(parts[1], 10);
            } else {
                hours = parseInt(digits, 10);
            }
            if (isPm && hours < 12) hours += 12;
            if (!isPm && hours === 12) hours = 0;
        } else {
            const parts = timeRaw.split(':');
            hours = parseInt(parts[0], 10);
            minutes = parseInt(parts[1], 10) || 0;
        }

        // Check if user specified tomorrow
        if (msg.includes("tomorrow")) {
            targetDate.setDate(targetDate.getDate() + 1);
        } else if (targetDate.getHours() > hours || (targetDate.getHours() === hours && targetDate.getMinutes() > minutes)) {
            // If time already passed today, assume tomorrow
            targetDate.setDate(targetDate.getDate() + 1);
        }

        targetDate.setHours(hours, minutes, 0, 0);
        title = title.replace(/(?:at|@)\s+.+$/i, "").replace(/today|tomorrow/i, "").trim();
        timeFound = true;
    }

    if (timeFound) {
        // Clean up remaining filler words from title
        title = title.replace(/^(to\s+)/i, "").trim();
        
        const offset = targetDate.getTimezoneOffset();
        const formattedTime = new Date(targetDate.getTime() - offset * 60000).toISOString().slice(0, 16);
        
        await window.appDb.saveAgenda({ 
            title: title || "Task Reminder", 
            time: formattedTime, 
            duration: 30, 
            status: 'pending', 
            checkin_shown: false 
        });

        const displayTime = targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const displayDay = targetDate.toDateString() === new Date().toDateString() ? "today" : "tomorrow";
        return `📅 Done! I've scheduled **${title}** for ${displayDay} at ${displayTime}.`;
    }

    return "I couldn't understand the time setup. Try saying: *'remind me to stop my movie at 6pm'* or *'schedule workout in 30 min'*";
}

    if (msg.match(/\b(hi|hello|hey|morning|afternoon|evening)\b/))
        return `Hey ${name}! What are we planning today?`;

    if (msg.match(/\b(how.*day|day.*go|feeling)\b/))
        return `Tell me — how's the day treating you, ${name}? 😊`;

    if (msg.match(/\bschedule|agenda|plan|office\b/))
        return `You can say *"schedule [task] at [time]"* or tap **+ Schedule** in the Office tab.`;

    if (msg.match(/\bpark|memor|bubble\b/))
        return `Your Memory Park holds completed agenda reflections. Complete tasks to grow new bubbles! 🫧`;

    if (msg.match(/\bwho are you|your name|what are you\b/))
        return `I'm **Vivo** — your daily planner and check-in companion. Enable Gemini AI in Settings for smarter conversations!`;

    return `Got it, ${name}. If you want to schedule something just say *"schedule [task] at [time]"*. I'll be here!`;
}
// Array of available audio alert choices
const audioTracks = {
    "Classic Bell": "assets/sounds/bell.mp3",
    "Digital Alarm": "assets/sounds/digital.mp3",
    "Soft Chime": "assets/sounds/chime.mp3"
};

// Check current task alert due times
async function checkPendingAgendas() {
    const allTasks = await window.appDb.getAgendas(); // Pulls active lists
    const nowStr = new Date().toISOString().slice(0, 16);
    
    allTasks.forEach(async (task) => {
        if (task.time === nowStr && !task.checkin_shown) {
            task.checkin_shown = true;
            await window.appDb.saveAgenda(task); // mark triggered
            
            // 1. Send system level banner notification
            triggerNativeNotification(task.title);
            
            // 2. Launch Full screen call style warning window
            showIncomingCallModal(task.title);
        }
    });
}
setInterval(checkPendingAgendas, 30000); // Check every 30 seconds

// Fixed Native Push Banner Trigger
function triggerNativeNotification(taskTitle) {
    if (Notification.permission === "granted") {
        navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification("Yours Vivo Alert!", {
                body: `Time to: ${taskTitle}`,
                icon: "icon-192.png",
                vibrate: [200, 100, 200],
                tag: "agenda-alert"
            });
        });
    }
}
