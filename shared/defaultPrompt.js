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

// Negotiation prompt: the user is blocked from a site and is asking for a
// timed unblock with a stated reason. The model decides how generous to be.
var DEFAULT_NEGOTIATION_PROMPT_TEMPLATE = `The user is currently blocked from a distracting website and is requesting a temporary unblock.

URL: {{url}}
Title: {{title}}
User's stated reason: "{{reason}}"

Your job: grant the user between 1 and 10 minutes of access, based on how plausible and specific the reason is. You are friendly but skeptical — the user already chose to block this site, so they explicitly want resistance to mindless visits.

Guidance:
- Vague or generic reasons ("kurz schauen", "just a quick look", "I'm bored", empty/very short reasons) → 1 minute. Strong cooldown beats outright denial; the user feels heard but barely rewarded.
- Plausible but unspecific work reasons ("checking something", "for research") → 2-3 minutes.
- Specific, scoped tasks ("looking up the docs for X", "replying to a message from Y", "watching one tutorial on Z") → 4-7 minutes.
- Clear, time-bounded work needs with explicit scope → up to 10 minutes.
- If the reason is clearly a rationalization for distraction (e.g. "I deserve a break", "just five minutes"), grant 1 minute anyway and call it out in the message.

Respond in strict JSON format only:
{
    "minutes": (integer, 1-10),
    "verdict": "approved" | "skeptical" | "indulgent",
    "message": "one short, direct sentence to the user in second person — friendly, honest, no fluff"
}
`;

