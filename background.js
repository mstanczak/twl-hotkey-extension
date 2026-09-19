/**
 * @fileoverview Background script for the extension.
 * Handles the onInstalled event to set up default options.
 */

// Fired when the extension is first installed, when the extension is updated to a new version,
// and when Chrome is updated to a new version.
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Extension installed. Setting default options.');
        // Set default options on first install.
        const defaultOptions = {
            enableCopy: true,
            enablePaste: true,
            enableSelectAll: true,
            enableFind: true,
            enableUndo: true,
            enableEnhancedPaste: false,
            enhancedPastePrefix: "o00",
            enhancedPasteStripAfterDash: true,
            showToastNotification: true,
            enhancedPasteAction: "none"
        };
        chrome.storage.sync.set(defaultOptions);
    }

    // Set up right-click context menu items for editable fields
    chrome.contextMenus.removeAll(() => {
        if (chrome.runtime.lastError) {
            // Ignore error if menu items were not previously set
        }
        chrome.contextMenus.create({
            id: 'twl-paste-order',
            title: 'Paste as TWL Order (Ctrl+O)',
            contexts: ['editable']
        }, () => { void chrome.runtime.lastError; });
        chrome.contextMenus.create({
            id: 'twl-paste-trimmed',
            title: 'Paste Trimmed (Ctrl+V)',
            contexts: ['editable']
        }, () => { void chrome.runtime.lastError; });
    });
});

// Helper to safely dispatch message to a tab and frame with error suppression
function dispatchTabMessage(tabId, message, frameId) {
    const options = (typeof frameId === 'number') ? { frameId } : {};
    chrome.tabs.sendMessage(tabId, message, options, () => {
        if (chrome.runtime.lastError) {
            // If message failed to reach a specific sub-frame, retry on the top-level tab as fallback
            if (options.frameId && options.frameId !== 0) {
                chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, () => {
                    void chrome.runtime.lastError;
                });
            }
        }
    });
}

// Handle context menu clicks and dispatch message to the target frame in the active tab
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab || !tab.id) return;
    if (info.menuItemId === 'twl-paste-order') {
        dispatchTabMessage(tab.id, { action: 'context-menu-paste-order' }, info.frameId);
    } else if (info.menuItemId === 'twl-paste-trimmed') {
        dispatchTabMessage(tab.id, { action: 'context-menu-paste-trimmed' }, info.frameId);
    }
});

// Handle keyboard shortcut commands configured in chrome://extensions/shortcuts
chrome.commands.onCommand.addListener((command, tab) => {
    if (command === 'enhanced-paste' && tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'trigger-enhanced-paste' }, () => {
            void chrome.runtime.lastError;
        });
    }
});
