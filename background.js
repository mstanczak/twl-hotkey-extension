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
        chrome.contextMenus.create({
            id: 'twl-paste-order',
            title: 'Paste as TWL Order (Ctrl+O)',
            contexts: ['editable']
        });
        chrome.contextMenus.create({
            id: 'twl-paste-trimmed',
            title: 'Paste Trimmed (Ctrl+V)',
            contexts: ['editable']
        });
    });
});

// Handle context menu clicks and dispatch message to the active tab
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab || !tab.id) return;
    if (info.menuItemId === 'twl-paste-order') {
        chrome.tabs.sendMessage(tab.id, { action: 'context-menu-paste-order' });
    } else if (info.menuItemId === 'twl-paste-trimmed') {
        chrome.tabs.sendMessage(tab.id, { action: 'context-menu-paste-trimmed' });
    }
});

// Handle keyboard shortcut commands configured in chrome://extensions/shortcuts
chrome.commands.onCommand.addListener((command, tab) => {
    if (command === 'enhanced-paste' && tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'trigger-enhanced-paste' });
    }
});
