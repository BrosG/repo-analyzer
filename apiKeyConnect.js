import { EXTENSION_ID, AI_PROVIDERS } from './config.js';
import { AppState, updateState } from './state.js';
import { Elements, updateConnectionStatus } from './ui.js';

const APIKEYCONNECT_STORE_URL = 'https://chromewebstore.google.com/detail/apikey-connect/edkgcdpbaggofodchjfkfiblhohmkbac';

/**
 * Main function to initiate connection process for the currently selected AI provider.
 */
export function connectApi() {
    if (AppState.isConnecting) {
        console.warn("Connection attempt already in progress.");
        return; // Prevent multiple clicks
    }

    // --- Basic Checks ---
    const selectedProviderId = Elements.aiProviderSelect?.value || AppState.aiProvider || 'openai';
    const providerConfig = AI_PROVIDERS[selectedProviderId];
    if (!providerConfig) {
        console.error(`Config missing for provider: ${selectedProviderId}`);
        alert(`Internal Error: Config missing for ${selectedProviderId}.`);
        return;
    }

    // Check for secure context - extension API requires this
    if (!window.isSecureContext) {
        alert("Secure connection required. Please access via HTTPS.");
        return;
    }

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        alert("Requires a Chromium browser with extension support.");
        return;
    }

    // --- Start Connection Attempt ---
    updateState({ isConnecting: true });
    Elements.apiStatusEl.textContent = `Checking APIKeyConnect...`;
    Elements.apiStatusEl.className = 'key-status';
    Elements.connectApiBtn.disabled = true;
    Elements.connectApiBtn.innerHTML = `<span class="spinner"></span> Pinging...`;

    // Set a timeout to handle case where extension doesn't respond
    const pingTimeout = setTimeout(() => {
        console.warn("Extension ping timed out");
        showExtensionRequired(providerConfig.name);
        updateState({ isConnecting: false });
    }, 2000);

    try {
        console.log(`Pinging APIKeyConnect (ID: ${EXTENSION_ID})...`);
        chrome.runtime.sendMessage(
            EXTENSION_ID, 
            { type: 'ping' },
            function(response) {
                clearTimeout(pingTimeout);
                
                // Check for Chrome runtime error
                if (chrome.runtime.lastError) {
                    console.warn(`APIKeyConnect ping failed: ${chrome.runtime.lastError.message}`);
                    showExtensionRequired(providerConfig.name);
                    updateState({ isConnecting: false });
                    return;
                }
                
                if (!response || !response.success) {
                    console.warn(`APIKeyConnect ping failed or returned unsuccessful:`, response);
                    showExtensionRequired(providerConfig.name);
                    updateState({ isConnecting: false });
                    return;
                }
                
                // Extension is active - directly try requesting key IMMEDIATELY after ping
                // This is crucial - popup authorization needs to be close to user interaction
                console.log("APIKeyConnect extension active. Directly requesting key...");
                
                // First try without specifying a key name (uses default key)
                requestDefaultKey(providerConfig);
            }
        );
    } catch (error) {
        clearTimeout(pingTimeout);
        console.error(`Error sending initial ping to APIKeyConnect:`, error);
        showExtensionRequired(providerConfig.name);
        updateState({ isConnecting: false });
    }
}

/**
 * First try requesting default key without specifying a name
 * This is more likely to trigger the authorization popup immediately
 */
function requestDefaultKey(providerConfig) {
    Elements.connectApiBtn.innerHTML = `<span class="spinner"></span> Requesting Key...`;
    
    try {
        chrome.runtime.sendMessage(
            EXTENSION_ID,
            { 
                type: 'requestKey', 
                serviceId: providerConfig.serviceId,
                // No keyName specified - tries default key
            },
            function(response) {
                if (chrome.runtime.lastError) {
                    console.warn(`Error requesting default key: ${chrome.runtime.lastError.message}`);
                    // Fall back to trying specific key names
                    tryNextKeyName(0, providerConfig);
                    return;
                }
                
                if (response && response.success && response.key) {
                    console.log(`Retrieved default key for ${providerConfig.name}`);
                    handleSuccessfulConnection(response.key, providerConfig);
                } else {
                    // No default key found, try specific names
                    console.log("No default key found, trying specific key names...");
                    tryNextKeyName(0, providerConfig);
                }
            }
        );
    } catch (error) {
        console.error(`Error requesting default key: ${error}`);
        tryNextKeyName(0, providerConfig);
    }
}

/**
 * **MODIFIED:** Updates the UI to prompt for installation *persistently*.
 */
function showExtensionRequired(providerName = 'AI Provider') {
    console.log("APIKeyConnect extension required.");
    if (!Elements.apiStatusEl || !Elements.connectApiBtn) return; // Guard

    Elements.apiStatusEl.textContent = '❌ Extension Required';
    Elements.apiStatusEl.className = 'key-status error';
    Elements.connectApiBtn.disabled = false;
    Elements.connectApiBtn.innerHTML = 'Install APIKeyConnect'; // Set button text

    // **CRITICAL:** Remove previous listeners and set the new one
    Elements.connectApiBtn.onclick = null; // Remove previous listener first
    Elements.connectApiBtn.onclick = () => { // Assign new listener
        console.log("Opening APIKeyConnect store page...");
        window.open(APIKEYCONNECT_STORE_URL, '_blank');

        // Update status to guide user
        Elements.apiStatusEl.textContent = 'Install extension, then Refresh Page & Connect.';
        Elements.connectApiBtn.innerHTML = 'Install Extension'; // Keep text as Install
        Elements.connectApiBtn.disabled = true; // Briefly disable after click

        // Optionally re-enable after a delay, but keep the 'Install' text/action
        setTimeout(() => {
            Elements.connectApiBtn.disabled = false;
            // Keep the 'Install' text and the onclick handler pointing to the store
        }, 2000);
    };

    // Reset the connecting flag if it was set
    if (AppState.isConnecting) {
         updateState({ isConnecting: false });
    }
}

