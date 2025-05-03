import { EXTENSION_ID, AI_PROVIDERS } from './config.js';
import { AppState, updateState } from './state.js';
import { Elements, updateConnectionStatus } from './ui.js';

const APIKEYCONNECT_STORE_URL = 'https://chromewebstore.google.com/detail/apikey-connect/edkgcdpbaggofodchjfkfiblhohmkbac';

/**
 * Main function to initiate connection process for the currently selected AI provider.
 * Now follows the EXACT approach from the working example.
 */
export function connectApi() {
    // Reset state if stuck from previous attempt
    if (AppState.isConnecting) {
        console.log("Resetting previous connection attempt");
        updateState({ isConnecting: false });
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
    
    // Show initial connecting message - EXACTLY like the working example
    Elements.apiStatusEl.innerHTML = `
      <span style="color: #6c757d;">⏳ Connecting to extension...</span>
    `;
    Elements.connectApiBtn.disabled = true;
    
    // Now check if the extension API is available
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
        showExtensionRequired("Extension Access Unavailable", 
          "To use this feature, you need to install the APIKeyConnect extension.");
        return;
    }
    
    // Start the connection process
    updateState({ isConnecting: true });
    
    // Try to contact the extension - EXACTLY like working example
    try {
        const pingTimeout = setTimeout(() => {
            // If ping times out, the extension is not installed
            showExtensionRequired();
            updateState({ isConnecting: false });
        }, 1000);
        
        chrome.runtime.sendMessage(EXTENSION_ID, { type: "ping" }, function(pingResponse) {
            clearTimeout(pingTimeout);
            
            // Check for Chrome runtime error
            if (chrome.runtime.lastError) {
                // Specific error for when extension not installed
                if (chrome.runtime.lastError.message.includes("not installed")) {
                    showExtensionRequired();
                } else {
                    // Other runtime errors
                    console.log("Extension check error:", chrome.runtime.lastError.message);
                    showExtensionError("Error communicating with extension: " + chrome.runtime.lastError.message);
                }
                updateState({ isConnecting: false });
                return;
            }
            
            // Check for valid response
            if (!pingResponse || !pingResponse.success) {
                console.log("Invalid extension response:", pingResponse);
                showExtensionRequired();
                updateState({ isConnecting: false });
                return;
            }
            
            // Extension is installed and responded successfully, try to get a key
            // CRITICAL: Use a separate function for key request - EXACTLY like working example
            requestAPIKey(providerConfig);
        });
    } catch (error) {
        console.error("Extension access error:", error);
        showExtensionRequired();
        updateState({ isConnecting: false });
    }
}

/**
 * Function to request API key once extension is confirmed available
 * CRITICAL: This separate function matches the working code exactly
 */
function requestAPIKey(providerConfig) {
    try {
        // Try retrieving without a key name first (default key)
        chrome.runtime.sendMessage(EXTENSION_ID, {
            type: "requestKey",
            serviceId: providerConfig.serviceId
        }, function(response) {
            // Check for Chrome runtime error
            if (chrome.runtime.lastError) {
                console.log("Key request error:", chrome.runtime.lastError.message);
                showExtensionError("Error communicating with extension");
                updateState({ isConnecting: false });
                return;
            }
            
            if (response && response.success) {
                // Success with default key
                handleSuccessfulConnection(response.key, providerConfig);
            } else {
                // Try with specific key names from config
                tryNextKeyName(0, providerConfig);
            }
        });
    } catch (error) {
        showExtensionError("Error requesting API key: " + error.message);
        updateState({ isConnecting: false });
    }
}

/**
 * Show extension required message - similar to the working example
 */
