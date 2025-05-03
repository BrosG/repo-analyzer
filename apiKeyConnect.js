import { EXTENSION_ID, AI_PROVIDERS } from './config.js';
import { AppState, updateState } from './state.js';
import { Elements, updateConnectionStatus } from './ui.js';

const APIKEYCONNECT_STORE_URL = 'https://chromewebstore.google.com/detail/apikey-connect/edkgcdpbaggofodchjfkfiblhohmkbac';

/**
 * Main function to initiate connection process for the currently selected AI provider.
 */
export function connectApi() {
    // Force reset the connection state
    updateState({ isConnecting: false });
    
    // --- Basic Setup ---
    const selectedProviderId = Elements.aiProviderSelect?.value || AppState.aiProvider || 'openai';
    const providerConfig = AI_PROVIDERS[selectedProviderId];
    
    if (!providerConfig) {
        console.error(`Config missing for provider: ${selectedProviderId}`);
        alert(`Internal Error: Config missing for ${selectedProviderId}.`);
        return;
    }
    
    // Show initial connecting message
    Elements.apiStatusEl.textContent = `Connecting to extension...`;
    Elements.apiStatusEl.className = 'key-status';
    Elements.connectApiBtn.disabled = true;
    Elements.connectApiBtn.innerHTML = `<span class="spinner"></span> Connecting...`;
    
    // First check if we're in a secure context (needed for extension API)
    if (!window.isSecureContext) {
        showExtensionRequired(providerConfig.name, "Secure Connection Required", 
            "Extension access requires a secure (HTTPS) connection. Please access this site via HTTPS.");
        return;
    }
    
    // Check if the extension API is available
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
        showExtensionRequired(providerConfig.name, "Extension Access Unavailable", 
            "To use this feature, you need to install the APIKeyConnect extension.");
        return;
    }
    
    // Update state to indicate we're connecting
    updateState({ isConnecting: true });
    
    // Try to contact the extension with timeout
    try {
        const pingTimeout = setTimeout(() => {
            // If ping times out, the extension is not installed
            showExtensionRequired(providerConfig.name);
            updateState({ isConnecting: false });
        }, 2000);
        
        chrome.runtime.sendMessage(EXTENSION_ID, { type: "ping" }, function(pingResponse) {
            clearTimeout(pingTimeout);
            
            // Check for Chrome runtime error
            if (chrome.runtime.lastError) {
                // Specific error for when extension not installed
                if (chrome.runtime.lastError.message.includes("not installed")) {
                    showExtensionRequired(providerConfig.name);
                } else {
                    // Other runtime errors
                    console.log("Extension check error:", chrome.runtime.lastError.message);
                    showExtensionError(providerConfig.name, "Error communicating with extension: " + chrome.runtime.lastError.message);
                }
                updateState({ isConnecting: false });
                return;
            }
            
            // Check for valid response
            if (!pingResponse || !pingResponse.success) {
                console.log("Invalid extension response:", pingResponse);
                showExtensionRequired(providerConfig.name);
                updateState({ isConnecting: false });
                return;
            }
            
            // Extension is installed and responded successfully, now request explicit permission first
            // This is a new step to handle localhost permission issues
            requestPermission(providerConfig);
        });
    } catch (error) {
        // If any error occurs, show extension required
        console.error("Extension access error:", error);
        showExtensionRequired(providerConfig.name);
        updateState({ isConnecting: false });
    }
}

/**
 * Request explicit permission for localhost (or any origin)
 * This is necessary due to Chrome's security model with localhost
 */
function requestPermission(providerConfig) {
    Elements.apiStatusEl.textContent = `Requesting permission...`;
    
    // Send explicit permission request
    chrome.runtime.sendMessage(EXTENSION_ID, {
        type: "requestPermission",
        origin: window.location.origin
    }, function(response) {
        // Check for errors
        if (chrome.runtime.lastError) {
            console.log("Permission request error:", chrome.runtime.lastError.message);
            // If extension doesn't support requestPermission message, continue to key request
            // (older versions of APIKeyConnect might not support this)
            requestAPIKey(providerConfig);
            return;
        }
        
        // If successful, proceed to request the key
        // Even if not successful, try anyway - the extension might show permission popup during key request
        requestAPIKey(providerConfig);
    });
}

/**
 * Function to request API key once extension is confirmed available.
 * First tries without a key name, then falls back to specific names.
 */
