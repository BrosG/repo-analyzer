import { GITHUB_API_BASE } from './config.js';
import { AppState } from './state.js';
import { updateProcessingStep } from './ui.js'; // For error reporting

/**
 * Fetch repository metadata.
 */
export async function fetchRepositoryInfo() {
    try {
        const { owner, name } = AppState.currentRepo;
        const url = `${GITHUB_API_BASE}/repos/${owner}/${name}`;
        console.log(`Fetching repo info: ${url}`);
        const response = await fetch(url);

        if (!response.ok) {
            handleGithubApiError(response, `fetching repository info for ${owner}/${name}`);
        }

        AppState.repoData = await response.json();
        console.log('Repository data obtained.');

        // Fetch languages (best effort)
        if (AppState.repoData.languages_url) {
            try {
                const langResponse = await fetch(AppState.repoData.languages_url);
                if (langResponse.ok) AppState.repoData.languagesData = await langResponse.json();
                else console.warn(`Could not fetch languages: ${langResponse.status}`);
            } catch (langError) {
                console.warn(`Error fetching languages: ${langError.message}`);
            }
        }
        return AppState.repoData;

    } catch (error) {
        console.error('Error in fetchRepositoryInfo:', error);
        throw error; // Re-throw for the orchestrator
    }
}

/**
 * Fetches the complete, recursive file tree.
 */
export async function fetchFullTree() {
    try {
        const { owner, name } = AppState.currentRepo;
        const defaultBranch = AppState.repoData?.default_branch || 'main';
        const url = `${GITHUB_API_BASE}/repos/${owner}/${name}/git/trees/${defaultBranch}?recursive=1`;
        console.log(`Fetching full tree: ${url}`);
        const response = await fetch(url);

        if (!response.ok) {
             handleGithubApiError(response, `fetching file tree for ${owner}/${name} (branch: ${defaultBranch})`);
        }

        const data = await response.json();
        if (data.truncated) {
            console.warn("Repository tree truncated by GitHub API.");
        }
        AppState.flatTree = data.tree || []; // Store flat list
        console.log(`Tree fetched with ${AppState.flatTree.length} items.`);
        return AppState.flatTree; // Return flat tree for direct use

    } catch (error) {
        console.error('Error in fetchFullTree:', error);
        throw error;
    }
}

/**
 * Fetches content of a single file from GitHub using the raw media type.
 */
export async function fetchFileContent(filePath) {
    try {
        const { owner, name } = AppState.currentRepo;
        const defaultBranch = AppState.repoData?.default_branch || 'main';
        const url = `${GITHUB_API_BASE}/repos/${owner}/${name}/contents/${encodeURIComponent(filePath)}?ref=${defaultBranch}`;
        // console.log(`Fetching file content: ${url}`); // Can be noisy

        const response = await fetch(url, {
            headers: { 'Accept': 'application/vnd.github.raw+json' } // Request raw content
        });

        if (!response.ok) {
             // Don't throw immediately for 404, just return null or empty
             if (response.status === 404) {
                 console.warn(`File not found: ${filePath}`);
                 return null; // Indicate file not found
             }
             handleGithubApiError(response, `fetching file content for ${filePath}`); // Throws for other errors
        }

        // Check if content is likely binary before reading as text (basic check)
        const contentType = response.headers.get('Content-Type');
        if (contentType && !contentType.startsWith('text/') && !contentType.includes('json') && !contentType.includes('javascript') && !contentType.includes('xml')) {
             console.warn(`Skipping likely binary file (${contentType}): ${filePath}`);
             return null; // Indicate skipped binary file
        }

        const content = await response.text();
        return content;

    } catch (error) {
        // Don't re-throw here, allow skipping the file
        console.error(`Error fetching file content for ${filePath}:`, error.message);
        return null; // Indicate error fetching this file
    }
}


/**
 * Handles common GitHub API errors and throws a specific error.
 */
function handleGithubApiError(response, context) {
    let errorMsg = `GitHub API error ${context}: ${response.status} ${response.statusText}`;
    if (response.status === 404) {
        errorMsg = `Resource not found during ${context}. Check URL/branch.`;
    } else if (response.status === 403) {
         const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
         if (rateLimitRemaining === '0') {
             const resetTime = new Date(parseInt(response.headers.get('X-RateLimit-Reset') || '0') * 1000);
             const waitMinutes = Math.ceil((resetTime - Date.now()) / 60000);
             errorMsg = `GitHub API rate limit exceeded (${context}). Please wait ~${waitMinutes} minutes.`;
             // Update UI specifically for rate limit?
             updateProcessingStep(AppState.analysisSteps[AppState.analysisSteps.length-1].id, 'error', errorMsg);
         } else {
            errorMsg = `Access forbidden during ${context} (Status 403). Check permissions or token if used.`;
         }
    } else if (response.status === 409) { // Empty repo conflict
        errorMsg = `Repository appears to be empty during ${context}.`;
    }
     console.error(errorMsg, response);
    throw new Error(errorMsg); // Throw the specific message
}