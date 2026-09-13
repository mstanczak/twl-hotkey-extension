/**
 * @fileoverview Content script for the TWL Hotkey Enabler extension.
 * Re-enables keyboard shortcuts based on user settings by intercepting
 * events in the capture phase on window and stopping their propagation.
 */

const DEBUG = false;
function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

let settings = {};
const undoHistory = new Map();
const MAX_HISTORY_SIZE = 50; // Limit history size per element

/**
 * Loads settings from Chrome storage and initializes the script.
 */
function initialize() {
    const settingKeys = [
        'enableCopy',
        'enablePaste',
        'enableSelectAll',
        'enableFind',
        'enableUndo',
        'enableEnhancedPaste',
        'enhancedPastePrefix',
        'enhancedPasteStripAfterDash'
    ];
    chrome.storage.sync.get(settingKeys, (loadedSettings) => {
        if (chrome.runtime.lastError) {
            console.error('TWL Enabler: Error loading settings:', chrome.runtime.lastError);
            return;
        }
        // Set defaults to true if a setting is not defined (enhanced paste defaults to false)
        settings = {
            enableCopy: loadedSettings.enableCopy !== false,
            enablePaste: loadedSettings.enablePaste !== false,
            enableSelectAll: loadedSettings.enableSelectAll !== false,
            enableFind: loadedSettings.enableFind !== false,
            enableUndo: loadedSettings.enableUndo !== false,
            enableEnhancedPaste: loadedSettings.enableEnhancedPaste === true,
            enhancedPastePrefix: typeof loadedSettings.enhancedPastePrefix === 'string' ? loadedSettings.enhancedPastePrefix : 'o00',
            enhancedPasteStripAfterDash: loadedSettings.enhancedPasteStripAfterDash !== false,
        };
        console.log('TWL Enabler: Settings loaded and active.', settings);
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
 * Restores the previous state of an input element from its undo history
 * and dispatches input/change events so TWL / reactive frameworks stay in sync.
 * @param {HTMLInputElement|HTMLTextAreaElement} element The input element.
 */
function undo(element) {
    if (!undoHistory.has(element)) return;
    const history = undoHistory.get(element);
    
    let targetValue = null;
    if (history.length > 1) {
        history.pop();
        targetValue = history[history.length - 1];
    } else if (history.length === 1) {
        history.pop();
        targetValue = '';
    }

    if (targetValue !== null) {
        element.value = targetValue;
        element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }
}

// --- Event Listeners Attached to window (Highest Capture Priority) ---

// Use 'focusin' and 'input' on window to manage state for the Undo feature.
window.addEventListener('focusin', (event) => {
    if (settings.enableUndo && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) {
        saveState(event.target);
    }
}, true);

window.addEventListener('input', (event) => {
    if (settings.enableUndo && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) {
        saveState(event.target);
    }
}, true);

// Main keydown listener to intercept and manage all hotkeys on window.
window.addEventListener('keydown', (event) => {
    const isCtrlPressed = event.ctrlKey || event.metaKey;
    if (!isCtrlPressed) return;

    const key = event.key.toLowerCase();
    const activeElement = document.activeElement;

    // Handle Undo (Ctrl+Z) - ensure Shift is not pressed (so Ctrl+Shift+Z / Redo is not hijacked)
    if (settings.enableUndo && !event.shiftKey && key === 'z') {
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            debugLog('TWL Enabler: Undo triggered.');
            event.preventDefault();
            event.stopPropagation();
            undo(activeElement);
        }
        return;
    }

    // Handle Enhanced TWL Order Paste (Ctrl+O)
    if (settings.enableEnhancedPaste && !event.shiftKey && key === 'o') {
        const isEditable = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') && !activeElement.readOnly && !activeElement.disabled;
        if (isEditable) {
            event.preventDefault();
            event.stopImmediatePropagation();
            debugLog('TWL Enabler: Enhanced Paste (Ctrl+O) triggered.');

            navigator.clipboard.readText().then((rawText) => {
                if (!rawText) return;
                let text = rawText.trim();
                if (settings.enhancedPasteStripAfterDash) {
                    text = text.split('-')[0];
                } else {
                    text = text.replace(/-/g, '');
                }
                const prefix = settings.enhancedPastePrefix || '';
                const formattedText = prefix + text;

                if (settings.enableUndo) {
                    saveState(activeElement);
                }

                let inserted = false;
                try {
                    inserted = document.execCommand('insertText', false, formattedText);
                } catch (e) {
                    inserted = false;
                }

                if (!inserted && activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') && !activeElement.readOnly && !activeElement.disabled) {
                    const start = activeElement.selectionStart ?? activeElement.value.length;
                    const end = activeElement.selectionEnd ?? activeElement.value.length;
                    const val = activeElement.value;
                    activeElement.value = val.substring(0, start) + formattedText + val.substring(end);
                    activeElement.selectionStart = activeElement.selectionEnd = start + formattedText.length;
                    inserted = true;
                }

                if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
                    activeElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    activeElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                }

                if (inserted) {
                    debugLog(`TWL Enabler: Enhanced pasted order number: "${formattedText}"`);
                } else {
                    console.warn("TWL Enabler: Could not paste enhanced text into active element.");
                }
            }).catch((err) => {
                console.warn('TWL Enabler: Failed to read clipboard for Enhanced Paste:', err);
            });
            return;
        }
    }

    // Handle Copy (Ctrl+C), Cut (Ctrl+X), Paste (Ctrl+V), Select All (Ctrl+A), Find (Ctrl+F)
    // Prevent intercepting Chrome DevTools shortcuts (e.g., Ctrl+Shift+C)
    const isPlainCopy = settings.enableCopy && !event.shiftKey && key === 'c';
    const isPlainCut  = settings.enableCopy && !event.shiftKey && key === 'x';
    const isPlainSelectAll = settings.enableSelectAll && !event.shiftKey && key === 'a';
    const isPlainFind = settings.enableFind && !event.shiftKey && key === 'f';
    const isPaste = settings.enablePaste && key === 'v'; // allow Ctrl+V and Ctrl+Shift+V

    const shouldStop = isPlainCopy || isPlainCut || isPaste || isPlainSelectAll || isPlainFind;

    if (shouldStop) {
        debugLog(`TWL Enabler: Detected Ctrl+${key.toUpperCase()}. Stopping propagation.`);
        event.stopImmediatePropagation();
    }
}, true);

// Listener for the 'copy' event on window
window.addEventListener('copy', (event) => {
    if (settings.enableCopy) {
        debugLog("TWL Enabler: Detected copy event. Stopping propagation.");
        event.stopImmediatePropagation();
    }
}, true);

// Listener for the 'cut' event on window
window.addEventListener('cut', (event) => {
    if (settings.enableCopy) {
        debugLog("TWL Enabler: Detected cut event. Stopping propagation.");
        event.stopImmediatePropagation();
    }
}, true);

// Listener for the 'paste' event to handle trimmed pasting and framework synchronization
window.addEventListener('paste', (event) => {
    if (settings.enablePaste) {
        debugLog("TWL Enabler: Detected paste event.");
        event.stopImmediatePropagation();
        event.preventDefault(); // Prevent default paste to insert trimmed text

        const rawText = (event.clipboardData || window.clipboardData)?.getData('text/plain') || '';
        const text = rawText.trim();

        let inserted = false;
        try {
            inserted = document.execCommand("insertText", false, text);
        } catch (e) {
            inserted = false;
        }

        const activeElement = document.activeElement;

        // Fallback for custom or shadow inputs where execCommand fails
        if (!inserted && activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') && !activeElement.readOnly && !activeElement.disabled) {
            const start = activeElement.selectionStart ?? activeElement.value.length;
            const end = activeElement.selectionEnd ?? activeElement.value.length;
            const val = activeElement.value;
            activeElement.value = val.substring(0, start) + text + val.substring(end);
            activeElement.selectionStart = activeElement.selectionEnd = start + text.length;
            inserted = true;
        }

        // Dispatch synthetic events so page components update their internal models
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            activeElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            activeElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        }

        if (inserted) {
            debugLog(`TWL Enabler: Pasted trimmed text: "${text}"`);
        } else {
            console.warn("TWL Enabler: Could not paste text into active element.");
        }
    }
}, true);

// Listen for changes from the options page to apply settings in real time without refreshing
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync') {
        const keys = ['enableCopy', 'enablePaste', 'enableSelectAll', 'enableFind', 'enableUndo'];
        for (const key of keys) {
            if (changes[key] !== undefined) {
                settings[key] = changes[key].newValue !== false;
            }
        }
        if (changes.enableEnhancedPaste !== undefined) {
            settings.enableEnhancedPaste = changes.enableEnhancedPaste.newValue === true;
        }
        if (changes.enhancedPastePrefix !== undefined) {
            settings.enhancedPastePrefix = typeof changes.enhancedPastePrefix.newValue === 'string' ? changes.enhancedPastePrefix.newValue : 'o00';
        }
        if (changes.enhancedPasteStripAfterDash !== undefined) {
            settings.enhancedPasteStripAfterDash = changes.enhancedPasteStripAfterDash.newValue !== false;
        }
        debugLog('TWL Enabler: Settings updated dynamically.', settings);
    }
});

// Initialize the script to load settings
initialize();
