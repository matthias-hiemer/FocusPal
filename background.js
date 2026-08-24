console.log("background script loaded");

const PRODUCTIVITY_THRESHOLD = 0.5;
const DISTRACTION_THRESHOLD = 0.7;
const ANALYSIS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RATE_LIMIT_MAX_CALLS = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const ACTIVITY_LOG_MAX_ENTRIES = 100;
const ACTIVITY_TITLE_MAX = 80;
const ACTIVITY_REASONING_MAX = 240;

const recentCallTimestamps = [];

// Appending is a read-modify-write on one array, and several tabs can finish
// loading at the same moment. Chaining the writes keeps concurrent appends from
// reading the same snapshot and dropping each other's entries.
let activityWriteQueue = Promise.resolve();

function truncate(value, max) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

async function isActivityLogEnabled() {
    const { activityLogEnabled } = await browser.storage.local.get('activityLogEnabled');
    return activityLogEnabled !== false;
}

function logActivity(entry) {
    activityWriteQueue = activityWriteQueue.then(async () => {
        try {
            if (!await isActivityLogEnabled()) return;
            const { activityLog = [] } = await browser.storage.local.get('activityLog');
            activityLog.unshift({ ts: Date.now(), ...entry });
            await browser.storage.local.set({
                activityLog: activityLog.slice(0, ACTIVITY_LOG_MAX_ENTRIES)
            });
        } catch (error) {
            // Logging must never break the blocking path.
            console.error('Failed to write activity entry:', error);
        }
    });
    return activityWriteQueue;
}

function rateLimitAllows() {
    const now = Date.now();
    while (recentCallTimestamps.length && now - recentCallTimestamps[0] > RATE_LIMIT_WINDOW_MS) {
        recentCallTimestamps.shift();
    }
    if (recentCallTimestamps.length >= RATE_LIMIT_MAX_CALLS) {
        return false;
    }
    recentCallTimestamps.push(now);
    return true;
}

function getHostname(url) {
    try {
        return new URL(url).hostname;
    } catch (e) {
        return null;
    }
}

async function getCachedAnalysis(hostname) {
    if (!hostname) return null;
    const { analysisCache = {} } = await browser.storage.local.get('analysisCache');
    const entry = analysisCache[hostname];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) return null;
    return entry.analysis;
}

async function setCachedAnalysis(hostname, analysis) {
    if (!hostname || !analysis) return;
    const { analysisCache = {} } = await browser.storage.local.get('analysisCache');
    analysisCache[hostname] = {
        analysis,
        expiresAt: Date.now() + ANALYSIS_CACHE_TTL_MS
    };
    await browser.storage.local.set({ analysisCache });
}

async function getTemporaryUnblock(hostname) {
    if (!hostname) return null;
    const { temporaryUnblocks = {} } = await browser.storage.local.get('temporaryUnblocks');
    const entry = temporaryUnblocks[hostname];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) return null;
    return entry;
}

async function setTemporaryUnblock(hostname, minutes, source) {
    if (!hostname) return null;
    const { temporaryUnblocks = {} } = await browser.storage.local.get('temporaryUnblocks');
    const expiresAt = Date.now() + minutes * 60 * 1000;
    temporaryUnblocks[hostname] = { expiresAt, source, minutes };
    await browser.storage.local.set({ temporaryUnblocks });
    return expiresAt;
}

async function getBlockedURLs() {
    try {
        const result = await browser.storage.local.get('blockedURLs');
        return result.blockedURLs || [];
    } catch (error) {
        console.error('Error getting blocked URLs:', error);
        return [];
    }
}

async function getWhitelistedURLs() {
    const result = await browser.storage.local.get('whitelistedURLs');
    return result.whitelistedURLs || [];
}

async function getApiKey() {
    const result = await browser.storage.local.get('openaiApiKey');
    return result.openaiApiKey;
}

async function getPromptTemplate() {
    const result = await browser.storage.local.get('analysisPromptTemplate');
    return result.analysisPromptTemplate || DEFAULT_ANALYSIS_PROMPT_TEMPLATE;
}

function renderPrompt(template, url, title) {
    return template
        .replaceAll('{{url}}', url || '')
        .replaceAll('{{title}}', title || '');
}

async function getProvider() {
    const { aiProvider } = await browser.storage.local.get('aiProvider');
    return aiProvider || 'openai';
}

async function callOpenAI(prompt) {
    const apiKey = await getApiKey();
    if (!apiKey) {
        throw new Error('No OpenAI API key configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`OpenAI error: ${error.error?.message || response.status}`);
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
}

async function callOllama(prompt) {
    const { ollamaBaseUrl, ollamaModel } = await browser.storage.local.get([
        'ollamaBaseUrl',
        'ollamaModel'
    ]);
    const baseUrl = (ollamaBaseUrl || 'http://localhost:11434').replace(/\/+$/, '');
    const model = ollamaModel || 'llama3.2';

    const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            format: 'json',
            stream: false,
            // Reasoning models (gemma4, deepseek-r1, qwen3) otherwise emit a long
            // chain of thought before the JSON, which took over two minutes for a
            // verdict that takes seconds without it. Harmless for models that
            // have no thinking capability — they simply ignore it.
            think: false,
            options: { temperature: 0.2 }
        })
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Ollama error ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.message?.content;
    if (!content) {
        throw new Error('Ollama returned no message content');
    }
    return JSON.parse(content);
}

