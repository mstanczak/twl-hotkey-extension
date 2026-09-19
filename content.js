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
const undoHistory = new WeakMap();
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
        'enhancedPasteStripAfterDash',
        'showToastNotification',
        'enhancedPasteAction'
    ];
    chrome.storage.sync.get(settingKeys, (loadedSettings) => {
        if (chrome.runtime.lastError) {
            console.error('TWL Enabler: Error loading settings:', chrome.runtime.lastError);
            return;
        }
        // Set defaults
        settings = {
            enableCopy: loadedSettings.enableCopy !== false,
            enablePaste: loadedSettings.enablePaste !== false,
            enableSelectAll: loadedSettings.enableSelectAll !== false,
            enableFind: loadedSettings.enableFind !== false,
            enableUndo: loadedSettings.enableUndo !== false,
            enableEnhancedPaste: loadedSettings.enableEnhancedPaste === true,
            enhancedPastePrefix: typeof loadedSettings.enhancedPastePrefix === 'string' ? loadedSettings.enhancedPastePrefix : 'o00',
            enhancedPasteStripAfterDash: loadedSettings.enhancedPasteStripAfterDash !== false,
            showToastNotification: loadedSettings.showToastNotification !== false,
            enhancedPasteAction: loadedSettings.enhancedPasteAction || 'none'
        };
        console.log('TWL Enabler: Settings loaded and active.', settings);
    });
}

// --- Shadow DOM & Framework Interop Helpers ---

/**
 * Traverses open Shadow DOM roots to find the truly active focused element.
 * Essential for Infor CloudSuite SoHo XI Web Components (e.g. <ids-input>).
 * @param {Document|ShadowRoot} [root=document]
 * @returns {Element|null}
 */
function getActiveElement(root = document) {
    let active = root.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
        active = active.shadowRoot.activeElement;
    }
    return active;
}

/**
 * Resolves an element to its inner editable input if wrapped by a custom Web Component.
 * @param {Element|null} el Target element.
 * @returns {Element|null} Resolved editable element or original element.
 */
function resolveEditableElement(el) {
    if (!el) return null;
    let target = el;
    while (target && target.shadowRoot && target.shadowRoot.activeElement) {
        target = target.shadowRoot.activeElement;
    }
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return target;
    }
    if (target && target.shadowRoot) {
        const inner = target.shadowRoot.querySelector('input:not([type="hidden"]), textarea');
        if (inner) return inner;
    }
    return target;
}

/**
 * Checks if an element is an editable text field (standard or Web Component).
 * @param {Element|null} el
 * @returns {boolean}
 */
function isEditableElement(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA') {
        return !el.readOnly && !el.disabled;
    }
    if (tag === 'INPUT') {
        const nonTextTypes = ['BUTTON', 'CHECKBOX', 'RADIO', 'RANGE', 'RESET', 'SUBMIT', 'FILE', 'IMAGE'];
        const type = (el.type || 'text').toUpperCase();
        if (nonTextTypes.includes(type)) return false;
        return !el.readOnly && !el.disabled;
    }
    return false;
}

/**
 * Sets an element's value using the native prototype setter so reactive frameworks (React, SoHo XI)
 * detect the change instead of having it bypassed or reverted.
 * @param {HTMLInputElement|HTMLTextAreaElement} element
 * @param {string} value
 */
function setNativeValue(element, value) {
    if (!element) return;
    const prototype = element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor && descriptor.set) {
        descriptor.set.call(element, value);
    } else {
        element.value = value;
    }
}

// --- Undo (Ctrl+Z) Functionality ---

/**
 * Saves the current state of an input element to its undo history.
 * @param {HTMLInputElement|HTMLTextAreaElement} element The input element.
 */
function saveState(element) {
    if (!element || typeof element.value !== 'string') return;
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
    if (!element || !undoHistory.has(element)) return;
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
        setNativeValue(element, targetValue);
        try {
            element.selectionStart = element.selectionEnd = targetValue.length;
        } catch (e) {
            // Some input types (number, email) throw on selectionStart
        }
        try {
            element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'historyUndo' }));
        } catch (e) {
            element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }
        element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }
}

