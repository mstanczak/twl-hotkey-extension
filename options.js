// DOM Elements
const optionsForm = document.getElementById('options-form');
const selectAllCheckbox = document.getElementById('select-all');
const featureCheckboxes = document.querySelectorAll('.feature-checkbox');
const statusMessage = document.getElementById('status-message');
const celebrationContainer = document.getElementById('celebration-container');

// Enhanced Paste & Advanced DOM Elements
const advancedPanel = document.getElementById('advanced-panel');
const enhancedPasteCheckbox = document.getElementById('feature-enhanced-paste');
const enhancedPasteSuboptions = document.getElementById('enhanced-paste-suboptions');
const enhancedPastePrefixInput = document.getElementById('enhanced-paste-prefix');
const enhancedPasteStripSuffixCheckbox = document.getElementById('enhanced-paste-strip-suffix');

// Maps the checkbox ID to the setting key in chrome.storage
const featureMapping = {
    'feature-copy': 'enableCopy',
    'feature-paste': 'enablePaste',
    'feature-select-all': 'enableSelectAll',
    'feature-find': 'enableFind',
    'feature-undo': 'enableUndo',
    'feature-enhanced-paste': 'enableEnhancedPaste'
};

/**
 * Saves the current state of the options to chrome.storage.sync.
 */
function saveOptions() {
    const settings = {};
    featureCheckboxes.forEach(checkbox => {
        const settingKey = featureMapping[checkbox.id];
        if (settingKey) {
            settings[settingKey] = checkbox.checked;
        }
    });

    // Save Enhanced Paste specific sub-options
    const prefixValue = enhancedPastePrefixInput.value.trim();
    settings.enhancedPastePrefix = prefixValue !== '' ? prefixValue : 'o00';
    settings.enhancedPasteStripAfterDash = enhancedPasteStripSuffixCheckbox.checked;

    chrome.storage.sync.set(settings, () => {
        if (chrome.runtime.lastError) {
            console.error('Error saving options:', chrome.runtime.lastError);
            statusMessage.textContent = 'Error saving settings.';
            statusMessage.classList.remove('success');
            statusMessage.classList.add('error');
        } else {
            // Display a confirmation message
            statusMessage.textContent = 'Settings Saved!';
            statusMessage.classList.remove('error');
            statusMessage.classList.add('success');
        }

        statusMessage.style.opacity = '1';
        setTimeout(() => {
            statusMessage.style.opacity = '0';
        }, 2000);
    });
}

/**
 * Loads options from chrome.storage.sync and updates the UI.
 */
function loadOptions() {
    const settingKeys = [
        ...Object.values(featureMapping),
        'enhancedPastePrefix',
        'enhancedPasteStripAfterDash'
    ];
    chrome.storage.sync.get(settingKeys, (settings) => {
        if (chrome.runtime.lastError) {
            console.error('Error loading options:', chrome.runtime.lastError);
            statusMessage.textContent = 'Error loading settings.';
            statusMessage.classList.add('error');
            statusMessage.style.opacity = '1';
            return;
        }
        
        // Default to true if a setting is undefined in storage
        document.getElementById('feature-copy').checked = settings.enableCopy !== false;
        document.getElementById('feature-paste').checked = settings.enablePaste !== false;
        document.getElementById('feature-select-all').checked = settings.enableSelectAll !== false;
        document.getElementById('feature-find').checked = settings.enableFind !== false;
        document.getElementById('feature-undo').checked = settings.enableUndo !== false;

        // Enhanced paste defaults to false, prefix to 'o00', strip suffix defaults to true
        enhancedPasteCheckbox.checked = settings.enableEnhancedPaste === true;
        enhancedPastePrefixInput.value = typeof settings.enhancedPastePrefix === 'string' ? settings.enhancedPastePrefix : 'o00';
        enhancedPasteStripSuffixCheckbox.checked = settings.enhancedPasteStripAfterDash !== false;

        // Automatically expand advanced panel if enhanced paste is currently enabled
        if (advancedPanel && settings.enableEnhancedPaste === true) {
            advancedPanel.open = true;
        }

        updateSuboptionsState();
        updateSelectAllState();
    });
}

/**
 * Updates the disabled/visibility state of the Enhanced Paste sub-options.
 */
function updateSuboptionsState() {
    const isEnabled = enhancedPasteCheckbox.checked;
    enhancedPasteSuboptions.classList.toggle('disabled', !isEnabled);
    enhancedPastePrefixInput.disabled = !isEnabled;
    enhancedPasteStripSuffixCheckbox.disabled = !isEnabled;
}

/**
 * Updates the 'Select All' checkbox based on individual checkbox states.
 */
function updateSelectAllState() {
    const allChecked = Array.from(featureCheckboxes).every(checkbox => checkbox.checked);
    selectAllCheckbox.checked = allChecked;
}

/**
 * Handles changes to the 'Select All' checkbox.
 */
function handleSelectAllChange() {
    const isChecked = selectAllCheckbox.checked;
    featureCheckboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
    });
    updateSelectAllState();
    updateSuboptionsState();
    triggerAnimation(isChecked);
}

/**
 * Handles changes to any individual feature checkbox.
 * @param {Event} event The DOM event object.
 */
function handleFeatureChange(event) {
    if (event.target === enhancedPasteCheckbox) {
        updateSuboptionsState();
    }
    updateSelectAllState();
    triggerAnimation(event.target.checked);
}

/**
 * Triggers a visual animation based on whether a feature was enabled or disabled.
 * @param {boolean} isHappy - True for a happy (enabled) animation, false for sad (disabled).
 */
