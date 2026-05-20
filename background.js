console.log("background script loaded");

const PRODUCTIVITY_THRESHOLD = 0.5;
const DISTRACTION_THRESHOLD = 0.7;
const ANALYSIS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RATE_LIMIT_MAX_CALLS = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const recentCallTimestamps = [];

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

async function callProvider(prompt) {
    const provider = await getProvider();
    if (provider === 'openai') return callOpenAI(prompt);
    throw new Error(`Unknown provider: ${provider}`);
}

async function analyzeURL(url, title) {
    const hostname = getHostname(url);
    const cached = await getCachedAnalysis(hostname);
    if (cached) {
        console.log('Using cached analysis for', hostname);
        return cached;
    }

    if (!rateLimitAllows()) {
        console.warn('FocusPal rate limit hit — skipping analysis for', url);
        return null;
    }

    const template = await getPromptTemplate();
    const prompt = renderPrompt(template, url, title);

    try {
        const analysis = await callProvider(prompt);
        await setCachedAnalysis(hostname, analysis);
        return analysis;
    } catch (error) {
        console.error('AI Analysis failed:', error.message || error);
        return null;
    }
}

async function isWithinActiveHours() {
    const result = await browser.storage.local.get(['activeTimeFrom', 'activeTimeTo', 'breakUntil']);
    
    // Check if we're on a break
    if (result.breakUntil) {
        const breakEndTime = parseInt(result.breakUntil);
        if (Date.now() < breakEndTime) {
            console.log('Currently on break until:', new Date(breakEndTime));
            return false;
        }
    }

    // Default times if not set
    const from = result.activeTimeFrom || '06:00';
    const to = result.activeTimeTo || '17:00';
    
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [fromHours, fromMinutes] = from.split(':').map(Number);
    const [toHours, toMinutes] = to.split(':').map(Number);
    
    const fromTime = fromHours * 60 + fromMinutes;
    const toTime = toHours * 60 + toMinutes;
    
    const isActive = currentTime >= fromTime && currentTime <= toTime;
    console.log('Time check:', { current: currentTime, from: fromTime, to: toTime, isActive });
    return isActive;
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
        
        // Check if URL is in blocklist first
        const isBlocked = blockedURLs.some(blocked => tab.url.includes(blocked.url));
        
        if (isBlocked) {
            // If URL is blocked, send message immediately
            browser.tabs.sendMessage(tabId, { 
                action: "checkPage", 
                blockedURLs: blockedURLs,
                analysis: null
            });
        } else {
            // If not blocked, perform AI analysis
            const analysis = await analyzeURL(tab.url, tab.title);
            const isDistracting = analysis && analysis.distractionScore > DISTRACTION_THRESHOLD;
            const isProductive = analysis && analysis.productivityScore > PRODUCTIVITY_THRESHOLD;
            // if is not productive and is distracting
            if (!isProductive && isDistracting) {
                browser.tabs.sendMessage(tabId, { 
                    action: "checkPage", 
                    blockedURLs: blockedURLs,
                    analysis: analysis
                });
            }
        }
    }
}

// Listen for tab updates
browser.tabs.onUpdated.addListener(handleTabUpdate);

// Add a new message handler for popup requests
browser.runtime.onMessage.addListener(async (message, sender) => {
    if (message.action === "analyzeCurrentTab") {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const currentTab = tabs[0];
        const analysis = await analyzeURL(currentTab.url, currentTab.title);
        return analysis; // This will be sent back to the popup
    }
});
