# Installing FocusPal permanently

Loading the extension via `about:debugging` works, but Firefox drops temporary
add-ons on every restart. For a permanent install, Firefox Release requires a
**signed** package. Mozilla signs add-ons for free, including "unlisted" ones
that are never published in the public add-on directory.

## One-time setup

1. Install the build tooling:

   ```bash
   npm install
   ```

2. Create AMO API credentials at
   <https://addons.mozilla.org/developers/addon/api/key/>
   (requires a free Mozilla account). You get a **JWT issuer** (key) and a
   **JWT secret**.

3. Keep them out of the repo — export them in your shell instead:

   ```bash
   export WEB_EXT_API_KEY="user:12345678:123"
   export WEB_EXT_API_SECRET="your-secret-here"
   ```

   Put those two lines in `~/.zshrc` if you want them to persist.

## Build a signed XPI

```bash
npm run sign
```

This uploads the package to AMO, waits for automated signing, and drops the
signed file in `web-ext-artifacts/`. It usually takes under a minute.

The `unlisted` channel is preconfigured in `web-ext-config.mjs`, so the add-on
is signed for personal use and does not appear in the public directory.

## Install it

1. Open `about:addons`
2. Gear icon → **Install Add-on From File…**
3. Pick the signed `.xpi` from `web-ext-artifacts/`

It now survives restarts.

## Shipping an update

AMO rejects re-uploads of a version it has already signed, so bump the version
first:

1. Edit `version` in `manifest.json` (e.g. `1.1.0` → `1.1.1`)
2. `npm run sign`
3. Install the new XPI over the old one — settings are preserved because the
   extension ID stays the same

**Never change `browser_specific_settings.gecko.id`.** Firefox keys the
installed add-on and all its stored settings (block list, API key, prompt) to
that ID; changing it orphans the existing install.

## Other commands

```bash
npm run lint    # AMO validation — must report 0 errors before signing
npm run build   # unsigned package, for inspecting the contents
npm start       # launch a scratch Firefox with the add-on loaded, auto-reloads on edit
```

## Alternative: skip signing entirely

Firefox **Developer Edition** and **Nightly** can install unsigned add-ons:
set `xpinstall.signatures.required` to `false` in `about:config`, then install
the unsigned package from `npm run build`. This does **not** work on Firefox
Release or Beta.
