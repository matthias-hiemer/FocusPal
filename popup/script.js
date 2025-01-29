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

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Find or create notification container
    let container = document.querySelector('.notification-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';
        // Insert at the very top of the extension
        const extension = document.querySelector('.extension');
        extension.insertBefore(container, extension.firstChild);
    }
    
    container.appendChild(notification);
    
    // Remove after 2 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 2000);
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
                showNotification('This site is already in the allow list.', 'warning');
            } else {
                whitelistedURLs.push({ url: urlTrim, icon: faviconUrl });
                await saveWhitelistedURLs(whitelistedURLs);
                await updateWhitelistedSitesDisplay();
                showNotification('Site added to allow list');
                urlInput.value = '';
            }
        } else {
            showNotification('Please enter a valid URL.', 'error');
        }
    });
}

function initPopup() {
    setupTabNavigation();
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
                    showNotification('This site is already blocked.', 'warning');
                    isAlreadyBlocked = true;
                }
            });
            if (!isAlreadyBlocked){
                blockedURLs.push({ url: urlTrim, icon: faviconUrl});
                saveBlockedURLs(blockedURLs);
                updateBlockedSitesDisplay();
                showNotification('Site blocked successfully!');
                urlInput.value = '';
            }
        } else {
            showNotification('Please enter a valid URL.', 'error');
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
        // Set Settings tab as default
        document.querySelector('[data-target="settings"]').click();
    }
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
            showNotification('API key saved successfully!');
        } else {
            showNotification('Please enter a valid API key', 'error');
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

async function getCurrentTab() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
}

async function setupQuickActions() {
    const currentTab = await getCurrentTab();
    const url = new URL(currentTab.url);
    const domain = url.hostname;
    
    // Setup Block Current Site button
    document.getElementById('block-current-site').addEventListener('click', async () => {
        const blockedURLs = await getBlockedURLs();
        const isAlreadyBlocked = blockedURLs.some(site => site.url === domain);
        
        if (isAlreadyBlocked) {
            showNotification('This site is already blocked.', 'warning');
            return;
        }
        
        blockedURLs.push({ 
            url: domain, 
            icon: `${url.origin}/favicon.ico`
        });
        
        await saveBlockedURLs(blockedURLs);
        await updateBlockedSitesDisplay();
        showNotification('Current site blocked successfully!');
    });
    
    // Setup Allow Current Site button
    document.getElementById('allow-current-site').addEventListener('click', async () => {
        const whitelistedURLs = await getWhitelistedURLs();
        const isAlreadyWhitelisted = whitelistedURLs.some(site => site.url === domain);
        
        if (isAlreadyWhitelisted) {
            showNotification('This site is already in the allow list.', 'warning');
            return;
        }
        
        whitelistedURLs.push({ 
            url: domain, 
            icon: `${url.origin}/favicon.ico`
        });
        
        await saveWhitelistedURLs(whitelistedURLs);
        await updateWhitelistedSitesDisplay();
        showNotification('Current site added to allow list!');
    });
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

document.addEventListener('DOMContentLoaded', () => {
    initPopup();
    setupAddToBlockListButton();
    setupWhitelistButton();
    setupQuickActions();
    setupAPIKeyHandling();
    setupTimeRangeHandling();
    setupBreakTimer();
    updateWhitelistedSitesDisplay();
});
