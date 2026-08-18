# FocusPal

## What is FocusPal?

FocusPal is a Firefox extension that blocks distracting sites and helps users stay focused!


<img width="640" alt="FocusPal AI" src="https://github.com/ossd-s24/FocusPal/assets/62906996/e96c3c11-4cb0-4a90-b918-4258e29ea4b6">

## Features

**Blocking**
- Block the site you are currently on, or any site by URL
- Allow list for sites that must never be blocked
- Active hours, with weekends off by default
- 15-minute break timer

**AI distraction analysis**
- Scores every page for distraction and productivity, and blocks the bad ones
- Runs against **OpenAI** (`gpt-4o-mini`) or a **local Ollama** model
- The analysis prompt is editable in Settings, so the scoring matches your work
- Results are cached per domain for 7 days and rate limited to 10 calls/minute

**Activity log**
- An Activity tab records every decision: which site, what the model scored it,
  whether the verdict came from the cache or a real provider call, and what you
  negotiated
- Filter by blocked / allowed / issues, expand an entry for the model's reasoning
- Keeps the last 100 entries, stores only hostnames, and can be turned off in
  Settings

**Friction instead of a bypass button**
- *Negotiate access* — say what you need the site for, and the AI grants
  1–10 minutes depending on how specific your reason is
- *Unblock anyway* — solve a math problem, wait out a 10-second cooldown,
  get 5 minutes
- A countdown badge shows the remaining time and can end it early

## Installation

For a permanent install that survives Firefox restarts, see
[INSTALL.md](INSTALL.md).

To try it out temporarily:

1. Clone the repository on your machine
2. Open Firefox and enter "about:debugging" in the address bar
3. Click on the "This Firefox" tab (left sidebar)
4. Click on the "Load Temporary Add-on" button
5. Choose the manifest.json file

Firefox removes temporary add-ons when it restarts.

## Development

```bash
npm run preview
```

Generates `popup/_preview.html` from the real `popup/index.html` and serves the
project, so the popup can be checked at
<http://localhost:8731/popup/_preview.html> without reloading the extension in
Firefox. `popup/_preview-stub.js` supplies fake `browser.*` APIs and sample
activity entries covering every decision type.

`_preview.html` is generated on every run — edit `popup/index.html` instead.
Both preview files are excluded from the packaged XPI. This covers the popup
only; the block page and background script still need a real Firefox session.

## Setup

Open the extension popup and go to **Settings**:

- Pick an **AI provider**. Ollama needs no API key and keeps every request on
  your machine; if it rejects requests, start it with
  `OLLAMA_ORIGINS="moz-extension://*" ollama serve`.
- For OpenAI, paste an API key. It is stored locally and shown masked afterwards.
- Adapt the **analysis prompt** to describe your own work — it is the single
  biggest lever on classification quality.

## Contributors 

We welcome contributors of all levels to help us make FocusPal better! Please read the [Contribution Guide](CONTRIBUTING.md) for more information. Thank you for making FocusPal awesome!

## Code of Conduct

Please read the [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## License 

FocusPal is open-source software and is licensed under the MIT License. Refer to the [LICENSE](LICENSE) file for more details.
