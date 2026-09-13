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
            'feature-copy': true,
            'feature-paste': true,
            'feature-highlight': false
        };
        chrome.storage.sync.set({ options: defaultOptions });
    }
});
