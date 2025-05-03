import { AI_PROVIDERS } from '../config.js';

/**
 * Calls the Anthropic Claude Messages API.
 */
export async function callClaudeProvider(apiKey, userPrompt, systemMessage, options) {
    console.log("Calling Claude API...");
    
    try {
        const endpoint = AI_PROVIDERS.claude.apiEndpoint;
        
        const requestBody = {
            model: options.model,
            max_tokens: options.max_tokens,
            temperature: options.temperature,
            system: systemMessage,
            messages: [
                { role: "user", content: userPrompt }
            ]
        };
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(requestBody)
        });
        
        // Parse the JSON response
        const data = await response.json();
        
        // Handle API errors
        if (!response.ok) {
            let errorMsg = `Claude API error: ${response.status}`;
            if (data.error) {
                errorMsg += ` - ${data.error.type}: ${data.error.message}`;
            }
            throw new Error(errorMsg);
        }
        
        // Extract the text content from Claude's response format
        if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
            throw new Error("Unexpected response format from Claude API");
        }
        
        // Find text content in the response
        const textContent = data.content.find(item => item.type === 'text');
        if (!textContent || !textContent.text) {
            throw new Error("No text content found in Claude response");
        }
        
        // Log token usage if available
        if (data.usage) {
            console.log("Claude API usage:", {
                inputTokens: data.usage.input_tokens,
                outputTokens: data.usage.output_tokens,
                totalTokens: data.usage.input_tokens + data.usage.output_tokens
            });
        }
        
        return textContent.text;
    } catch (error) {
        console.error("Error calling Claude API:", error);
        throw error; // Re-throw for central error handling
    }
}