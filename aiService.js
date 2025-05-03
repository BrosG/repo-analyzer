import { AppState } from './state.js';
import { AI_PROVIDERS } from './config.js';

// Import the specific provider implementation functions
import { callOpenAIProvider } from './aiProviders/openai.js';
import { callClaudeProvider } from './aiProviders/claude.js'; // Assuming you have this file
import { callDeepseekProvider } from './aiProviders/deepseek.js'; // Assuming you have this file

// --- Default System Messages (Optional, can be overridden or defined in prompts.json) ---
// It's often better to manage these complex prompts in prompts.json, but adding defaults here for completeness.
const DEFAULT_SYSTEM_MESSAGES = {
    openai: "You are an expert Senior Software Engineer and Code Reviewer. Analyze the provided context (metadata, structure, code) to identify potential issues and suggest actionable recommendations focusing on code quality, maintainability, testing, documentation, security, and performance.",
    claude: "You are an expert Senior Software Engineer and Code Reviewer. Analyze the provided context (metadata, structure, code) to identify potential issues and suggest actionable recommendations focusing on code quality, maintainability, testing, documentation, security, and performance. Provide your response directly.",
    deepseek: "You are an expert Senior Software Engineer and Code Reviewer specializing in code analysis. Analyze the provided context (metadata, structure, code) to identify potential issues and suggest actionable recommendations focusing on code quality, maintainability, testing, documentation, security, and performance, particularly for code generation and completion tasks."
};


/**
 * Central dispatcher function to call the appropriate AI provider's implementation.
 * This is the function that should be exported and used by the orchestrator.
 *
 * @param {string} prompt - The user prompt/task description for the AI.
 * @param {string | null} [systemMessage=null] - An optional system message overriding the default. If null, uses default.
 * @param {object} [options={}] - Additional options for the API call (e.g., temperature, max_tokens).
 * @returns {Promise<string>} - The content of the AI's response text.
 * @throws {Error} If provider is not configured, API key is missing, handler is not implemented, or API call fails.
 */
