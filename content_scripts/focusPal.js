console.log("focusPal.js loaded");

function createBlockedPage(analysis) {
    console.log("Creating blocked page with analysis:", analysis);
    
    const blockMessage = analysis ? 
        `<div class="focuspal-blocked">
            <h1>This site has been identified as potentially distracting.</h1>
            <div class="analysis">
                <p>Distraction Score: ${Math.round(analysis.distractionScore * 100)}%</p>
                <p>Productivity Score: ${Math.round(analysis.productivityScore * 100)}%</p>
                <p>${analysis.reasoning}</p>
            </div>
            <button id="continue-anyway">Continue Anyway (Not Recommended)</button>
        </div>` :
        `<div class="focuspal-blocked">
            <h1>This site has been blocked by FocusPal.</h1>
            <p>This URL is in your block list.</p>
        </div>`;

    // Store original content before replacing
    originalContent = document.body.innerHTML;
    document.body.innerHTML = blockMessage;

    // Add continue anyway functionality
    const continueBtn = document.getElementById('continue-anyway');
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            document.body.innerHTML = originalContent;
        });
    }
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