function showExtensionRequired(title = "APIKeyConnect Extension Required", message = "To use this feature, you need to install the APIKeyConnect extension.") {
    Elements.apiStatusEl.innerHTML = `
        <div style="padding: 15px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center; margin-bottom: 15px;">
            <div style="font-size: 36px; margin-bottom: 12px;">🔑</div>
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 8px; color: #1e293b;">${title}</h3>
            <p style="margin-bottom: 12px; color: #475569;">${message}</p>
            <a href="https://chromewebstore.google.com/detail/apikey-connect/edkgcdpbaggofodchjfkfiblhohmkbac" 
               target="_blank" 
               style="display: inline-block; padding: 8px 16px; background-color: #4f46e5; color: white; border-radius: 4px; text-decoration: none; font-weight: 500; transition: all 0.2s ease; margin-bottom: 8px;">
              Install Extension
            </a>
        </div>
    `;
    
    Elements.connectApiBtn.textContent = "Install Extension";
    Elements.connectApiBtn.style.backgroundColor = "#f59e0b";
    Elements.connectApiBtn.disabled = false;
    
    // Open extension page when the button is clicked
    Elements.connectApiBtn.onclick = function() {
        window.open(APIKEYCONNECT_STORE_URL, '_blank');
    };
    
    // Reset state
    updateState({ isConnecting: false });
}

/**
 * Function to show extension error
 */
function showExtensionError(errorMessage) {
    Elements.apiStatusEl.innerHTML = `
      <span style="color: #dc3545;">❌ Extension Error: ${errorMessage}</span>
      <br><small>Please try refreshing the page or reinstalling the extension.</small>
    `;
    Elements.connectApiBtn.disabled = false;
    Elements.connectApiBtn.textContent = "Try Again";
    Elements.connectApiBtn.style.backgroundColor = "";
    
    // Reset click handler to try again
    Elements.connectApiBtn.onclick = connectApi;
    
    // Reset state
    updateState({ isConnecting: false });
}

/**
 * Try each key name in sequence - matches working example approach
 */
function tryNextKeyName(index, providerConfig) {
    const keyNames = providerConfig.keyNames;

    if (index >= keyNames.length) {
        // We've tried all options, show comprehensive error
        Elements.apiStatusEl.innerHTML = `
            <span style="color: #dc3545;">❌ No ${providerConfig.name} key found</span>
            <br><small>Please add a ${providerConfig.name} key in your APIKEY Connect extension.</small>
            <br><small>1. Click the extension icon</small>
            <br><small>2. Select "${providerConfig.name}" from the dropdown</small>
            <br><small>3. Enter your API key</small>
            <br><small>4. Click "Add Key"</small>
        `;
        Elements.connectApiBtn.disabled = false;
        
        // Reset the click handler
        Elements.connectApiBtn.onclick = connectApi;
        Elements.connectApiBtn.textContent = "Connect API Key";
        Elements.connectApiBtn.style.backgroundColor = "";
        
        // Reset state
        updateState({ isConnecting: false });
        return;
    }
    
    // Try with the next key name
    Elements.apiStatusEl.innerHTML = `
        <span style="color: #6c757d;">⏳ Trying to find your key... (${index + 1}/${keyNames.length})</span>
    `;
    
    chrome.runtime.sendMessage(EXTENSION_ID, {
        type: "requestKey",
        serviceId: providerConfig.serviceId,
        keyName: keyNames[index]
    }, function(response) {
        // Check for Chrome runtime error
        if (chrome.runtime.lastError) {
            // Skip to next key name on error
            setTimeout(() => tryNextKeyName(index + 1, providerConfig), 300);
            return;
        }
        
        if (response && response.success) {
            // Success with this key name
            handleSuccessfulConnection(response.key, providerConfig);
        } else {
            // Try next key name
            setTimeout(() => tryNextKeyName(index + 1, providerConfig), 300);
        }
    });
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

    Elements.apiStatusEl.innerHTML = `
        <span style="color: #28a745;">✅ ${providerConfig.name} API Key connected successfully!</span>
    `;
    Elements.connectApiBtn.textContent = "Key Connected";
    Elements.connectApiBtn.style.backgroundColor = "#6c757d";
    Elements.connectApiBtn.disabled = false;
    
    // Reset the click handler
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
