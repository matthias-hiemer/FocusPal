console.log("background script loaded");

const PRODUCTIVITY_THRESHOLD = 0.5;
const DISTRACTION_THRESHOLD = 0.7;

async function getBlockedURLs() {
    try {
        const result = await browser.storage.local.get('blockedURLs');
        return result.blockedURLs || [];
    } catch (error) {
        console.error('Error getting blocked URLs:', error);
        return [];
    }
}

async function getApiKey() {
    const result = await browser.storage.local.get('openaiApiKey');
    return result.openaiApiKey;
}

async function analyzeURL(url, title) {
    const apiKey = await getApiKey();
    if (!apiKey) {
        console.error('No API key configured');
        return null;
    }

    const prompt = `Analyze this webpage for its potential to distract a software developer:
URL: ${url}
Title: ${title}

Rate on these factors (respond in JSON format only):
{
    "productivityScore": (0-1.0, how relevant is this to software development work. btw: chatGpt is a productivity tool, also googling things is a productivity tool),
    "distractionScore": (0-1.0, how likely to cause distraction),
    "reasoning": "brief explanation of the scoring"
}`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [{
                    role: "user",
                    content: prompt
                }],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('API Error:', error);
            return null;
        }

        const data = await response.json();
        return JSON.parse(data.choices[0].message.content);
    } catch (error) {
        console.error('AI Analysis failed:', error);
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
