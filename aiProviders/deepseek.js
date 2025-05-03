import { AI_PROVIDERS } from '../config.js';

/**
 * Calls the Deepseek Coder API.
 * Implements the OpenAI-compatible API structure.
 */
export async function callDeepseekProvider(apiKey, userPrompt, systemMessage, options) {
    console.log("Calling Deepseek API with provided key");
    const endpoint = AI_PROVIDERS.deepseek.apiEndpoint;

    const messages = [];
    if (systemMessage) {
        messages.push({ role: 'system', content: systemMessage });
    }
    messages.push({ role: 'user', content: userPrompt });

    const body = JSON.stringify({
        model: options.model,
        messages: messages,
        temperature: options.temperature,
        max_tokens: options.max_tokens
    });

    try {
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
            let errorMsg = `Deepseek API error: ${response.status} ${response.statusText}`;
            if (data && data.error && data.error.message) {
                errorMsg += ` - ${data.error.message}`;
            }
            throw new Error(errorMsg);
        }

        if (!data.choices || data.choices.length === 0 || !data.choices[0].message || !data.choices[0].message.content) {
            console.warn("Deepseek response structure unexpected:", data);
            throw new Error("Received an empty or unexpected response from Deepseek.");
        }

        console.log("Deepseek API Usage:", data.usage);
        return data.choices[0].message.content;
    } catch (error) {
        console.error("Error calling Deepseek API:", error);
        throw error; // Re-throw to be handled by the central error handler
    }
}