async function callProvider(prompt) {
    const provider = await getProvider();
    if (provider === 'openai') return callOpenAI(prompt);
    if (provider === 'ollama') return callOllama(prompt);
    throw new Error(`Unknown provider: ${provider}`);
}

// Returns { analysis, source, error }. Callers need the source to tell a cache
// hit from a real provider call — without it there is no way to see from the
// outside whether a request was actually made.
async function analyzeURL(url, title) {
    const hostname = getHostname(url);
    const cached = await getCachedAnalysis(hostname);
    if (cached) {
        console.log('Using cached analysis for', hostname);
        return { analysis: cached, source: 'cache', error: null };
    }

    if (!rateLimitAllows()) {
        console.warn('FocusPal rate limit hit — skipping analysis for', url);
        return { analysis: null, source: null, error: 'rate-limited' };
    }

    const template = await getPromptTemplate();
    const prompt = renderPrompt(template, url, title);

    try {
        const analysis = await callProvider(prompt);
        await setCachedAnalysis(hostname, analysis);
        return { analysis, source: 'api', error: null };
    } catch (error) {
        const message = error.message || String(error);
        console.error('AI Analysis failed:', message);
        return { analysis: null, source: 'api', error: message };
    }
}

async function isWithinActiveHours() {
    const result = await browser.storage.local.get([
        'activeTimeFrom', 'activeTimeTo', 'breakUntil', 'disableOnWeekends'
    ]);

    // Check if we're on a break
    if (result.breakUntil) {
        const breakEndTime = parseInt(result.breakUntil);
        if (Date.now() < breakEndTime) {
            console.log('Currently on break until:', new Date(breakEndTime));
            return false;
        }
    }

    const now = new Date();

    // Weekend off (default on)
    const disableOnWeekends = result.disableOnWeekends !== false;
    const day = now.getDay(); // 0 = Sun, 6 = Sat
    if (disableOnWeekends && (day === 0 || day === 6)) {
        console.log('Weekend — focus mode off');
        return false;
    }

    // Default times if not set
    const from = result.activeTimeFrom || '06:00';
    const to = result.activeTimeTo || '17:00';

    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [fromHours, fromMinutes] = from.split(':').map(Number);
    const [toHours, toMinutes] = to.split(':').map(Number);
    
    const fromTime = fromHours * 60 + fromMinutes;
    const toTime = toHours * 60 + toMinutes;
    
    const isActive = currentTime >= fromTime && currentTime <= toTime;
    console.log('Time check:', { current: currentTime, from: fromTime, to: toTime, isActive });
    return isActive;
}

// Sends the block instruction, but only if the site is still blocked *now*.
// Several seconds can pass between deciding to block and getting here, because
// the AI analysis is awaited in between, and the user may have been granted a
// temporary unblock during that window. Re-reading storage at the moment of
// sending is what keeps a stale decision from overriding a fresh grant.
// Returns whether the block was actually sent.
async function sendBlockMessage(tabId, hostname, payload) {
    if (await getTemporaryUnblock(hostname)) {
        console.log('Unblock granted while analyzing — not blocking', hostname);
        return false;
    }
    browser.tabs.sendMessage(tabId, { action: "checkPage", ...payload });
    return true;
}