export async function callAI(prompt, systemMessage = null, options = {}) {
    const providerId = AppState.aiProvider; // Get current provider from global state
    const apiKey = AppState.apiKey;         // Get current API key from global state
    const providerConfig = AI_PROVIDERS[providerId];

    // --- Input Validation ---
    if (!providerConfig) {
        throw new Error(`AI Provider "${providerId}" is not configured in config.js.`);
    }
    if (!apiKey) {
        // Attempt to retrieve from local storage again as a fallback? Or just fail. Failing is cleaner.
        throw new Error(`API Key for ${providerConfig.name} is not available in the application state. Please connect first.`);
    }
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        throw new Error("Cannot call AI service with an empty or invalid prompt.");
    }

    console.log(`Attempting AI call via: ${providerConfig.name}`);

    // --- Prepare Request ---
    // Determine model based on analysis depth or use provider's default
    const model = (AppState.analysisDepth === 'deep' && providerConfig.models.advanced)
                  ? providerConfig.models.advanced
                  : providerConfig.models.default;

    if (!model) {
        console.warn(`No suitable model found for provider "${providerId}" and depth "${AppState.analysisDepth}". Using default if available.`);
        if(!providerConfig.models.default) throw new Error(`Default model not configured for ${providerConfig.name}`);
        // If only default exists, it's already selected above.
    }

    // Use provided system message, or default from config/constants, or a basic fallback
    const effectiveSystemMessage = systemMessage
                                   || AppState.prompts?.systemMessage // Prefer prompt from prompts.json if loaded
                                   || DEFAULT_SYSTEM_MESSAGES[providerId]
                                   || "You are a helpful AI assistant.";

    // Combine default options with any overrides passed in
    const requestOptions = {
        model: model,
        temperature: options.temperature ?? 0.5, // Slightly lower temp for more predictable analysis
        max_tokens: options.max_tokens ?? (AppState.analysisDepth === 'deep' ? 3500 : 2500), // Dynamic tokens
        // Add other common parameters if needed, e.g., top_p
        ...options // Allow explicit overrides
    };
    console.log(`Using AI Model: ${requestOptions.model}, Max Tokens: ${requestOptions.max_tokens}`);


    // --- Dispatch to Provider Implementation ---
    try {
        let responseContent = '';
        switch (providerId) {
            case 'openai':
                responseContent = await callOpenAIProvider(apiKey, prompt, effectiveSystemMessage, requestOptions);
                break;
            case 'claude':
                // Placeholder - ensure callClaudeProvider is implemented correctly
                console.warn("Calling UNIMPLEMENTED Claude provider handler."); // TEMP
                responseContent = await callClaudeProvider(apiKey, prompt, effectiveSystemMessage, requestOptions); // Ensure this exists and works
                break;
            case 'deepseek':
                 // Placeholder - ensure callDeepseekProvider is implemented correctly
                console.warn("Calling UNIMPLEMENTED Deepseek provider handler."); // TEMP
                responseContent = await callDeepseekProvider(apiKey, prompt, effectiveSystemMessage, requestOptions); // Ensure this exists and works
                break;
            // --- Add cases for other providers ---
            // case 'gemini':
            //     responseContent = await callGeminiProvider(apiKey, prompt, effectiveSystemMessage, requestOptions);
            //     break;
            default:
                throw new Error(`AI Provider handler for "${providerId}" is not implemented in aiService.js.`);
        }

        if (typeof responseContent !== 'string' || responseContent.trim() === '') {
             console.warn(`AI provider ${providerConfig.name} returned an empty or non-string response.`);
             // Decide whether to throw an error or return empty string
             // return ''; // Option 1: Return empty
             throw new Error(`AI provider ${providerConfig.name} returned an empty response.`); // Option 2: Throw error
        }

        return responseContent;

    } catch (error) {
        console.error(`Error during call to ${providerConfig.name} API:`, error);

        // Create a more user-friendly error message
        let userMessage = `Failed to get response from ${providerConfig.name}.`;
        const errorMessageLower = error.message.toLowerCase();

        if (errorMessageLower.includes('401') || errorMessageLower.includes('authentication') || errorMessageLower.includes('api key')) {
            userMessage += " Please check if the API key is correct and valid.";
            // Optionally, reset connection state here?
            // updateState({ apiKey: '', isConnected: false });
            // updateConnectionStatus(false, providerConfig.name);
        } else if (errorMessageLower.includes('429') || errorMessageLower.includes('quota') || errorMessageLower.includes('limit') || errorMessageLower.includes('rate_limit_exceeded')) {
            userMessage += " The API rate limit or usage quota seems to have been exceeded.";
        } else if (errorMessageLower.includes('token') || errorMessageLower.includes('prompt is too long') || errorMessageLower.includes('context_length_exceeded')) {
            userMessage += " The request might be too long for the AI model (token limit). Try a shallower analysis depth or smaller repository.";
        } else if (errorMessageLower.includes('model_not_found') || errorMessageLower.includes('invalid model')) {
             userMessage += ` The configured AI model (${requestOptions.model}) might not be available or accessible with your key.`
        } else if (errorMessageLower.includes('billing') || errorMessageLower.includes('credit')) {
             userMessage += ` There might be an issue with your ${providerConfig.name} account billing or credits.`
        } else if (errorMessageLower.includes('network') || errorMessageLower.includes('fetch')) {
            userMessage += " A network error occurred while contacting the AI service.";
        } else {
            // Generic fallback for other errors
            userMessage += " An unexpected error occurred. Check the developer console for details.";
        }
        // Re-throw the user-friendly message to be caught by the orchestrator
        throw new Error(userMessage);
    }
}

// NOTE: Ensure the imported provider functions (callOpenAIProvider, callClaudeProvider, etc.)
// exist in their respective files (`./aiProviders/openai.js`, etc.) and handle the specific
// request/response formats for those APIs.