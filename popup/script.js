let blockedURLs = JSON.parse(localStorage.getItem('blockedURLs')) || [];

const ANALYSIS_THRESHOLD = 0.7; // Sites with distractionScore > 0.7 will be suggested for blocking

async function getAnalysis(currentTab) {
    try {
        const analysis = await browser.runtime.sendMessage({
            action: "analyzeCurrentTab"
        });
        return analysis;
    } catch (error) {
        console.error('Failed to get analysis:', error);
        throw error;
    }
}

async function showLoadingState() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-state';
    loadingDiv.innerHTML = `
        <div class="loading-spinner"></div>
        <p>Analyzing page content...</p>
    `;
    document.getElementById('block-site').insertBefore(
        loadingDiv,
        document.querySelector('#block-site .primary-btn')
    );
}

function removeLoadingState() {
    const loadingState = document.querySelector('.loading-state');
    if (loadingState) {
        loadingState.remove();
    }
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <p>${message}</p>
        <button class="retry-btn">Retry Analysis</button>
    `;
    document.getElementById('block-site').insertBefore(
        errorDiv,
        document.querySelector('#block-site .primary-btn')
    );

    // Add retry functionality
    errorDiv.querySelector('.retry-btn').addEventListener('click', async () => {
        errorDiv.remove();
        const currentTab = (await browser.tabs.query({ active: true, currentWindow: true }))[0];
        await performAnalysis(currentTab);
    });
}

async function performAnalysis(currentTab) {
    try {
        await showLoadingState();
        const analysis = await getAnalysis(currentTab);
        removeLoadingState();
        
        if (!analysis) {
            throw new Error('Failed to analyze page');
        }

        // Add analysis display to popup
        const analysisDiv = document.createElement('div');
        analysisDiv.className = 'ai-analysis';
        analysisDiv.innerHTML = `
            <div class="score-container">
                <div class="score">
                    <label>Productivity Score:</label>
                    <div class="progress-bar">
                        <div class="progress" style="width: ${analysis.productivityScore * 100}%"></div>
                    </div>
                    <span>${Math.round(analysis.productivityScore * 100)}%</span>
                </div>
                <div class="score">
                    <label>Distraction Risk:</label>
                    <div class="progress-bar">
                        <div class="progress" style="width: ${analysis.distractionScore * 100}%"></div>
                    </div>
                    <span>${Math.round(analysis.distractionScore * 100)}%</span>
                </div>
            </div>
            <p class="analysis-reason">${analysis.reasoning}</p>
        `;
        
        document.getElementById('block-site').insertBefore(
            analysisDiv, 
            document.querySelector('#block-site .primary-btn')
        );

        // If site is highly distracting, add warning
        if (analysis.distractionScore > ANALYSIS_THRESHOLD) {
            const warningDiv = document.createElement('div');
            warningDiv.className = 'warning-message';
            warningDiv.textContent = 'This site has been identified as potentially distracting.';
            document.getElementById('block-site').insertBefore(
                warningDiv,
                document.querySelector('#block-site .primary-btn')
            );
        }

        return analysis; // Return the analysis for use in initPopup

    } catch (error) {
        removeLoadingState();
        if (error.message.includes('API key')) {
            showError('Please configure your OpenAI API key in the Settings tab first.');
        } else {
            showError(`Analysis failed: ${error.message}`);
        }
        console.error('Analysis error:', error);
        return null;
    }
}

async function getBlockedURLs() {
    const result = await browser.storage.local.get('blockedURLs');
    return result.blockedURLs || [];
}

async function saveBlockedURLs(urls) {
    await browser.storage.local.set({ blockedURLs: urls });
}

async function updateBlockedSitesDisplay() {
    const blockedURLs = await getBlockedURLs();
    const blockedSitesList = document.querySelector('.blocked-sites-ul');
    blockedSitesList.innerHTML = ''; 

    blockedURLs.forEach((site, index) => {
        const li = document.createElement('li');
        li.className = 'blocked-sites-li';
        
        // Add AI analysis if available
        const analysisHtml = site.analysis ? `
            <div class="site-analysis">
                <span class="score-pill ${site.analysis.distractionScore > 0.7 ? 'high' : 'low'}">
                    ${Math.round(site.analysis.distractionScore * 100)}% Distraction
                </span>
            </div>
        ` : '';

        li.innerHTML = `
            <div class="site-info">
                <img class="favicon" src="${site.icon}" alt="">
                <p class="site-url">${site.url}</p>
                ${analysisHtml}
            </div>
            <img src="/assets/delete.svg" alt="delete" class="delete-btn" data-index="${index}">
        `;
        blockedSitesList.appendChild(li);
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = this.getAttribute('data-index');
            blockedURLs.splice(index, 1);
            saveBlockedURLs(blockedURLs);
            updateBlockedSitesDisplay();
        });
    });
}

async function getWhitelistedURLs() {
    const result = await browser.storage.local.get('whitelistedURLs');
    return result.whitelistedURLs || [];
}

async function saveWhitelistedURLs(urls) {
    await browser.storage.local.set({ whitelistedURLs: urls });
}

async function updateWhitelistedSitesDisplay() {
    const whitelistedURLs = await getWhitelistedURLs();
    const whitelistedSitesList = document.querySelector('.allowed-sites-ul');
    whitelistedSitesList.innerHTML = '';

    whitelistedURLs.forEach((site, index) => {
        const li = document.createElement('li');
        li.className = 'blocked-sites-li'; // Reuse the same styling

        li.innerHTML = `
            <div class="site-info">
                <img class="favicon" src="${site.icon}" alt="">
                <p class="site-url">${site.url}</p>
            </div>
            <img src="/assets/delete.svg" alt="delete" class="delete-btn" data-index="${index}">
        `;
        whitelistedSitesList.appendChild(li);
    });

    // Add delete functionality
    document.querySelectorAll('.allowed-sites-ul .delete-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const index = this.getAttribute('data-index');
            const urls = await getWhitelistedURLs();
            urls.splice(index, 1);
            await saveWhitelistedURLs(urls);
            updateWhitelistedSitesDisplay();
        });
    });
}

function setupWhitelistButton() {
    document.getElementById('add-to-white-list-btn').addEventListener('click', async function() {
        const urlInput = document.getElementById('allow-url');
        const urlTrim = urlInput.value.trim();
        const faviconUrl = `${urlTrim}/favicon.ico`;

        if (urlTrim !== '') {
            const whitelistedURLs = await getWhitelistedURLs();
            const isAlreadyWhitelisted = whitelistedURLs.some(site => site.url === urlTrim);

            if (isAlreadyWhitelisted) {
                alert('This site is already in the allow list.');
            } else {
                whitelistedURLs.push({ url: urlTrim, icon: faviconUrl });
                await saveWhitelistedURLs(whitelistedURLs);
                await updateWhitelistedSitesDisplay();
                alert('Site added to allow list successfully!');
                urlInput.value = '';
            }
        } else {
            alert('Please enter a valid URL.');
        }
    });
}

function initPopup() {
    browser.tabs.query({ active: true, currentWindow: true }).then(async tabs => {
        const currentTab = tabs[0];
        document.getElementById('site-name').textContent = currentTab.title || 'Current Site';
        document.getElementById('iconUrl').src = currentTab.favIconUrl || '';

        // Add AI analysis and store the result
        const analysis = await performAnalysis(currentTab);

        // Existing block button logic
        document.querySelector('#block-site .primary-btn').addEventListener('click', function() {
            if (analysis) {  // Only store if we have analysis
                blockedURLs.push({ 
                    url: currentTab.url, 
                    icon: currentTab.favIconUrl,
                    analysis: analysis
                });
                saveBlockedURLs(blockedURLs);
                updateBlockedSitesDisplay();
                alert('Site blocked successfully!');
            } else {
                alert('Please wait for site analysis to complete before blocking.');
            }
        });
    });

    setupTabNavigation();
    setupEditBlockListButton();
    setupCloseButton();

    updateBlockedSitesDisplay();
}

function setupAddToBlockListButton() {
    document.getElementById('add-to-block-list-btn').addEventListener('click', function() {
        const urlInput = document.querySelector('.url-input');
        const urlTrim = urlInput.value.trim();
        const faviconUrl = `${urlTrim}/favicon.ico`;

        if (urlTrim !== '') {
            let isAlreadyBlocked = false;
            blockedURLs.forEach(website => {
                if (website.url === urlTrim) {
                    alert('This site is already blocked.');
                    isAlreadyBlocked = true;
                }
            });
            if (!isAlreadyBlocked){
                blockedURLs.push({ url: urlTrim, icon: faviconUrl});
                saveBlockedURLs(blockedURLs);
                updateBlockedSitesDisplay();
                alert('Site blocked successfully!');
                urlInput.value = '';
            }
        } else {
            alert('Please enter a valid URL.');
        }
    });
}

function setupTabNavigation() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', function(evt) {
            document.querySelectorAll('.tab-content').forEach(tc => tc.style.display = 'none');
            tabs.forEach(t => t.classList.remove('tab-btn-active'));
            document.getElementById(tab.getAttribute('data-target')).style.display = 'block';
            tab.classList.add('tab-btn-active');
        });
    });

    if (tabs.length > 0) {
        tabs[0].click();
    }
}

function setupEditBlockListButton() {
    document.querySelector('.secondary-btn').addEventListener('click', function() {
        document.querySelector('[data-target="block-list"]').click(); // Simulate a click on the "Block List" tab
    });
}

function setupCloseButton() {
    document.getElementById('close-btn').addEventListener('click', function() {
        window.close(); 
    });
}

async function setupAPIKeyHandling() {
    // Load existing API key
    const result = await browser.storage.local.get('openaiApiKey');
    if (result.openaiApiKey) {
        document.getElementById('api-key').value = result.openaiApiKey;
    }

    // Handle save button
    document.getElementById('save-api-key').addEventListener('click', async () => {
        const apiKey = document.getElementById('api-key').value.trim();
        if (apiKey) {
            await browser.storage.local.set({ openaiApiKey: apiKey });
            alert('API key saved successfully!');
        } else {
            alert('Please enter a valid API key');
        }
    });
}

async function setupTimeRangeHandling() {
    // Load saved times
    const result = await browser.storage.local.get(['activeTimeFrom', 'activeTimeTo']);
    if (result.activeTimeFrom) {
        document.getElementById('time-from').value = result.activeTimeFrom;
    }
    if (result.activeTimeTo) {
        document.getElementById('time-to').value = result.activeTimeTo;
    }

    // Save times when changed
    ['time-from', 'time-to'].forEach(id => {
        document.getElementById(id).addEventListener('change', async function() {
            const from = document.getElementById('time-from').value;
            const to = document.getElementById('time-to').value;
            await browser.storage.local.set({ 
                activeTimeFrom: from,
                activeTimeTo: to
            });
        });
    });
}

function setupBreakTimer() {
    const breakBtn = document.getElementById('take-break-btn');
    const breakTimer = document.getElementById('break-timer');
    let timeLeft = 15 * 60; // 15 minutes in seconds
    let timerId = null;

    // Check if there's an existing break
    browser.storage.local.get('breakUntil').then(result => {
        if (result.breakUntil) {
            const remainingTime = Math.floor((result.breakUntil - Date.now()) / 1000);
            if (remainingTime > 0) {
                startTimer(remainingTime);
            }
        }
    });

    function startTimer(duration) {
        timeLeft = duration;
        breakBtn.style.display = 'none';
        breakTimer.style.display = 'block';
        
        if (timerId) clearInterval(timerId);
        
        // Start timer
        timerId = setInterval(() => {
            timeLeft--;
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            document.querySelector('.timer-count').textContent = 
                `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            if (timeLeft <= 0) {
                clearInterval(timerId);
                breakBtn.style.display = 'inline-flex';
                breakTimer.style.display = 'none';
                timeLeft = 15 * 60;
                browser.storage.local.remove('breakUntil');
            }
        }, 1000);
    }

    breakBtn.addEventListener('click', async function() {
        const endTime = Date.now() + (15 * 60 * 1000); // 15 minutes from now
        await browser.storage.local.set({ breakUntil: endTime });
        startTimer(15 * 60);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initPopup();
    setupAddToBlockListButton();
    setupWhitelistButton();
    setupAPIKeyHandling();
    setupTimeRangeHandling();
    setupBreakTimer();
    updateWhitelistedSitesDisplay();
});