async function handleTabUpdate(tabId, changeInfo, tab) {
    if (changeInfo.status === "complete") {
        // Check if we're within active hours
        if (!await isWithinActiveHours()) {
            return;
        }
        
        console.log("Analyzing page:", tab.url);
        
        // Get blocked URLs first
        const blockedURLs = await getBlockedURLs();
        const whitelistedURLs = await getWhitelistedURLs();
        
        // Check if URL is whitelisted first
        const isWhitelisted = whitelistedURLs.some(allowed => tab.url.includes(allowed.url));
        if (isWhitelisted) {
            console.log('URL is whitelisted:', tab.url);
            return;
        }

        // Honor any active temporary unblock for this hostname
        const hostname = getHostname(tab.url);
        const unblock = await getTemporaryUnblock(hostname);
        if (unblock) {
            console.log('Temporary unblock active for', hostname, 'until', new Date(unblock.expiresAt));
            return;
        }
        
        // Check if URL is in blocklist first
        const isBlocked = blockedURLs.some(blocked => tab.url.includes(blocked.url));
        
        const title = truncate(tab.title, ACTIVITY_TITLE_MAX);

        if (isBlocked) {
            // If URL is blocked, send message immediately
            const sent = await sendBlockMessage(tabId, hostname, {
                blockedURLs: blockedURLs,
                analysis: null
            });
            if (sent) {
                logActivity({ host: hostname, title, decision: 'blocked-list' });
            }
        } else {
            // If not blocked, perform AI analysis
            const { analysis, source, error } = await analyzeURL(tab.url, tab.title);
            const provider = await getProvider();

            if (error) {
                logActivity({
                    host: hostname,
                    title,
                    decision: error === 'rate-limited' ? 'rate-limited' : 'error',
                    source,
                    provider,
                    error: error === 'rate-limited' ? null : truncate(error, ACTIVITY_REASONING_MAX)
                });
                return;
            }

            const isDistracting = analysis && analysis.distractionScore > DISTRACTION_THRESHOLD;
            const isProductive = analysis && analysis.productivityScore > PRODUCTIVITY_THRESHOLD;
            // if is not productive and is distracting
            const wouldBlock = !isProductive && isDistracting;

            if (wouldBlock) {
                const sent = await sendBlockMessage(tabId, hostname, {
                    blockedURLs: blockedURLs,
                    analysis: analysis
                });
                // Suppressed by a grant that landed mid-analysis. Nothing is logged:
                // this is a page load inside an active grace period, which is not
                // recorded either.
                if (!sent) return;
            }

            if (analysis) {
                logActivity({
                    host: hostname,
                    title,
                    decision: wouldBlock ? 'ai-blocked' : 'ai-allowed',
                    source,
                    provider,
                    scores: {
                        distraction: analysis.distractionScore,
                        productivity: analysis.productivityScore
                    },
                    reasoning: truncate(analysis.reasoning, ACTIVITY_REASONING_MAX)
                });
            }
        }
    }
}

// Listen for tab updates
browser.tabs.onUpdated.addListener(handleTabUpdate);

async function getNegotiationTemplate() {
    const { negotiationPromptTemplate } = await browser.storage.local.get('negotiationPromptTemplate');
    return negotiationPromptTemplate || DEFAULT_NEGOTIATION_PROMPT_TEMPLATE;
}

function renderNegotiationPrompt(template, url, title, reason) {
    return template
        .replaceAll('{{url}}', url || '')
        .replaceAll('{{title}}', title || '')
        .replaceAll('{{reason}}', reason || '');
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

async function negotiateUnblock(url, title, reason) {
    if (!rateLimitAllows()) {
        return { error: 'rate-limited' };
    }
    const template = await getNegotiationTemplate();
    const prompt = renderNegotiationPrompt(template, url, title, reason);

    const hostname = getHostname(url);
    const shortTitle = truncate(title, ACTIVITY_TITLE_MAX);

    try {
        const result = await callProvider(prompt);
        const minutes = clamp(parseInt(result.minutes, 10) || 1, 1, 10);
        const verdict = result.verdict || 'skeptical';
        const grantMessage = result.message
            || `Granted ${minutes} minute${minutes === 1 ? '' : 's'}.`;
        const expiresAt = await setTemporaryUnblock(hostname, minutes, 'negotiation');

        logActivity({
            host: hostname,
            title: shortTitle,
            decision: 'negotiated',
            source: 'api',
            provider: await getProvider(),
            negotiation: {
                reason: truncate(reason, ACTIVITY_REASONING_MAX),
                minutes,
                verdict,
                message: truncate(grantMessage, ACTIVITY_REASONING_MAX)
            }
        });

        return { minutes, verdict, message: grantMessage, expiresAt };
    } catch (error) {
        const message = error.message || 'negotiation-failed';
        console.error('Negotiation failed:', message);
        logActivity({
            host: hostname,
            title: shortTitle,
            decision: 'error',
            source: 'api',
            provider: await getProvider(),
            error: truncate(message, ACTIVITY_REASONING_MAX),
            negotiation: { reason: truncate(reason, ACTIVITY_REASONING_MAX) }
        });
        return { error: message };
    }
}

async function mathUnblock(url) {
    const hostname = getHostname(url);
    const minutes = 5;
    const expiresAt = await setTemporaryUnblock(hostname, minutes, 'math');
    logActivity({ host: hostname, decision: 'math-unblock', negotiation: { minutes } });
    return { minutes, expiresAt };
}

// Add a new message handler for popup and content-script requests
browser.runtime.onMessage.addListener(async (message, sender) => {
    if (message.action === "analyzeCurrentTab") {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const currentTab = tabs[0];
        // Unwrapped: this handler's callers expect the bare analysis object.
        const { analysis } = await analyzeURL(currentTab.url, currentTab.title);
        return analysis;
    }
    if (message.action === "negotiateUnblock") {
        return negotiateUnblock(message.url, message.title, message.reason);
    }
    if (message.action === "mathUnblock") {
        return mathUnblock(message.url);
    }
});
