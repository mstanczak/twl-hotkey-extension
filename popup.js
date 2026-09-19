// Elements
const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');
const toggleStandard = document.getElementById('toggle-standard-hotkeys');
const toggleEnhanced = document.getElementById('toggle-enhanced-paste');
const toggleEnhancedPO = document.getElementById('toggle-enhanced-paste-po');
const toggleEnhancedTransfer = document.getElementById('toggle-enhanced-paste-transfer');
const previewRaw = document.getElementById('preview-raw');
const previewFormatted = document.getElementById('preview-formatted');
const previewPO = document.getElementById('preview-po');
const previewTransfer = document.getElementById('preview-transfer');
const btnOpenOptions = document.getElementById('btn-open-options');
const btnShortcuts = document.getElementById('btn-shortcuts');

let currentSettings = {};

/**
 * Formats an order/PO/transfer number for display preview.
 */
function formatPreview(rawText, type) {
    if (!rawText || !rawText.trim()) return '--';

    let formatted = rawText.trim();
    const stripDash = currentSettings.enhancedPasteStripAfterDash;

    if (stripDash) {
        formatted = formatted.split('-')[0].trim();
    } else {
        formatted = formatted.replace(/-/g, '').trim();
    }

    const orderPrefix = currentSettings.enhancedPastePrefix || 'o00';
    const poPrefix = currentSettings.enhancedPastePOPrefix || 'p00';
    const transferPrefix = currentSettings.enhancedPasteTransferPrefix || 't00';

    let targetPrefix = orderPrefix;
    if (type === 'po') targetPrefix = poPrefix;
    if (type === 'transfer') targetPrefix = transferPrefix;

    const knownPrefixes = [orderPrefix, poPrefix, transferPrefix, 'o00', 'p00', 't00'];
    for (const p of knownPrefixes) {
        if (p && formatted.toLowerCase().startsWith(p.toLowerCase())) {
            formatted = formatted.slice(p.length).trim();
            break;
        }
    }

    formatted = targetPrefix + formatted;
    return formatted.length > 18 ? formatted.substring(0, 18) + '...' : formatted;
}

/**
 * Initializes the popup: loads settings, checks active tab status, and inspects clipboard.
 */
function initializePopup() {
    const keys = [
        'enableCopy',
        'enablePaste',
        'enableSelectAll',
        'enableFind',
        'enableUndo',
        'enableEnhancedPaste',
        'enhancedPastePrefix',
        'enhancedPasteStripAfterDash',
        'enableEnhancedPastePO',
        'enhancedPastePOPrefix',
        'enableEnhancedPasteTransfer',
        'enhancedPasteTransferPrefix'
    ];

    chrome.storage.sync.get(keys, (settings) => {
        currentSettings = {
            enableCopy: settings.enableCopy !== false,
            enablePaste: settings.enablePaste !== false,
            enableSelectAll: settings.enableSelectAll !== false,
            enableFind: settings.enableFind !== false,
            enableUndo: settings.enableUndo !== false,
            enableEnhancedPaste: settings.enableEnhancedPaste === true,
            enhancedPastePrefix: typeof settings.enhancedPastePrefix === 'string' ? settings.enhancedPastePrefix : 'o00',
            enhancedPasteStripAfterDash: settings.enhancedPasteStripAfterDash !== false,
            enableEnhancedPastePO: settings.enableEnhancedPastePO === true,
            enhancedPastePOPrefix: typeof settings.enhancedPastePOPrefix === 'string' ? settings.enhancedPastePOPrefix : 'p00',
            enableEnhancedPasteTransfer: settings.enableEnhancedPasteTransfer === true,
            enhancedPasteTransferPrefix: typeof settings.enhancedPasteTransferPrefix === 'string' ? settings.enhancedPasteTransferPrefix : 't00'
        };

        // Standard hotkeys toggle is considered checked if at least one standard key is enabled
        const hasStandard = currentSettings.enableCopy || currentSettings.enablePaste || currentSettings.enableSelectAll || currentSettings.enableUndo || currentSettings.enableFind;
        toggleStandard.checked = hasStandard;
        toggleEnhanced.checked = currentSettings.enableEnhancedPaste;
        if (toggleEnhancedPO) toggleEnhancedPO.checked = currentSettings.enableEnhancedPastePO;
        if (toggleEnhancedTransfer) toggleEnhancedTransfer.checked = currentSettings.enableEnhancedPasteTransfer;

        checkActiveTab();
        loadClipboardPreview();
    });
}