// --- Toast Notification UI ---

let activeToast = null;
let toastTimeout = null;

/**
 * Displays a non-intrusive toast notification in the bottom right corner of the screen.
 * @param {string} message The message to display.
 * @param {string} [type='info'] Notification type ('info', 'success', 'warning').
 */
function showToast(message, type = 'info') {
    if (!settings.showToastNotification) return;

    let targetDoc = document;
    try {
        if (window.top && window.top.document && window.top.document.documentElement) {
            targetDoc = window.top.document;
        }
    } catch (e) {
        targetDoc = document;
    }

    if (!activeToast || activeToast.ownerDocument !== targetDoc) {
        activeToast = targetDoc.createElement('div');
        activeToast.id = 'twl-hotkey-toast';
        activeToast.setAttribute('role', 'status');
        activeToast.setAttribute('aria-live', 'polite');
        activeToast.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 2147483647;
            padding: 10px 16px;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 13px;
            font-weight: 500;
            line-height: 1.4;
            color: #ffffff;
            background-color: #1e293b;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1);
            opacity: 0;
            transform: translateY(12px) scale(0.96);
            transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: none;
            display: flex;
            align-items: center;
            gap: 8px;
            max-width: 360px;
        `;
        targetDoc.documentElement.appendChild(activeToast);
    }

    // Indicator color accent
    const accentColor = type === 'success' ? '#10b981' : (type === 'warning' ? '#f59e0b' : '#3b82f6');
    activeToast.innerHTML = `
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${accentColor};flex-shrink:0;"></span>
        <span>${message}</span>
    `;

    // Force reflow and show
    void activeToast.offsetWidth;
    activeToast.style.opacity = '1';
    activeToast.style.transform = 'translateY(0) scale(1)';

    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    toastTimeout = setTimeout(() => {
        if (activeToast) {
            activeToast.style.opacity = '0';
            activeToast.style.transform = 'translateY(12px) scale(0.96)';
        }
    }, 2200);
}

// --- Post-Paste Action (Scanner Simulation: Enter / Tab) ---

/**
 * Performs optional post-paste action such as simulating Enter or focusing the next field.
 * @param {HTMLElement} element The target input/textarea element.
 */
function handlePostPasteAction(element) {
    if (!settings.enhancedPasteAction || settings.enhancedPasteAction === 'none' || !element) {
        return;
    }

    if (settings.enhancedPasteAction === 'enter') {
        debugLog('TWL Enabler: Simulating Enter key after paste.');
        const enterInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        element.dispatchEvent(new KeyboardEvent('keydown', enterInit));
        element.dispatchEvent(new KeyboardEvent('keypress', enterInit));
        element.dispatchEvent(new KeyboardEvent('keyup', enterInit));

        // If part of a form, check for standard submit button or trigger form submit
        if (element.form) {
            const submitBtn = element.form.querySelector('button[type="submit"], input[type="submit"]');
            if (submitBtn) {
                submitBtn.click();
            }
        }
    } else if (settings.enhancedPasteAction === 'tab') {
        debugLog('TWL Enabler: Simulating Tab focus progression after paste.');
        const focusables = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
        const currentIndex = focusables.indexOf(element);
        if (currentIndex !== -1 && currentIndex + 1 < focusables.length) {
            focusables[currentIndex + 1].focus();
        }
    }
}

// --- Paste Execution Helpers ---

/**
 * Formats order number text per TWL rules.
 * @param {string} rawText The raw clipboard string.
 * @returns {string} Formatted TWL order number.
 */
function formatOrderNumber(rawText) {
    let text = (rawText || '').trim();
    if (settings.enhancedPasteStripAfterDash) {
        text = text.split('-')[0].trim();
    } else {
        text = text.replace(/-/g, '').trim();
    }
    const prefix = settings.enhancedPastePrefix || '';
    if (prefix && text.toLowerCase().startsWith(prefix.toLowerCase())) {
        return prefix + text.slice(prefix.length);
    }
    return prefix + text;
}

/**
 * Inserts formatted text into an editable element and handles change dispatching and history.
 * @param {HTMLInputElement|HTMLTextAreaElement} element Target element.
 * @param {string} text Text to insert.
 * @returns {boolean} True if insertion succeeded.
 */
function insertTextIntoElement(element, text) {
    if (!element) return false;

    // Focus element to ensure document.execCommand targets it
    try {
        if (typeof element.focus === 'function' && document.activeElement !== element) {
            element.focus();
        }
    } catch (e) {}

    if (settings.enableUndo && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) {
        saveState(element);
    }

    let inserted = false;
    try {
        inserted = document.execCommand('insertText', false, text);
    } catch (e) {
        inserted = false;
    }

    if (!inserted && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') && !element.readOnly && !element.disabled) {
        let start = element.value ? element.value.length : 0;
        let end = start;
        let canSelect = false;

        try {
            if (typeof element.selectionStart === 'number') {
                start = element.selectionStart;
                end = element.selectionEnd ?? start;
                canSelect = true;
            }
        } catch (e) {
            // Some input types (number, email, date) throw DOMException on selectionStart
            canSelect = false;
        }

        const val = element.value || '';
        const newVal = val.substring(0, start) + text + val.substring(end);
        setNativeValue(element, newVal);

        if (canSelect) {
            try {
                element.selectionStart = element.selectionEnd = start + text.length;
            } catch (e) {}
        }
        inserted = true;
    } else if (!inserted && element.isContentEditable) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            const textNode = document.createTextNode(text);
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.setEndAfter(textNode);
            sel.removeAllRanges();
            sel.addRange(range);
            inserted = true;
        }
    }

    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        try {
            element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertFromPaste', data: text }));
        } catch (e) {
            element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }
        element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }

    return inserted;
}

/**
 * Performs an Enhanced TWL Order Paste into the specified or active element.
 * @param {HTMLElement} [targetElement] Optional explicit target element.
 */
function performEnhancedPaste(targetElement) {
    const el = resolveEditableElement(targetElement) || resolveEditableElement(getActiveElement());
    const isEditable = isEditableElement(el);

    if (!isEditable) {
        showToast('Click an input field first to paste order', 'warning');
        return;
    }

    try { el.focus(); } catch (e) {}

    navigator.clipboard.readText().then((rawText) => {
        if (!rawText) {
            showToast('Clipboard is empty', 'warning');
            return;
        }

        const formattedText = formatOrderNumber(rawText);
        const success = insertTextIntoElement(el, formattedText);

        if (success) {
            debugLog(`TWL Enabler: Enhanced pasted order number: "${formattedText}"`);
            showToast(`Pasted TWL Order: ${formattedText}`, 'success');
            handlePostPasteAction(el);
        } else {
            console.warn("TWL Enabler: Could not paste enhanced text into active element.");
        }
    }).catch((err) => {
        console.warn('TWL Enabler: Failed to read clipboard for Enhanced Paste:', err);
        showToast('Clipboard access denied or unavailable', 'warning');
    });
}

/**
 * Performs a standard Trimmed Paste into the specified or active element.
 * @param {HTMLElement} [targetElement] Optional explicit target element.
 */
function performTrimmedPaste(targetElement) {
    const el = resolveEditableElement(targetElement) || resolveEditableElement(getActiveElement());
    if (!el || !isEditableElement(el)) return;

    try { el.focus(); } catch (e) {}

    navigator.clipboard.readText().then((rawText) => {
        if (!rawText) return;
        const text = rawText.trim();
        const success = insertTextIntoElement(el, text);
        if (success) {
            debugLog(`TWL Enabler: Pasted trimmed text: "${text}"`);
        }
    }).catch((err) => {
        console.warn('TWL Enabler: Failed to read clipboard for Trimmed Paste:', err);
    });
}

// --- Event Listeners Attached to window (Highest Capture Priority) ---

// Use 'focusin' and 'input' on window to manage state for the Undo feature.
window.addEventListener('focusin', (event) => {
    const target = resolveEditableElement(event.target);
    if (settings.enableUndo && target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        saveState(target);
    }
}, true);

window.addEventListener('input', (event) => {
    const target = resolveEditableElement(event.target);
    if (settings.enableUndo && target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        saveState(target);
    }
}, true);

// Main keydown listener to intercept and manage all hotkeys on window.
window.addEventListener('keydown', (event) => {
    const isCtrlPressed = event.ctrlKey || event.metaKey;
    if (!isCtrlPressed) return;

    const key = (event.key || '').toLowerCase();
    const activeElement = resolveEditableElement(getActiveElement());

    // Handle Undo (Ctrl+Z) - ensure Shift is not pressed (so Ctrl+Shift+Z / Redo is not hijacked)
    if (settings.enableUndo && !event.shiftKey && key === 'z') {
        if (activeElement && isEditableElement(activeElement)) {
            debugLog('TWL Enabler: Undo triggered.');
            event.preventDefault();
            event.stopImmediatePropagation();
            undo(activeElement);
        }
        return;
    }

    // Handle Enhanced TWL Order Paste (Ctrl+O)
    if (settings.enableEnhancedPaste && !event.shiftKey && key === 'o') {
        if (activeElement && isEditableElement(activeElement)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            debugLog('TWL Enabler: Enhanced Paste (Ctrl+O) triggered via keyboard.');
            performEnhancedPaste(activeElement);
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
        // Always stop propagation to prevent TWL hostile scripts from blocking the paste!
        event.stopImmediatePropagation();

        const clipboardData = event.clipboardData || window.clipboardData;
        if (!clipboardData) return;

        // If the paste solely contains files/images and no plain text,
        // allow the browser / host application to handle native file/image pasting!
        const hasFiles = clipboardData.types && (clipboardData.types.includes('Files') || (clipboardData.files && clipboardData.files.length > 0));
        const rawText = clipboardData.getData('text/plain');

        if (!rawText && hasFiles) {
            debugLog("TWL Enabler: Paste contains files with no plain text. Allowing default file paste.");
            return;
        }

        // Identify the target editable element (checking event.target first, then activeElement, drilling through Shadow DOM)
        const targetElement = resolveEditableElement(event.target) || resolveEditableElement(getActiveElement());
        if (!targetElement || !isEditableElement(targetElement)) {
            debugLog("TWL Enabler: Target is not editable. Allowing default paste.");
            return;
        }

        // Only prevent default if we actually have text to trim and an editable element to insert into
        if (typeof rawText === 'string') {
            event.preventDefault();
            const text = rawText.trim();
            insertTextIntoElement(targetElement, text);
            debugLog(`TWL Enabler: Pasted trimmed text: "${text}"`);
        }
    }
}, true);

// Listen for messages from background script (Context menu clicks & Commands)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) return;

    if (message.action === 'context-menu-paste-order' || message.action === 'trigger-enhanced-paste') {
        performEnhancedPaste();
        sendResponse({ success: true });
    } else if (message.action === 'context-menu-paste-trimmed') {
        performTrimmedPaste();
        sendResponse({ success: true });
    } else if (message.action === 'ping-status') {
        sendResponse({ active: true, settings });
    }
});

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
        if (changes.showToastNotification !== undefined) {
            settings.showToastNotification = changes.showToastNotification.newValue !== false;
        }
        if (changes.enhancedPasteAction !== undefined) {
            settings.enhancedPasteAction = changes.enhancedPasteAction.newValue || 'none';
        }
        debugLog('TWL Enabler: Settings updated dynamically.', settings);
    }
});

// Initialize the script to load settings
initialize();