function requestAPIKey(providerConfig) {
    console.log(`Requesting API key for ${providerConfig.name}`);
    Elements.apiStatusEl.textContent = `Requesting API key...`;
    Elements.connectApiBtn.innerHTML = `<span class="spinner"></span> Checking Keys...`;
    
    try {
        // Try retrieving without a key name first (default key)
        chrome.runtime.sendMessage(EXTENSION_ID, {
            type: "requestKey",
            serviceId: providerConfig.serviceId
        }, function(response) {
            // Check for Chrome runtime error
            if (chrome.runtime.lastError) {
                console.log("Key request error:", chrome.runtime.lastError.message);
                // Fall back to named keys
                tryNextKeyName(0, providerConfig);
                return;
            }
            
            // Check for permission error
            if (response && response.error && response.error.includes("Permission not granted")) {
                handlePermissionError(providerConfig);
                return;
            }
            
            if (response && response.success && response.key) {
                // Success with default key
                handleSuccessfulConnection(response.key, providerConfig);
            } else {
                // Try with common key names
                tryNextKeyName(0, providerConfig);
            }
        });
    } catch (error) {
        showExtensionError(providerConfig.name, "Error requesting API key: " + error.message);
        updateState({ isConnecting: false });
    }
}

/**
 * Special handler for permission errors on localhost
 */
function handlePermissionError(providerConfig) {
    console.log("Permission error detected");
    
    // Check if we're running on localhost
    const isLocalhost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.hostname.startsWith('192.168.');
    
    if (isLocalhost) {
        // Show special message for localhost users
        Elements.apiStatusEl.textContent = `❌ Permission Required for Localhost`;
        Elements.apiStatusEl.className = 'key-status error';
        Elements.connectApiBtn.disabled = false;
        Elements.connectApiBtn.innerHTML = 'Grant Permission';
        
        // Set button to open the permission page
        Elements.connectApiBtn.onclick = function() {
            // Check if permission.html exists
            fetch('permission.html', { method: 'HEAD' })
                .then(response => {
                    if (response.ok) {
                        // Open the permission page
                        window.open('permission.html', '_blank');
                    } else {
                        // Show instructions in an alert if the page doesn't exist
                        alert(`Localhost Permission Required:\n\n` +
                              `The APIKeyConnect extension requires explicit permission for localhost.\n\n` +
                              `1. Open extension settings for APIKeyConnect\n` + 
                              `2. Select "Allow on localhost"\n` +
                              `3. Refresh this page and try again`);
                    }
                })
                .catch(() => {
                    // Show instructions in an alert if fetch fails
                    alert(`Localhost Permission Required:\n\n` +
                          `The APIKeyConnect extension requires explicit permission for localhost.\n\n` +
                          `1. Open extension settings for APIKeyConnect\n` + 
                          `2. Select "Allow on localhost"\n` +
                          `3. Refresh this page and try again`);
                });
        };
    } else {
        // For non-localhost, just show a standard error
        showExtensionError(providerConfig.name, "Permission denied. Please allow access in the extension settings.");
    }
    
    updateState({ isConnecting: false });
}

/**
 * Try each key name sequentially from the provider config.
 */
function tryNextKeyName(index, providerConfig) {
    const keyNames = providerConfig.keyNames || [];
    
    if (index >= keyNames.length) {
        // We've tried all options, show comprehensive error
        Elements.apiStatusEl.textContent = `❌ No ${providerConfig.name} Key Found`;
        Elements.apiStatusEl.className = 'key-status error';
        
        // Create a helpful message with key name suggestions
        let message = `No key found for ${providerConfig.name} in APIKeyConnect.\n\nPlease add a key with one of these names:\n- ${keyNames.join('\n- ')}\n\nThen click Connect again.`;
        alert(message);
        
        // Reset connection state
        resetConnectionState(providerConfig.name);
        return;
    }
    
    const currentKeyName = keyNames[index];
    Elements.apiStatusEl.textContent = `Checking key: "${currentKeyName}"...`;
    
    chrome.runtime.sendMessage(EXTENSION_ID, {
        type: "requestKey",
        serviceId: providerConfig.serviceId,
        keyName: currentKeyName
    }, function(response) {
        // Check for Chrome runtime error
        if (chrome.runtime.lastError) {
            // Skip to next key name on error
            setTimeout(() => tryNextKeyName(index + 1, providerConfig), 300);
            return;
        }
        
        // Check for permission error
        if (response && response.error && response.error.includes("Permission not granted")) {
            handlePermissionError(providerConfig);
            return;
        }
        
        if (response && response.success && response.key) {
            // Success with this key name
            handleSuccessfulConnection(response.key, providerConfig);
        } else {
            // Try next key name
            setTimeout(() => tryNextKeyName(index + 1, providerConfig), 300);
        }
    });
}

