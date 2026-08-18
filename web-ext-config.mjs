// Configuration for web-ext (build / lint / sign).
// The manifest.json is the single source of truth for the version number.

export default {
    // Repo files that must not end up inside the packaged XPI.
    // assets/stop.png is a 9 MB unused leftover — excluding it keeps the
    // package small without deleting it from version control.
    ignoreFiles: [
        'assets/stop.png',
        'package.json',
        'package-lock.json',
        'web-ext-config.mjs',
        '*.md',
        '.github',
        // Preview harness. _preview-stub.js replaces window.browser with a fake
        // storage backend, so shipping it would be actively harmful — the
        // exclusion matters more than the tidiness.
        'popup/_preview.html',
        'popup/_preview-stub.js',
        'tools'
    ],
    build: {
        overwriteDest: true
    },
    sign: {
        // Unlisted: signed by AMO for personal use, not published in the
        // public add-on directory.
        channel: 'unlisted'
    }
};
