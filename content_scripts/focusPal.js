console.log("focusPal.js loaded");

function createBlockedPage(analysis) {
    console.log("Creating blocked page with analysis:", analysis);
    
    const blockMessage = analysis ? 
        `<div class="focuspal-blocked">
            <div class="blocked-content">
                <div class="blocked-header">
                    <svg class="focus-icon" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                    </svg>
                    <h1>Stay Focused!</h1>
                </div>
                
                <div class="motivation-quote">
                    "${getRandomQuote()}"
                </div>

                <div class="analysis-card">
                    <h2>AI Analysis Results</h2>
                    <div class="score-grid">
                        <div class="score-item">
                            <div class="score-circle ${getScoreClass(analysis.distractionScore)}">
                                ${Math.round(analysis.distractionScore * 100)}%
                            </div>
                            <label>Distraction Risk</label>
                        </div>
                        <div class="score-item">
                            <div class="score-circle ${getScoreClass(1 - analysis.productivityScore)}">
                                ${Math.round(analysis.productivityScore * 100)}%
                            </div>
                            <label>Productivity Score</label>
                        </div>
                    </div>
                    <p class="analysis-reason">${analysis.reasoning}</p>
                </div>

                <div class="action-buttons">
                    <button id="continue-anyway" class="warning-btn">Continue Anyway (Not Recommended)</button>
                    <button id="back-to-work" class="primary-btn">Back to Work</button>
                </div>
            </div>
        </div>` :
        `<div class="focuspal-blocked">
            <div class="blocked-content">
                <div class="blocked-header">
                    <svg class="focus-icon" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                    </svg>
                    <h1>Site Blocked</h1>
                </div>
                
                <div class="motivation-quote">
                    "${getRandomQuote()}"
                </div>

                <p class="blocked-message">This site is on your block list to help you stay focused.</p>

                <div class="action-buttons">
                    <button id="back-to-work" class="primary-btn">Back to Work</button>
                </div>
            </div>
        </div>`;

    // Store original content before replacing
    originalContent = document.body.innerHTML;
    document.body.innerHTML = blockMessage;

    // Add button functionality
    const continueBtn = document.getElementById('continue-anyway');
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            document.body.innerHTML = originalContent;
        });
    }

    const backBtn = document.getElementById('back-to-work');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.history.back();
        });
    }
}

function getScoreClass(score) {
    if (score < 0.3) return 'score-low';
    if (score < 0.7) return 'score-medium';
    return 'score-high';
}

function getRandomQuote() {
    const quotes = [
        "The successful warrior is the average person, with laser-like focus. - Bruce Lee",
        "Concentrate all your thoughts upon the work at hand. - Alexander Graham Bell",
        "What you stay focused on will grow. - Roy T. Bennett",
        "Focus on the journey, not the destination. - Greg Anderson",
        "Where focus goes, energy flows. - Tony Robbins",
        "The main thing is to keep the main thing the main thing. - Stephen Covey",
        "Focus is not about saying yes. Focus is about saying no. - Steve Jobs",
        "Success is not final, failure is not fatal: it is the courage to continue that counts. - Winston Churchill",
        "Your work is going to fill a large part of your life, and the only way to be truly satisfied is to do what you believe is great work. - Steve Jobs"
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
}

// Store original content
let originalContent = null;

browser.runtime.onMessage.addListener((message) => {
    console.log("Received message:", message);
    
    if (message.action === "checkPage") {
        const currentURL = window.location.href;
        const blockedURLs = message.blockedURLs || [];
        const analysis = message.analysis;
        
        console.log("Checking page:", currentURL);
        console.log("Blocked URLs:", blockedURLs);
        console.log("Analysis:", analysis);

        // Block if either the URL is in blocklist or analysis shows high distraction
        const isBlocked = blockedURLs.some(blocked => currentURL.includes(blocked.url));
        const isDistracting = analysis && analysis.distractionScore > 0.7;
        
        console.log("Is blocked:", isBlocked);
        console.log("Is distracting:", isDistracting);

        if (isBlocked || isDistracting) {
            createBlockedPage(analysis);
        }
    }
});