/**
 * Function to show extension required message and set up install button.
 */
function showExtensionRequired(providerName, title = "APIKeyConnect Extension Required", message = "To use this feature, you need to install the APIKeyConnect extension.") {
    console.log("Showing extension required:", title, message);
    
    Elements.apiStatusEl.textContent = `❌ ${title}`;
    Elements.apiStatusEl.className = 'key-status error';
    Elements.connectApiBtn.disabled = false;
    Elements.connectApiBtn.innerHTML = 'Install APIKeyConnect';
    
    // Store the previous onclick handler
    const originalOnClick = Elements.connectApiBtn.onclick;
    
    // Set the button to open the extension page
    Elements.connectApiBtn.onclick = function() {
        window.open(APIKEYCONNECT_STORE_URL, '_blank');
        
        // Update status to guide user
        Elements.apiStatusEl.textContent = 'Install extension, then Refresh Page & Connect.';
        Elements.connectApiBtn.innerHTML = 'Install Extension';
        Elements.connectApiBtn.disabled = true;
        
        // Re-enable after a delay
        setTimeout(() => {
            Elements.connectApiBtn.disabled = false;
            // Keep the install action for now
        }, 2000);
    };
}

/**
 * Function to show extension error.
 */
function showExtensionError(providerName, errorMessage) {
    Elements.apiStatusEl.textContent = `❌ Extension Error: ${errorMessage}`;
    Elements.apiStatusEl.className = 'key-status error';
    Elements.connectApiBtn.disabled = false;
    Elements.connectApiBtn.innerHTML = "Try Again";
    
    // Reset original handler
    Elements.connectApiBtn.onclick = connectApi;
}

/**
 * Handle successful API key retrieval.
 */
function handleSuccessfulConnection(key, providerConfig) {
    console.log(`Key received for ${providerConfig.name}`);
    
    // Update state with the key
    updateState({
        apiKey: key,
        isConnected: true,
        isConnecting: false,
        aiProvider: providerConfig.serviceId  // Make sure selected provider is set
    });
    
    // Save key to localStorage
    localStorage.setItem(`${providerConfig.serviceId}_api_key`, key);
    localStorage.setItem('last_connected_provider', providerConfig.serviceId);
    
    // Update UI
    updateConnectionStatus(true, providerConfig.name);
    
    // Reset the connect button handler
    Elements.connectApiBtn.onclick = connectApi;
}

/**
 * Reset connection state after failure.
 */
function resetConnectionState(providerName = 'AI Provider') {
    updateState({ 
        apiKey: '', 
        isConnected: false, 
        isConnecting: false 
    });
    
    // Get current provider for button text
    const currentProviderId = Elements.aiProviderSelect?.value || AppState.aiProvider || 'openai';
    const currentProviderName = AI_PROVIDERS[currentProviderId]?.name || providerName;
    
    // Update UI
    updateConnectionStatus(false, currentProviderName);
    
    // Reset button handler
    Elements.connectApiBtn.onclick = connectApi;
}

/**
 * Check local storage for previously connected keys on initial page load.
 */
export function checkSavedKeys() {
    // Always ensure connecting flag is reset on page load
    updateState({ isConnecting: false });
    
    const lastProviderId = localStorage.getItem('last_connected_provider');
    let connected = false;
    
    if (lastProviderId && AI_PROVIDERS[lastProviderId]) {
        const savedKey = localStorage.getItem(`${lastProviderId}_api_key`);
        if (savedKey) {
            console.log(`Found saved key for last provider: ${AI_PROVIDERS[lastProviderId].name}`);
            updateState({ 
                apiKey: savedKey, 
                isConnected: true, 
                aiProvider: lastProviderId,
                isConnecting: false 
            });
            
            if (Elements.aiProviderSelect) {
                Elements.aiProviderSelect.value = lastProviderId;
            }
            
            updateConnectionStatus(true, AI_PROVIDERS[lastProviderId].name);
            connected = true;
        }
    }
    
    // If not auto-connected, ensure the initial button text is correct
    if (!connected) {
        updateInitialConnectButtonText();
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
        Elements.connectApiBtn.onclick = connectApi;
    }
}