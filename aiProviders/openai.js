import { AI_PROVIDERS } from '../config.js';

/**
 * Calls the OpenAI Chat Completions API.
 * @param {string} apiKey - The OpenAI API key.
 * @param {string} userPrompt - The user's prompt/query.
 * @param {string} systemMessage - The system role message.
 * @param {object} options - API options (model, temperature, max_tokens).
 * @returns {Promise<string>} - The content of the AI's response.
 */
export async function callOpenAIProvider(apiKey, userPrompt, systemMessage, options) {
    const endpoint = AI_PROVIDERS.openai.apiEndpoint;
    const messages = [];
    if (systemMessage) {
        messages.push({ role: 'system', content: systemMessage });
    }
    messages.push({ role: 'user', content: userPrompt });

    const body = JSON.stringify({
        model: options.model,
        messages: messages,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
        // stream: false, // Add streaming later if needed
    });

    // console.log("OpenAI Request Body:", body); // Debugging

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: body
    });

    const data = await response.json();

    if (!response.ok) {
        let errorMsg = `OpenAI API error: ${response.status} ${response.statusText}`;
        if (data && data.error && data.error.message) {
            errorMsg += ` - ${data.error.message}`;
        }
        // Handle specific OpenAI errors if needed
        throw new Error(errorMsg);
    }

    if (!data.choices || data.choices.length === 0 || !data.choices[0].message || !data.choices[0].message.content) {
        console.warn("OpenAI response structure unexpected:", data);
        throw new Error("Received an empty or unexpected response from OpenAI.");
    }

    console.log("OpenAI API Usage:", data.usage);
    return data.choices[0].message.content;
}

// --- Add OpenAI specific parsing logic if needed ---