/**
 * Pattern tester for supported TWL / CloudSuite domains.
 * @param {string} url
 * @returns {boolean}
 */
function isSupportedTWLUrl(url) {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        return host.endsWith('inforcloudsuite.com') ||
               host.endsWith('inforfederatedservice.com') ||
               host.endsWith('aws.infor.com') ||
               host.includes('infor') ||
               host.includes('twl');
    } catch (e) {
        // Fallback simple string match
        const lower = url.toLowerCase();
        return lower.includes('inforcloudsuite.com') ||
               lower.includes('inforfederatedservice.com') ||
               lower.includes('aws.infor.com');
    }
}

/**
 * Queries active tab to see if TWL hotkey content script is active.
 */
function checkActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0 || !tabs[0].id) {
            setTabStatus('inactive', 'Inactive');
            return;
        }

        const tab = tabs[0];
        const url = tab.url || tab.pendingUrl || '';

        // First attempt direct ping to the content script in the active tab
        chrome.tabs.sendMessage(tab.id, { action: 'ping-status' }, (response) => {
            const err = chrome.runtime.lastError;
            if (!err && response && response.active) {
                // Content script is definitely running and responsive
                setTabStatus('active', 'Active');
            } else if (isSupportedTWLUrl(url)) {
                // URL matches TWL domain; content script is configured to run or ready
                setTabStatus('active', 'Active');
            } else {
                setTabStatus('inactive', 'Inactive');
            }
        });
    });
}

function setTabStatus(statusClass, text) {
    statusPill.className = `status-pill ${statusClass}`;
    statusText.textContent = text;
}

/**
 * Reads clipboard and displays a live order format preview.
 */
function loadClipboardPreview() {
    navigator.clipboard.readText().then((rawText) => {
        if (!rawText || !rawText.trim()) {
            previewRaw.textContent = '(empty)';
            previewFormatted.textContent = '--';
            if (previewPO) previewPO.textContent = '--';
            if (previewTransfer) previewTransfer.textContent = '--';
            return;
        }

        const trimmed = rawText.trim();
        const displayRaw = trimmed.length > 18 ? trimmed.substring(0, 18) + '...' : trimmed;
        previewRaw.textContent = displayRaw;

        previewFormatted.textContent = formatPreview(trimmed, 'order');
        if (previewPO) previewPO.textContent = formatPreview(trimmed, 'po');
        if (previewTransfer) previewTransfer.textContent = formatPreview(trimmed, 'transfer');
    }).catch(() => {
        previewRaw.textContent = 'Unavailable';
        previewFormatted.textContent = '--';
        if (previewPO) previewPO.textContent = '--';
        if (previewTransfer) previewTransfer.textContent = '--';
    });
}

// --- Toggle Handlers ---

toggleStandard.addEventListener('change', () => {
    const isChecked = toggleStandard.checked;
    currentSettings.enableCopy = isChecked;
    currentSettings.enablePaste = isChecked;
    currentSettings.enableSelectAll = isChecked;
    currentSettings.enableFind = isChecked;
    currentSettings.enableUndo = isChecked;
    chrome.storage.sync.set({
        enableCopy: isChecked,
        enablePaste: isChecked,
        enableSelectAll: isChecked,
        enableFind: isChecked,
        enableUndo: isChecked
    });
});

toggleEnhanced.addEventListener('change', () => {
    const isChecked = toggleEnhanced.checked;
    currentSettings.enableEnhancedPaste = isChecked;
    chrome.storage.sync.set({
        enableEnhancedPaste: isChecked
    });
    loadClipboardPreview();
});

if (toggleEnhancedPO) {
    toggleEnhancedPO.addEventListener('change', () => {
        const isChecked = toggleEnhancedPO.checked;
        currentSettings.enableEnhancedPastePO = isChecked;
        chrome.storage.sync.set({
            enableEnhancedPastePO: isChecked
        });
        loadClipboardPreview();
    });
}

if (toggleEnhancedTransfer) {
    toggleEnhancedTransfer.addEventListener('change', () => {
        const isChecked = toggleEnhancedTransfer.checked;
        currentSettings.enableEnhancedPasteTransfer = isChecked;
        chrome.storage.sync.set({
            enableEnhancedPasteTransfer: isChecked
        });
        loadClipboardPreview();
    });
}

// Listen for storage changes from the options page in real-time
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync') {
        initializePopup();
    }
});

// --- Actions ---

btnOpenOptions.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        window.open(chrome.runtime.getURL('options.html'));
    }
});

btnShortcuts.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

document.addEventListener('DOMContentLoaded', initializePopup);
