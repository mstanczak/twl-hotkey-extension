/**
 * @fileoverview Content script for the Infor CloudSuite Enabler extension.
 * Re-enables keyboard shortcuts based on user settings by intercepting
 * events in the capture phase and stopping their propagation.
 */

let settings = {};
const undoHistory = new Map();
const MAX_HISTORY_SIZE = 50; // Limit history size per element

/**
 * Loads settings from Chrome storage and initializes the script.
 */
function initialize() {
    const settingKeys = ['enableCopy', 'enablePaste', 'enableSelectAll', 'enableFind', 'enableUndo'];
    chrome.storage.sync.get(settingKeys, (loadedSettings) => {
        if (chrome.runtime.lastError) {
            console.error('Infor Enabler: Error loading settings:', chrome.runtime.lastError);
            return;
        }
        // Set defaults to true if a setting is not defined
        settings = {
            enableCopy: loadedSettings.enableCopy !== false,
            enablePaste: loadedSettings.enablePaste !== false,
            enableSelectAll: loadedSettings.enableSelectAll !== false,
            enableFind: loadedSettings.enableFind !== false,
            enableUndo: loadedSettings.enableUndo !== false,
        };
        console.log('Infor Enabler: Settings loaded and listeners active.', settings);
    });
}

// --- Undo (Ctrl+Z) Functionality ---

/**
 * Saves the current state of an input element to its undo history.
 * @param {HTMLInputElement|HTMLTextAreaElement} element The input element.
 */
function saveState(element) {
    if (!undoHistory.has(element)) {
        undoHistory.set(element, []);
    }
    const history = undoHistory.get(element);
    const currentValue = element.value;

    if (history.length === 0 || history[history.length - 1] !== currentValue) {
         history.push(currentValue);
         if (history.length > MAX_HISTORY_SIZE) {
             history.shift();
         }
    }
}

/**
 * Restores the previous state of an input element from its undo history.
 * @param {HTMLInputElement|HTMLTextAreaElement} element The input element.
 */
function undo(element) {
    if (!undoHistory.has(element)) return;
    const history = undoHistory.get(element);
    
    if (history.length > 1) {
        history.pop();
        element.value = history[history.length - 1];
    } else if (history.length === 1) {
         history.pop();
         element.value = '';
    }
}

// --- Event Listeners ---

// Use 'focusin' and 'input' to manage state for the Undo feature.
document.addEventListener('focusin', (event) => {
    if (settings.enableUndo && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) {
        saveState(event.target);
    }
}, true);

 document.addEventListener('input', (event) => {
    if (settings.enableUndo && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) {
        saveState(event.target);
    }
}, true);

// Main keydown listener to intercept and manage all hotkeys.
document.addEventListener('keydown', (event) => {
    const isCtrlPressed = event.ctrlKey || event.metaKey;
    if (!isCtrlPressed) return;

    const key = event.key.toLowerCase();
    const activeElement = document.activeElement;

    // Handle Undo (Ctrl+Z)
    if (settings.enableUndo && !event.shiftKey && key === 'z') {
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            console.log('Infor Enabler: Undo triggered.');
            event.preventDefault();
            event.stopPropagation();
            undo(activeElement);
        }
        return; // Stop further processing for this key combination
    }

    // Handle Copy, Paste, Select All, Find based on settings
    const shouldStop = 
        (settings.enableCopy && key === 'c') ||
        (settings.enablePaste && key === 'v') ||
        (settings.enableSelectAll && key === 'a') ||
        (settings.enableFind && key === 'f');

    if (shouldStop) {
        console.log(`Infor Enabler: Detected Ctrl+${key.toUpperCase()}. Stopping propagation.`);
        event.stopImmediatePropagation();
    }
}, true); // Use capture phase to run before the page's scripts.

// Listener for the 'copy' event
document.addEventListener('copy', (event) => {
    if (settings.enableCopy) {
        console.log("Infor Enabler: Detected copy event. Stopping propagation.");
        event.stopImmediatePropagation();
    }
}, true);

// Listener for the 'paste' event to handle trimmed pasting
document.addEventListener('paste', (event) => {
    if (settings.enablePaste) {
        console.log("Infor Enabler: Detected paste event.");
        event.stopImmediatePropagation();
        event.preventDefault(); // Prevent default paste to insert our own text

        const text = (event.clipboardData || window.clipboardData).getData('text/plain').trim();
        if (document.execCommand("insertText", false, text)) {
            console.log(`Infor Enabler: Pasted trimmed text: "${text}"`);
        } else {
            console.warn("Infor Enabler: execCommand('insertText') failed. Pasting might not work as expected.");
        }
    }
}, true);

// Initialize the script to load settings
initialize();
