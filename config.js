export const GITHUB_API_BASE = 'https://api.github.com';
export const EXTENSION_ID = 'edkgcdpbaggofodchjfkfiblhohmkbac'; // APIKeyConnect extension ID

// Analysis Parameters (tune these carefully!)
export const MAX_FILES_TO_FETCH = 30;         // Max files to fetch content for (GitHub Rate Limit Control!)
export const MAX_FILES_PER_GROUP_ANALYSIS = 3; // Max files to analyze together in one AI call
export const MAX_CHARS_PER_FILE = 4000;       // Max characters per file to send to AI (Token Limit Control!)
export const MAX_INTERACTIONS_TO_ANALYZE = 2;   // Limit relationship analysis pairs
export const GITHUB_FETCH_DELAY = 500;        // Milliseconds between GitHub fetches (Rate Limit Control!)
export const MAX_ISSUES_PER_ENTITY = 3;         // Max issues AI should generate per file/group
export const MAX_FINAL_ISSUES = 20;             // Max issues to display after synthesis

// Provider configurations with EXACT key names matching the working website
export const AI_PROVIDERS = {
    openai: {
        name: 'OpenAI',
        serviceId: 'openai', // ID expected by APIKeyConnect
        keyNames: [
            "Default OpenAI API Key"  // This is the exact key name used in the working site
        ],
        models: {
            default: 'gpt-3.5-turbo',
            advanced: 'gpt-4'
        },
        apiEndpoint: 'https://api.openai.com/v1/chat/completions'
    },
    claude: {
        name: 'Anthropic Claude',
        serviceId: 'anthropic',
        keyNames: ['My Claude API Key'], // Match the name format used in working site
        models: {
            default: 'claude-3-sonnet-20240229',
            advanced: 'claude-3-opus-20240229'
        },
        apiEndpoint: 'https://api.anthropic.com/v1/messages'
    },
    deepseek: {
        name: 'Deepseek Coder',
        serviceId: 'deepseek',
        keyNames: ['My Deepseek API Key'], // Match the name format used in working site
        models: {
            default: 'deepseek-coder',
            advanced: 'deepseek-coder'
        },
        apiEndpoint: 'https://api.deepseek.com/v1/chat/completions'
    }
};
