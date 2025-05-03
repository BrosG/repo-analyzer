// --- Module Imports ---
import { AppState, updateState } from './state.js';
import { AI_PROVIDERS } from './config.js'; // Import provider config
import { Elements, initUI, toggleDarkMode, updateConnectionStatus } from './ui.js'; // Import UI functions and Elements ref
import { connectApi, checkSavedKeys } from './apiKeyConnect.js'; // Import connection logic
import { startAnalysis } from './analysisOrchestrator.js'; // Import the main analysis function
import { loadPrompts } from './promptLoader.js'; // Import prompt loader

// --- Initialization on DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM Loaded. Initializing RepoAnalyzer...");

    // 1. Select DOM Elements & Initialize UI Module
    const elementSelectors = {
        connectApiBtn: document.getElementById('connectApiBtn'),
        apiStatusEl: document.getElementById('apiStatus'),
        repoUrlInput: document.getElementById('repoUrl'),
        aiProviderSelect: document.getElementById('aiProviderSelect'),
        analysisDepthSelect: document.getElementById('analysisDepth'),
        analyzeBtn: document.getElementById('analyzeBtn'),
        resultsSection: document.getElementById('results'),
        repoInfoEl: document.getElementById('repoInfo'),
        repoSummaryEl: document.getElementById('repoSummary'),
        dirTreeEl: document.getElementById('dirTree'),
        issuesListEl: document.getElementById('issuesList'),
        processingPopup: document.getElementById('processingPopup'),
        processingStepsEl: document.getElementById('processingSteps'),
        progressBarEl: document.getElementById('progressBar'),
        statusTextEl: document.getElementById('statusText'),
        themeToggleBtn: document.getElementById('themeToggleBtn')
    };
    initUI(elementSelectors); // Make elements available to the ui module

    // 2. Load AI Prompts (Essential before proceeding)
    await loadPrompts(); // Wait for prompts

    // 3. Initialize Theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    updateState({ theme: savedTheme }); // Update state if needed
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }
    // Ensure button icon matches theme (toggleDarkMode handles the update visually)
    if (Elements.themeToggleBtn) {
        Elements.themeToggleBtn.innerHTML = document.body.classList.contains('dark-theme')
            ? '<i class="fas fa-sun" aria-hidden="true"></i>'
            : '<i class="fas fa-moon" aria-hidden="true"></i>';
    }

    // 4. Check for Saved API Keys & Set Initial UI State
    checkSavedKeys(); // Checks local storage and updates connection status/dropdown if key found

    // 5. Setup Event Listeners

    // Theme Toggle Button
    Elements.themeToggleBtn?.addEventListener('click', toggleDarkMode);

    // Connect API Button
    Elements.connectApiBtn?.addEventListener('click', connectApi);

    // AI Provider Dropdown Change
    Elements.aiProviderSelect?.addEventListener('change', (event) => {
        const selectedProviderId = event.target.value;
        const providerConfig = AI_PROVIDERS[selectedProviderId];
        const providerName = providerConfig?.name || 'AI Provider';

        console.log(`Provider selection changed to: ${providerName} (${selectedProviderId})`);

        // Update AppState with the selected provider
        updateState({ aiProvider: selectedProviderId });

        // Check if we have a stored key for this NEWLY selected provider
        const savedKey = localStorage.getItem(`${selectedProviderId}_api_key`);

        if (savedKey) {
            // Found a key for the selected provider, update state and UI
            console.log(`Found stored key for ${providerName}. Updating status.`);
            updateState({
                apiKey: savedKey,
                isConnected: true,
                isConnecting: false // Ensure connecting flag is off
            });
            updateConnectionStatus(true, providerName);
        } else {
            // No key found for this provider, reset connection state
            console.log(`No stored key found for ${providerName}. Resetting status.`);
            updateState({
                apiKey: '',
                isConnected: false,
                isConnecting: false
            });
            updateConnectionStatus(false, providerName); // Update button text and status indicator
        }
    });

    // Analysis Form Submission
    const analysisForm = document.getElementById('repoAnalysisForm');
    analysisForm?.addEventListener('submit', (event) => {
        event.preventDefault(); // Prevent standard form submission
        console.log("Analysis form submitted.");
        startAnalysis(); // Call the main analysis orchestrator function
    });

    console.log("RepoAnalyzer Event Listeners Attached.");
}); // End DOMContentLoaded