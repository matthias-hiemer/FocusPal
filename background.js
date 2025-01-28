console.log("background script loaded");

const ANALYSIS_THRESHOLD = 0.7;

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

async function handleTabUpdate(tabId, changeInfo, tab) {
    // Only analyze when the page has finished loading
    if (changeInfo.status === "complete") {
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
            const isDistracting = analysis && analysis.distractionScore > ANALYSIS_THRESHOLD;
            const isProductive = analysis && analysis.productivityScore > ANALYSIS_THRESHOLD;
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
