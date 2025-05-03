// Simple global state management
export const AppState = {
    // API Connection
    aiProvider: 'openai', // Default provider
    apiKey: '',
    isConnected: false,
    isConnecting: false, // Flag to prevent multiple connection attempts

    // Repo Analysis
    currentRepo: null, // { owner, name }
    repoData: null,    // Full metadata from GitHub API
    dirStructure: null,// Hierarchical tree structure
    flatTree: [],      // Flat list of files/dirs from GitHub API
    analysisDepth: 'standard',
    isAnalyzing: false,

    // Analysis Stages & Results
    analysisSteps: [], // Steps for the current analysis
    currentAssessment: null, // Result from Stage 1 AI
    filesForAnalysis: new Map(), // Files selected for detailed analysis
    fetchedCodeData: new Map(), // Fetched code content Map<groupName, { files, concatenatedCode, fileList }>
    rawGeneratedIssues: [], // Issues collected from all AI calls before synthesis
    finalGeneratedIssues: [], // Final issues after synthesis/prioritization

    // UI State
    theme: 'light',
};

// Function to update state (could be expanded for more complex state)
export function updateState(newState) {
    Object.assign(AppState, newState);
    // In a larger app, you might add event listeners or reactivity here
    // console.log("App State Updated:", AppState); // Optional: log state changes
}