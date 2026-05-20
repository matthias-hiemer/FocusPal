// Default analysis prompt template. Shared between background.js and the popup.
// Users can customize this in Settings; placeholders {{url}} and {{title}} are
// substituted before the prompt is sent to the model.

var DEFAULT_ANALYSIS_PROMPT_TEMPLATE = `Analyze this webpage for its potential to distract me from focused work.

URL: {{url}}
Title: {{title}}

My focus context (customize this in Settings to match your own work):
- I do knowledge work that requires sustained concentration.
- Productive: documentation, work tools, learning resources for my field.
- Distracting: social feeds, entertainment, news scrolling, infinite-scroll content.

Respond in strict JSON format only:
{
    "productivityScore": (0-1.0, higher = clearly useful for my focused work),
    "distractionScore": (0-1.0, higher = likely to pull me into mindless browsing. A blank or still-loading tab is not a distraction.),
    "reasoning": "brief explanation of the scoring"
}

Reference scoring:
- Developer / professional tools (GitHub, Stack Overflow, internal docs): productivity 0.9-1.0, distraction 0.0-0.1
- Search engines (Google, Bing, DuckDuckGo): productivity 0.6, distraction 0.5
- Work communication (Email, Slack, Teams): productivity 0.8-0.9, distraction 0.1-0.2
- AI assistants (ChatGPT, Claude, Gemini): productivity 0.8-1.0, distraction 0.0-0.15
- Social / Entertainment home feeds (Reddit, YouTube, TikTok, Instagram, X): productivity 0.0-0.1, distraction 0.9-1.0
- Blank / loading pages: productivity 0.5, distraction 0.0
`;
