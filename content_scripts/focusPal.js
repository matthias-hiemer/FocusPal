console.log("focusPal.js loaded");

const QUOTES = [
    "The successful warrior is the average person, with laser-like focus. - Bruce Lee",
    "Concentrate all your thoughts upon the work at hand. - Alexander Graham Bell",
    "What you stay focused on will grow. - Roy T. Bennett",
    "Focus on the journey, not the destination. - Greg Anderson",
    "Where focus goes, energy flows. - Tony Robbins",
    "The main thing is to keep the main thing the main thing. - Stephen Covey",
    "Focus is not about saying yes. Focus is about saying no. - Steve Jobs",
    "Success is not final, failure is not fatal: it is the courage to continue that counts. - Winston Churchill"
];

let originalContent = null;
let blockHost = null;
let overlayTimerId = null;

function getRandomQuote() {
    return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

function getScoreClass(score) {
    if (score < 0.3) return 'score-low';
    if (score < 0.7) return 'score-medium';
    return 'score-high';
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderInitialBlock(analysis) {
    const analysisBlock = analysis ? `
        <div class="analysis-card">
            <h2>AI Analysis Results</h2>
            <div class="score-grid">
                <div class="score-item">
                    <div class="score-circle ${getScoreClass(analysis.distractionScore)}">
                        ${Math.round(analysis.distractionScore * 100)}%
                    </div>
                    <label>Distraction Risk</label>
                </div>
                <div class="score-item">
                    <div class="score-circle ${getScoreClass(1 - analysis.productivityScore)}">
                        ${Math.round(analysis.productivityScore * 100)}%
                    </div>
                    <label>Productivity Score</label>
                </div>
            </div>
            <p class="analysis-reason">${escapeHtml(analysis.reasoning || '')}</p>
        </div>` : `
        <p class="blocked-message">This site is on your block list to help you stay focused.</p>`;

    return `
        <div class="focuspal-blocked" id="focuspal-root">
            <div class="blocked-content">
                <div class="blocked-header">
                    <svg class="focus-icon" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                    </svg>
                    <h1>Stay Focused!</h1>
                </div>
                <div class="motivation-quote">"${getRandomQuote()}"</div>
                ${analysisBlock}
                <div class="action-buttons">
                    <button id="fp-back" class="primary-btn">Back to Work</button>
                    <button id="fp-negotiate" class="secondary-btn">Negotiate access</button>
                    <button id="fp-math" class="warning-btn">Unblock anyway</button>
                </div>
            </div>
        </div>`;
}

function renderNegotiationView() {
    return `
        <div class="focuspal-blocked" id="focuspal-root">
            <div class="blocked-content">
                <h1 class="negotiation-title">What do you need this for?</h1>
                <p class="negotiation-help">
                    Be specific. Vague answers get a short window — that's the point.
                </p>
                <textarea id="fp-reason" class="negotiation-input" rows="4"
                    placeholder="e.g. 'looking up the Rust ownership docs', 'replying to a message from Sarah'"></textarea>
                <div class="action-buttons">
                    <button id="fp-cancel" class="secondary-btn">Cancel</button>
                    <button id="fp-submit-reason" class="primary-btn">Ask FocusPal</button>
                </div>
                <div id="fp-negotiation-result" class="negotiation-result" style="display:none;"></div>
            </div>
        </div>`;
}

function renderMathView() {
    const a = 10 + Math.floor(Math.random() * 90);
    const b = 10 + Math.floor(Math.random() * 90);
    const correct = a + b;

    return {
        html: `
        <div class="focuspal-blocked" id="focuspal-root">
            <div class="blocked-content">
                <h1 class="math-title">Are you sure?</h1>
                <p class="math-help">
                    Solve this, then wait 10 seconds. You'll get 5 minutes on this site.
                </p>
                <div class="math-problem">${a} + ${b} = <input id="fp-math-input"
                    type="number" inputmode="numeric" autocomplete="off" /></div>
                <div class="action-buttons">
                    <button id="fp-cancel" class="secondary-btn">Cancel</button>
                    <button id="fp-math-confirm" class="warning-btn" disabled>Wait…</button>
                </div>
                <p id="fp-math-feedback" class="math-feedback"></p>
            </div>
        </div>`,
        correct
    };
}

function restorePage() {
    if (originalContent !== null) {
        document.body.innerHTML = originalContent;
        originalContent = null;
    }
}

function installTimerOverlay(expiresAt) {
    if (overlayTimerId) clearInterval(overlayTimerId);
    const existing = document.getElementById('focuspal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'focuspal-overlay';
    overlay.className = 'focuspal-overlay';
    overlay.innerHTML = `
        <span class="focuspal-overlay-label">FocusPal</span>
        <span class="focuspal-overlay-time">--:--</span>
        <button class="focuspal-overlay-end" title="End early">×</button>
    `;
    document.documentElement.appendChild(overlay);

    overlay.querySelector('.focuspal-overlay-end').addEventListener('click', async () => {
        await endUnblockEarly();
    });

    function tick() {
        const remaining = Math.max(0, expiresAt - Date.now());
        const m = Math.floor(remaining / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        overlay.querySelector('.focuspal-overlay-time').textContent =
            `${m}:${s.toString().padStart(2, '0')}`;
        if (remaining <= 0) {
            clearInterval(overlayTimerId);
            overlayTimerId = null;
            overlay.remove();
            window.location.reload();
        }
    }
    tick();
    overlayTimerId = setInterval(tick, 1000);
}

async function endUnblockEarly() {
    if (!blockHost) return;
    const { temporaryUnblocks = {} } = await browser.storage.local.get('temporaryUnblocks');
    delete temporaryUnblocks[blockHost];
    await browser.storage.local.set({ temporaryUnblocks });
    window.location.reload();
}

function wireInitialButtons(analysis) {
    document.getElementById('fp-back').addEventListener('click', () => window.history.back());
    document.getElementById('fp-negotiate').addEventListener('click', () => showNegotiationView(analysis));
    document.getElementById('fp-math').addEventListener('click', () => showMathView(analysis));
}

function showInitial(analysis) {
    document.body.innerHTML = renderInitialBlock(analysis);
    wireInitialButtons(analysis);
}

function showNegotiationView(analysis) {
    document.body.innerHTML = renderNegotiationView();
    document.getElementById('fp-cancel').addEventListener('click', () => showInitial(analysis));
    const submit = document.getElementById('fp-submit-reason');
    submit.addEventListener('click', async () => {
        const reason = document.getElementById('fp-reason').value.trim();
        if (!reason) {
            renderNegotiationResult({ error: 'Tell me what you need it for.' });
            return;
        }
        submit.disabled = true;
        submit.textContent = 'Thinking…';
        const result = await browser.runtime.sendMessage({
            action: 'negotiateUnblock',
            url: window.location.href,
            title: document.title,
            reason
        });
        submit.disabled = false;
        submit.textContent = 'Ask FocusPal';
        renderNegotiationResult(result);
        if (result && !result.error) {
            setTimeout(() => {
                restorePage();
                installTimerOverlay(result.expiresAt);
            }, 1800);
        }
    });
}

function renderNegotiationResult(result) {
    const el = document.getElementById('fp-negotiation-result');
    if (!el) return;
    el.style.display = 'block';
    if (result.error) {
        el.className = 'negotiation-result error';
        el.textContent = result.error === 'rate-limited'
            ? 'Rate limited — wait a moment and try again.'
            : `Something went wrong: ${result.error}`;
        return;
    }
    el.className = `negotiation-result verdict-${result.verdict || 'skeptical'}`;
    el.innerHTML = `
        <div class="verdict-line">
            <strong>${result.minutes} minute${result.minutes === 1 ? '' : 's'}</strong>
            <span class="verdict-tag">${result.verdict}</span>
        </div>
        <p class="verdict-message">${escapeHtml(result.message)}</p>
    `;
}

function showMathView(analysis) {
    const { html, correct } = renderMathView();
    document.body.innerHTML = html;
    document.getElementById('fp-cancel').addEventListener('click', () => showInitial(analysis));

    const input = document.getElementById('fp-math-input');
    const confirm = document.getElementById('fp-math-confirm');
    const feedback = document.getElementById('fp-math-feedback');
    let cooldownTimerId = null;
    let solved = false;

    function startCooldown() {
        solved = true;
        feedback.textContent = 'Correct. Cooldown…';
        feedback.className = 'math-feedback ok';
        let remaining = 10;
        confirm.textContent = `Wait ${remaining}…`;
        cooldownTimerId = setInterval(() => {
            remaining -= 1;
            if (remaining > 0) {
                confirm.textContent = `Wait ${remaining}…`;
            } else {
                clearInterval(cooldownTimerId);
                confirm.disabled = false;
                confirm.textContent = 'Confirm unlock (5 min)';
            }
        }, 1000);
    }

    input.addEventListener('input', () => {
        if (solved) return;
        const val = parseInt(input.value, 10);
        if (val === correct) {
            startCooldown();
        }
    });

    confirm.addEventListener('click', async () => {
        if (confirm.disabled) return;
        const result = await browser.runtime.sendMessage({
            action: 'mathUnblock',
            url: window.location.href
        });
        restorePage();
        installTimerOverlay(result.expiresAt);
    });
}

function getHostname(url) {
    try { return new URL(url).hostname; } catch (e) { return null; }
}

async function showOverlayIfAlreadyUnblocked() {
    const host = getHostname(window.location.href);
    if (!host) return false;
    const { temporaryUnblocks = {} } = await browser.storage.local.get('temporaryUnblocks');
    const entry = temporaryUnblocks[host];
    if (entry && Date.now() < entry.expiresAt) {
        installTimerOverlay(entry.expiresAt);
        return true;
    }
    return false;
}

browser.runtime.onMessage.addListener((message) => {
    if (message.action !== "checkPage") return;
    const currentURL = window.location.href;
    const blockedURLs = message.blockedURLs || [];
    const analysis = message.analysis;

    const isBlocked = blockedURLs.some(blocked => currentURL.includes(blocked.url));
    const isDistracting = analysis && analysis.distractionScore > 0.7;

    if (isBlocked || isDistracting) {
        blockHost = getHostname(currentURL);
        originalContent = document.body.innerHTML;
        showInitial(analysis);
    }
});

// On every page load, if there's an active unblock for this host, show the
// timer overlay so the user always knows how much grace time remains.
showOverlayIfAlreadyUnblocked();
