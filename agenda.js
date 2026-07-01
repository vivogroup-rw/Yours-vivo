// ============================================================
//  Yours Vivo — Proactive Scheduler (agenda.js v2)
// ============================================================

class AgendaScheduler {
    constructor() {
        this.intervalId = null;
        this.audioCtx = null;
        this.lastEod = null;
        this.lastTmr = null;
    }

    start() {
        console.log('[Vivo] Scheduler started');
        window.appDb.getSetting('lastEodPromptDate').then(v => this.lastEod = v);
        window.appDb.getSetting('lastTomPromptDate').then(v => this.lastTmr = v);
        this.intervalId = setInterval(() => this.tick(), 5000);
    }

    stop() {
        if (this.intervalId) clearInterval(this.intervalId);
    }

    chime() {
        try {
            if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const ctx = this.audioCtx;
            const now = ctx.currentTime;
            [[880, 1320, 0, 0.6, 0.12], [440, 554, 0.1, 0.8, 0.08]].forEach(([f1, f2, delay, stop, vol]) => {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'sine';
                o.frequency.setValueAtTime(f1, now + delay);
                o.frequency.exponentialRampToValueAtTime(f2, now + delay + 0.15);
                g.gain.setValueAtTime(vol, now + delay);
                g.gain.exponentialRampToValueAtTime(0.001, now + stop);
                o.connect(g); g.connect(ctx.destination);
                o.start(now + delay); o.stop(now + stop);
            });
        } catch (e) { /* silent fail before user interaction */ }
    }

    showBanner(title, body) {
        const b = document.getElementById('notification-banner');
        const tEl = document.getElementById('notif-title');
        const dEl = document.getElementById('notif-desc');
        if (!b) return;
        tEl.textContent = title;
        dEl.textContent = body;
        b.classList.add('active');
        setTimeout(() => b.classList.remove('active'), 6000);
    }

    async tick() {
        if (!window.appDb?.db) return;
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().substring(0, 5);
        const user = window.getCurrentUser?.()?.username || 'there';

        const sound = await window.appDb.getSetting('setting-sound', true);
        const eodTime = await window.appDb.getSetting('setting-eod-time', '21:00');
        const tmrTime = await window.appDb.getSetting('setting-tomorrow-time', '22:00');
        const agendas = await window.appDb.getAgendas();

        for (const item of agendas) {
            const start = new Date(item.time);
            const diffMs = now - start;

            // ── Agenda just started ─────────────────────────────
            if (item.status === 'pending' && diffMs >= 0 && diffMs < 30000) {
                item.status = 'active';
                await window.appDb.saveAgenda(item);
                if (sound) this.chime();
                this.showBanner('Time to start!', item.title);
                await window.appDb.addMessage('assistant',
                    `⏰ **${item.title}** is starting now, ${user}! Good luck — I'll check in once you're done.`
                );
                if (window.refreshChatUI) { window.refreshChatUI(); window.scrollToChatBottom?.(); }
                if (window.refreshOfficeUI) window.refreshOfficeUI();
            }

            // ── Duration elapsed — check-in ─────────────────────
            const endTime = new Date(start.getTime() + (item.duration || 30) * 60000);
            if (item.status === 'active' && now >= endTime && !item.checkin_shown) {
                item.checkin_shown = true;
                await window.appDb.saveAgenda(item);
                if (sound) this.chime();
                await window.appDb.addMessage('assistant',
                    `👋 **${item.title}** should be done by now. Did you complete it, ${user}?`
                );
                if (window.refreshChatUI) { window.refreshChatUI(); window.scrollToChatBottom?.(); }
            }
        }

        // ── End of day review ───────────────────────────────────
        if (timeStr === eodTime && this.lastEod !== todayStr) {
            this.lastEod = todayStr;
            await window.appDb.setSetting('lastEodPromptDate', todayStr);
            if (sound) this.chime();
            await window.appDb.addMessage('assistant',
                `🌙 Evening, ${user}! How did your day go? Anything worth adding to Memory Park?`
            );
            if (window.refreshChatUI) { window.refreshChatUI(); window.scrollToChatBottom?.(); }
        }

        // ── Tomorrow planning ───────────────────────────────────
        if (timeStr === tmrTime && this.lastTmr !== todayStr) {
            this.lastTmr = todayStr;
            await window.appDb.setSetting('lastTomPromptDate', todayStr);
            if (sound) this.chime();
            await window.appDb.addMessage('assistant',
                `📅 What's on tomorrow's agenda, ${user}? Tell me and I'll schedule it right away.`
            );
            if (window.refreshChatUI) { window.refreshChatUI(); window.scrollToChatBottom?.(); }
        }
    }
}

window.agendaScheduler = new AgendaScheduler();
