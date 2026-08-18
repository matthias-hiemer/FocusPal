// Preview-only stub of the WebExtension APIs, so popup/index.html can be
// rendered in a normal browser tab for visual checks. Not shipped: excluded
// from the package in web-ext-config.mjs.
const previewStore = {
    activityLog: [
        { ts: Date.now() - 30000, host: 'reddit.com', title: 'Reddit - Dive into anything',
          decision: 'ai-blocked', source: 'api', provider: 'ollama',
          scores: { distraction: 0.9, productivity: 0.3 },
          reasoning: 'Infinite scroll feed with no relation to the stated focus context.' },
        { ts: Date.now() - 4 * 60000, host: 'reddit.com', title: 'r/rust',
          decision: 'negotiated', source: 'api', provider: 'ollama',
          negotiation: { reason: 'looking up the ownership docs thread', minutes: 5,
                         verdict: 'approved', message: 'Specific and scoped — five minutes.' } },
        { ts: Date.now() - 12 * 60000, host: 'github.com', title: 'matthias-hiemer/FocusPal',
          decision: 'ai-allowed', source: 'cache', provider: 'ollama',
          scores: { distraction: 0.05, productivity: 0.95 },
          reasoning: 'Developer tooling directly relevant to the work described.' },
        { ts: Date.now() - 40 * 60000, host: 'youtube.com', title: 'YouTube',
          decision: 'blocked-list' },
        { ts: Date.now() - 70 * 60000, host: 'news.ycombinator.com', title: 'Hacker News',
          decision: 'math-unblock', negotiation: { minutes: 5 } },
        { ts: Date.now() - 3 * 3600000, host: 'api.openai.com',
          decision: 'error', source: 'api', provider: 'openai',
          error: 'OpenAI error: You exceeded your current quota.' },
        { ts: Date.now() - 26 * 3600000, host: 'twitter.com', title: 'X',
          decision: 'rate-limited', provider: 'ollama' }
    ],
    blockedURLs: [{ url: 'youtube.com', icon: '/assets/focuspal.svg' }],
    whitelistedURLs: [{ url: 'github.com', icon: '/assets/focuspal.svg' }],
    activityLogEnabled: true,
    disableOnWeekends: true,
    aiProvider: 'ollama',
    ollamaModel: 'gemma4:12b'
};

window.browser = {
    storage: {
        local: {
            get: async (keys) => {
                const list = Array.isArray(keys) ? keys : [keys];
                const out = {};
                list.forEach(k => { if (previewStore[k] !== undefined) out[k] = previewStore[k]; });
                return out;
            },
            set: async (obj) => { Object.assign(previewStore, obj); },
            remove: async (keys) => {
                (Array.isArray(keys) ? keys : [keys]).forEach(k => delete previewStore[k]);
            }
        },
        onChanged: { addListener: () => {} }
    },
    tabs: {
        query: async () => [{ url: 'https://example.com/page', title: 'Example' }]
    },
    runtime: { sendMessage: async () => ({}) }
};
