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
        '.github'
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