/**
 * Recursively try potential key names defined in the provider config.
 */
function tryNextKeyName(index, providerConfig) {
    const keyNames = providerConfig.keyNames;

    if (index >= keyNames.length) {
        // Tried all names, none found
        Elements.apiStatusEl.textContent = `❌ No ${providerConfig.name} Key Found`;
        Elements.apiStatusEl.className = 'key-status error';
        alert(`No key found for ${providerConfig.name} in APIKeyConnect.\n\nPlease add a key with one of these names:\n- ${keyNames.join('\n- ')}\n\nThen click Connect again.`);
        resetConnectionState(providerConfig.name); // Reset UI/state after alert
        return;
    }

    const currentKeyName = keyNames[index];
    Elements.apiStatusEl.textContent = `Checking key: "${currentKeyName}"...`;

    chrome.runtime.sendMessage(
        EXTENSION_ID,
        { type: 'requestKey', serviceId: providerConfig.serviceId, keyName: currentKeyName },
        (response) => {
            if (chrome.runtime.lastError) {
                console.warn(`Error requesting key "${currentKeyName}": ${chrome.runtime.lastError.message}`);
                setTimeout(() => tryNextKeyName(index + 1, providerConfig), 200);
                return;
            }
            if (response && response.success && response.key) {
                console.log(`Retrieved key for ${providerConfig.name} using name "${currentKeyName}".`);
                handleSuccessfulConnection(response.key, providerConfig); // SUCCESS
            } else {
                if (response && response.error) console.log(`Key "${currentKeyName}" error: ${response.error}`);
                else console.log(`Key "${currentKeyName}" not found.`);
                setTimeout(() => tryNextKeyName(index + 1, providerConfig), 200); // Try next
            }
        }
    );
}

/**
 * Handle successful API key retrieval: update state and UI.
 */
function handleSuccessfulConnection(key, providerConfig) {
    updateState({
        apiKey: key,
        isConnected: true,
        isConnecting: false,
    });
    localStorage.setItem(`${providerConfig.serviceId}_api_key`, key);
    localStorage.setItem('last_connected_provider', providerConfig.serviceId);

    updateConnectionStatus(true, providerConfig.name);
    // CRITICAL: Ensure the button's onclick is reset to the default connect action
    Elements.connectApiBtn.onclick = connectApi;
}

/**
 * Reset UI and state, typically after a key lookup failure (not after missing extension).
 */
function resetConnectionState(providerName = 'AI Provider') {
    updateState({ apiKey: '', isConnected: false, isConnecting: false });
    // Update button text based on currently selected provider
    const currentProviderId = Elements.aiProviderSelect?.value || AppState.aiProvider || 'openai';
    const currentProviderName = AI_PROVIDERS[currentProviderId]?.name || providerName;
    updateConnectionStatus(false, currentProviderName); // Update UI status correctly
    // Ensure the correct listener is attached
    Elements.connectApiBtn.onclick = connectApi;
}

/**
 * Check local storage for previously connected keys on initial page load.
 */
export function checkSavedKeys() {
    const lastProviderId = localStorage.getItem('last_connected_provider');
    let connected = false;
    if (lastProviderId && AI_PROVIDERS[lastProviderId]) {
        const savedKey = localStorage.getItem(`${lastProviderId}_api_key`);
        if (savedKey) {
            console.log(`Found saved key for last provider: ${AI_PROVIDERS[lastProviderId].name}`);
            updateState({ apiKey: savedKey, isConnected: true, aiProvider: lastProviderId });
            if (Elements.aiProviderSelect) Elements.aiProviderSelect.value = lastProviderId;
            updateConnectionStatus(true, AI_PROVIDERS[lastProviderId].name);
            connected = true;
        }
    }
    // If not auto-connected, ensure the initial button text is correct
    if (!connected) {
        updateInitialConnectButtonText();
        // Check if the extension exists on load, maybe? Optional enhancement.
        // Could do a silent ping here.
    }
}

/**
 * Helper to set initial button text based on default selected provider in dropdown.
 */
function updateInitialConnectButtonText() {
    if (!Elements.aiProviderSelect || !Elements.connectApiBtn) return;
    const initialProviderId = Elements.aiProviderSelect.value;
    const initialProviderName = AI_PROVIDERS[initialProviderId]?.name || 'AI Provider';
    if (!AppState.isConnected) {
        Elements.connectApiBtn.textContent = `Connect ${initialProviderName} API`;
         // Re-attach default listener on load if not connected
         Elements.connectApiBtn.onclick = connectApi;
    }
}