function triggerAnimation(isHappy) {
    celebrationContainer.innerHTML = ''; // Clear previous animations

    // Updated happy colors to match the new theme
    const happyColors = ['#2e64b0', '#f472b6', '#4ade80', '#fbbf24', '#3b82f6'];
    const sadColors = ['#9ca3af', '#6b7280', '#4b5563'];

    // Whimsical shapes for the happy state
    const happyShapes = [
        // Sparkle
        `<path d="M5 0 L6.1 3.9 L10 5 L6.1 6.1 L5 10 L3.9 6.1 L0 5 L3.9 3.9 Z" />`,
        // Swirl
        `<path d="M2 5 C 2 2, 8 2, 8 5 S 2 8, 8 8" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round"/>`,
        // Happy Face
        `<circle cx="5" cy="5" r="4.5" fill="none" stroke="currentColor" stroke-width="1"/><path d="M3 6 Q5 7.5 7 6" stroke="currentColor" fill="none" stroke-width="1" stroke-linecap="round"/><circle cx="3.5" cy="4" r="0.5" fill="currentColor"/><circle cx="6.5" cy="4" r="0.5" fill="currentColor"/>`,
        // Bouncy bubble
        `<circle cx="5" cy="5" r="4" />`
    ];
    
    // More expressive and whimsical shapes for the sad state
    const sadShapes = [
        // Sad Face
        `<circle cx="5" cy="5" r="4.5" fill="none" stroke="currentColor" stroke-width="1"/><path d="M3 7 Q5 5.5 7 7" stroke="currentColor" fill="none" stroke-width="1" stroke-linecap="round"/><circle cx="3.5" cy="4" r="0.5" fill="currentColor"/><circle cx="6.5" cy="4" r="0.5" fill="currentColor"/>`,
        // Crying Face
        `<circle cx="5" cy="5" r="4.5" fill="none" stroke="currentColor" stroke-width="1"/><path d="M3 7 Q5 5.5 7 7" stroke="currentColor" fill="none" stroke-width="1" stroke-linecap="round"/><circle cx="3.5" cy="4" r="0.5" fill="currentColor"/><circle cx="6.5" cy="4" r="0.5" fill="currentColor"/><path d="M3 5.5 L2.5 7.5 M7 5.5 L7.5 7.5" stroke="currentColor" fill="none" stroke-width="0.7" stroke-linecap="round"/>`,
        // Sad Firework Burst / Fizzle
        `<path d="M5 5 L4 3 M5 5 L6 3 M5 5 L3 5 M5 5 L7 5 M5 5 L4 7 M5 5 L6 7" stroke="currentColor" fill="none" stroke-width="1" stroke-linecap="round"/>`,
        // Dripping / Melting Shape
        `<path d="M5 0 C 2 3, 8 3, 5 5 C 2 7, 8 7, 5 10" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round"/>`
    ];

    const colors = isHappy ? happyColors : sadColors;
    const shapes = isHappy ? happyShapes : sadShapes;
    const animationName = isHappy ? 'celebrate' : 'fall-sadly';
    const particleCount = 50; // More particles for more chaos

    for (let i = 0; i < particleCount; i++) {
        const spiritWrapper = document.createElement('div');
        spiritWrapper.classList.add('spirit');
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 10 10');
        const size = Math.random() * 25 + 20; // Even bigger SVGs
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.innerHTML = shapes[Math.floor(Math.random() * shapes.length)];
        
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        // Use fill for solid shapes, stroke for paths
        svg.style.fill = 'none';
        svg.style.stroke = 'none';
        
        const hasStrokeOnly = svg.querySelector('path[fill="none"], circle[fill="none"]');
        if (hasStrokeOnly) {
            svg.style.stroke = randomColor;
        } else {
            svg.style.fill = randomColor;
        }
        
        spiritWrapper.appendChild(svg);
        celebrationContainer.appendChild(spiritWrapper);

        // Randomize animation properties for more dynamic movement
        const xEnd = (Math.random() - 0.5) * 1400; // Much wider spread
        const yEnd = (Math.random() - 0.5) * 1400; // Much wider spread
        const scaleEnd = Math.random() * 0.5 + 0.2;
        const rotation = (Math.random() - 0.5) * 1440; // More rotation
        const duration = Math.random() * 2 + 2; // Longer duration
        const delay = Math.random() * 0.4;

        spiritWrapper.style.setProperty('--x-end', `${xEnd}px`);
        spiritWrapper.style.setProperty('--y-end', `${yEnd}px`);
        spiritWrapper.style.setProperty('--scale-end', scaleEnd);
        spiritWrapper.style.setProperty('--rotation', `${rotation}deg`);
        spiritWrapper.style.animation = `${animationName} ${duration}s cubic-bezier(0.1, 0.8, 0.2, 1) ${delay}s forwards`;
    }

    // Clean up the DOM after animations finish
    setTimeout(() => {
        celebrationContainer.innerHTML = '';
    }, 5000);
}

// --- Event Listeners ---

// Load settings when the page is ready
document.addEventListener('DOMContentLoaded', loadOptions);

// Handle 'Select All' checkbox changes
selectAllCheckbox.addEventListener('change', handleSelectAllChange);

// Handle individual feature checkbox changes
featureCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', handleFeatureChange);
});

// Handle the form submission to save settings
optionsForm.addEventListener('submit', (event) => {
    event.preventDefault(); // Prevent default form submission
    saveOptions();
});
	