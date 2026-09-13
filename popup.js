// Elements
const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');
const toggleStandard = document.getElementById('toggle-standard-hotkeys');
const toggleEnhanced = document.getElementById('toggle-enhanced-paste');
const previewRaw = document.getElementById('preview-raw');
const previewFormatted = document.getElementById('preview-formatted');
const btnOpenOptions = document.getElementById('btn-open-options');
const btnShortcuts = document.getElementById('btn-shortcuts');

let currentSettings = {};

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
        'enhancedPasteStripAfterDash'
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
            enhancedPasteStripAfterDash: settings.enhancedPasteStripAfterDash !== false
        };

        // Standard hotkeys toggle is considered checked if at least one standard key is enabled
        const hasStandard = currentSettings.enableCopy || currentSettings.enablePaste || currentSettings.enableSelectAll || currentSettings.enableUndo || currentSettings.enableFind;
        toggleStandard.checked = hasStandard;
        toggleEnhanced.checked = currentSettings.enableEnhancedPaste;

        checkActiveTab();
        loadClipboardPreview();
    });
}

/**
 * Queries active tab to see if TWL hotkey content script is active.
 */
function checkActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0 || !tabs[0].id) {
            setTabStatus(false, 'Inactive');
            return;
        }

        const tab = tabs[0];
        const url = tab.url || '';
        const isSupportedHost = url.includes('.inforcloudsuite.com') || url.includes('.inforfederatedservice.com') || url.includes('.aws.infor.com');

        if (!isSupportedHost) {
            setTabStatus(false, 'Inactive');
            return;
        }

        chrome.tabs.sendMessage(tab.id, { action: 'ping-status' }, (response) => {
            if (chrome.runtime.lastError || !response || !response.active) {
                // If content script hasn't responded yet but host matches
                setTabStatus(true, 'Ready');
            } else {
                setTabStatus(true, 'Active');
            }
        });
    });
}

function setTabStatus(isActive, text) {
    statusPill.className = `status-pill ${isActive ? 'active' : 'inactive'}`;
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
            return;
        }

        const trimmed = rawText.trim();
        const displayRaw = trimmed.length > 18 ? trimmed.substring(0, 18) + '...' : trimmed;
        previewRaw.textContent = displayRaw;

        let formatted = trimmed;
        if (currentSettings.enhancedPasteStripAfterDash) {
            formatted = formatted.split('-')[0];
        } else {
            formatted = formatted.replace(/-/g, '');
        }
        const prefix = currentSettings.enhancedPastePrefix || 'o00';
        formatted = prefix + formatted;

        const displayFormatted = formatted.length > 18 ? formatted.substring(0, 18) + '...' : formatted;
        previewFormatted.textContent = displayFormatted;
    }).catch(() => {
        previewRaw.textContent = 'Unavailable';
        previewFormatted.textContent = '--';
    });
}

// --- Toggle Handlers ---

toggleStandard.addEventListener('change', () => {
    const isChecked = toggleStandard.checked;
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
    chrome.storage.sync.set({
        enableEnhancedPaste: isChecked
    });
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
