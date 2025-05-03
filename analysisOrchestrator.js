// --- Module Imports ---
import { AppState, updateState } from './state.js';
import { Elements, updateProcessingStep, renderResults, hideProcessingPopup, showProcessingPopup } from './ui.js';
import { connectApi } from './apiKeyConnect.js'; // Needed for prompting connection
import { fetchRepositoryInfo, fetchFullTree, fetchFileContent } from './githubApi.js';
import { callAI } from './aiService.js';
import {
    delay, parseRepoUrl, createDirectoryTree, summarizeRepoStructure, getCompactRepoSummary,
    identifyKeyFilesAndDirsHeuristics, groupAndSelectFilesForAnalysis, parseStage1Output,
    parseAIResponseIssues, simpleDeduplicateAndSort, escapeHtml
} from './utils.js';
import {
    MAX_FILES_TO_FETCH, MAX_CHARS_PER_FILE, GITHUB_FETCH_DELAY, MAX_INTERACTIONS_TO_ANALYZE,
    MAX_ISSUES_PER_ENTITY, MAX_FINAL_ISSUES, AI_PROVIDERS
} from './config.js';

// --- Main Orchestration Function ---

/**
 * Orchestrates the multi-stage advanced repository analysis.
 */
export async function startAnalysis() {
    if (AppState.isAnalyzing) {
        console.warn("Analysis already in progress.");
        return;
    }

    // --- Initial Setup & Validation ---
    const repoUrl = Elements.repoUrlInput?.value?.trim();
    const selectedProvider = Elements.aiProviderSelect?.value;
    const selectedDepth = Elements.analysisDepthSelect?.value; // 'quick', 'standard', 'deep'

    if (!repoUrl || !selectedProvider || !selectedDepth) {
        alert('Please provide Repository URL, select Provider and Depth.');
        return;
    }
    // Ensure API key for the *selected* provider is connected
    if (!AppState.isConnected || AppState.aiProvider !== selectedProvider) {
         const providerName = AI_PROVIDERS[selectedProvider]?.name || 'the selected AI provider';
        alert(`Please connect the API Key for ${providerName} first using the 'Connect' button.`);
        // Optionally trigger connectApi() here if desired
        // connectApi();
        return; // Stop analysis
    }
    const repoInfo = parseRepoUrl(repoUrl);
    if (!repoInfo) {
        alert('Invalid GitHub repository URL format.');
        return;
    }

    // --- Initialize State for New Analysis ---
    updateState({
        isAnalyzing: true,
        currentRepo: repoInfo,
        analysisDepth: selectedDepth,
        repoData: null, dirStructure: null, flatTree: [],
        currentAssessment: null, filesForAnalysis: new Map(), fetchedCodeData: new Map(),
        rawGeneratedIssues: [], finalGeneratedIssues: []
    });
    Elements.resultsSection.style.display = 'none'; // Hide previous results
    Elements.analyzeBtn.disabled = true;
    Elements.analyzeBtn.innerHTML = '<span class="spinner"></span> Analyzing...';

    // --- Define Steps & Show Popup ---
    const steps = defineAnalysisSteps(selectedDepth);
    updateState({ analysisSteps: steps });
    showProcessingPopup(); // Initialize and show the processing modal

    // --- Analysis Pipeline ---
    try {
        updateProcessingStep('init', 'active', 'Initializing analysis...');
        await delay(200);
        updateProcessingStep('init', 'completed');

        // Step 1: Initial Data Fetch & Assessment
        await fetchInitialData(); // Fetches repo info & tree
        const assessment = await performInitialAssessment();
        updateState({ currentAssessment: assessment }); // Store assessment result

        // Step 2: File Selection (Skip for 'quick' analysis)
        let filesToAnalyze = new Map();
        if (selectedDepth !== 'quick') {
            updateProcessingStep('select-files', 'active', 'Selecting relevant files...');
            const prioritizedFiles = identifyKeyFilesAndDirsHeuristics(AppState.flatTree);
            // Adjust max files based on depth? Maybe fetch more for 'deep'.
            const maxFiles = selectedDepth === 'deep' ? MAX_FILES_TO_FETCH + 10 : MAX_FILES_TO_FETCH;
            filesToAnalyze = groupAndSelectFilesForAnalysis(assessment.focusAreas, prioritizedFiles, maxFiles);
            updateState({ filesForAnalysis: filesToAnalyze });
            const fileCount = Array.from(filesToAnalyze.values()).reduce((s, f) => s + f.length, 0);
            updateProcessingStep('select-files', 'completed', `Selected ${fileCount} files in ${filesToAnalyze.size} groups.`);
        } else {
             updateProcessingStep('select-files', 'skipped', 'Skipped for quick analysis.');
        }


        // Step 3: Fetch Code Content (Skip for 'quick' analysis)
        let fetchedData = new Map();
        if (selectedDepth !== 'quick' && filesToAnalyze.size > 0) {
            fetchedData = await fetchContentForAnalysis(filesToAnalyze);
            updateState({ fetchedCodeData: fetchedData });
        } else if (selectedDepth !== 'quick') {
             updateProcessingStep('fetch-code', 'skipped', 'No files were selected for content analysis.');
        } else {
             updateProcessingStep('fetch-code', 'skipped', 'Skipped for quick analysis.');
        }


        // Step 4: Focused AI Analysis / Quick Analysis
        let rawIssues = [];
        if (selectedDepth === 'quick') {
             rawIssues = await performQuickAnalysis(assessment); // Separate function for quick mode
        } else if (fetchedData.size > 0) {
             rawIssues = await performFocusedAnalysis(fetchedData, assessment); // Includes interaction for 'deep'
        } else {
            updateProcessingStep('ai-focused', 'skipped', 'No code fetched to analyze.');
             if (AppState.analysisDepth === 'deep') updateProcessingStep('ai-interaction', 'skipped');
        }
        updateState({ rawGeneratedIssues: rawIssues });

        // Step 5: Synthesis
        const finalIssues = await synthesizeAndPrioritizeIssues(rawIssues);
        updateState({ finalGeneratedIssues: finalIssues.slice(0, MAX_FINAL_ISSUES) });

        // Finalization
        updateProcessingStep('final', 'active', 'Preparing final results display...');
        renderResults(); // Calls the specific rendering functions from ui.js
        await delay(500);
        updateProcessingStep('final', 'completed', 'Analysis successful!');
        Elements.statusTextEl.textContent = 'Analysis completed successfully!';

        // --- Cleanup UI ---
        setTimeout(() => {
            hideProcessingPopup();
            Elements.analyzeBtn.disabled = false;
            Elements.analyzeBtn.innerHTML = 'Analyze Repository';
            Elements.resultsSection.style.display = 'block';
            if (Elements.resultsSection) Elements.resultsSection.scrollIntoView({ behavior: 'smooth' }); // Scroll to results
        }, 1200);

    } catch (err) {
        console.error('Critical error during analysis pipeline:', err);
        // Mark the last active/pending step as error
        const currentStepIndex = AppState.analysisSteps.findIndex(step => {
            const el = document.getElementById(`step-${step.id}`);
            return el && (el.classList.contains('active') || el.classList.contains('pending'));
        });
         const errorStepId = currentStepIndex !== -1 ? AppState.analysisSteps[currentStepIndex].id : (AppState.analysisSteps[0]?.id || 'init');
         updateProcessingStep(errorStepId, 'error', `Failed: ${err.message.substring(0, 150)}`); // Limit error message length

        alert(`Analysis failed: ${err.message}. Check console for details.`);
        hideProcessingPopup(); // Hide popup on critical failure

    } finally {
        // Always reset analyzing state and button
        updateState({ isAnalyzing: false });
        if (Elements.analyzeBtn) { // Check if element exists before accessing
            Elements.analyzeBtn.disabled = false;
            Elements.analyzeBtn.innerHTML = 'Analyze Repository';
        }
    }
}


// --- Helper Functions for Orchestration ---

/**
 * Defines the steps shown in the processing popup based on analysis depth.
 * @param {'quick'|'standard'|'deep'} depth - The selected analysis depth.
 * @returns {Array<object>} - List of step objects {id, title, description}.
 */
function defineAnalysisSteps(depth) {
    const steps = [
        { id: 'init', title: 'Initialization', description: 'Preparing analysis environment' },
        { id: 'repo-info', title: 'Fetch Repo Data', description: 'Getting repository metadata' },
        { id: 'get-tree', title: 'Fetch File Tree', description: 'Mapping the full directory structure' },
        { id: 'ai-assess', title: 'Initial Assessment', description: 'AI understanding repo purpose & key areas' },
    ];

    if (depth === 'quick') {
         steps.push({ id: 'ai-quick', title: 'Quick AI Analysis', description: 'AI generating high-level suggestions' });
    } else {
        steps.push({ id: 'select-files', title: 'Select Files', description: 'Prioritizing files/groups for deep analysis' });
        steps.push({ id: 'fetch-code', title: 'Fetch Code', description: 'Retrieving content of selected files (throttled)' });
        steps.push({ id: 'ai-focused', title: 'Focused Analysis', description: 'AI analyzing specific files/groups' });
        if (depth === 'deep') {
            steps.push({ id: 'ai-interaction', title: 'Interaction Analysis', description: 'AI analyzing component interactions (optional)' });
        }
         steps.push({ id: 'synthesize', title: 'Synthesize Results', description: 'Consolidating and prioritizing findings' });
    }

    steps.push({ id: 'final', title: 'Finalization', description: 'Preparing results display' });
    return steps;
}


/**
 * Fetches repo info and the complete file tree. Updates state directly.
 */
async function fetchInitialData() {
    updateProcessingStep('repo-info', 'active', 'Fetching repository metadata...');
    await fetchRepositoryInfo(); // Fetches and updates AppState.repoData
    updateProcessingStep('repo-info', 'completed');

    updateProcessingStep('get-tree', 'active', 'Fetching repository file tree...');
    const flatTree = await fetchFullTree(); // Fetches and updates AppState.flatTree
    updateState({ dirStructure: createDirectoryTree(flatTree) }); // Create hierarchy for display
    updateProcessingStep('get-tree', 'completed', `Mapped ${flatTree.length} tree items.`);
}

/**
 * Stage 1: Analyzes structure and metadata to get initial context using AI.
 * @returns {Promise<object>} Parsed object with repoPurpose, coreModules, focusAreas
 */
async function performInitialAssessment() {
    updateProcessingStep('ai-assess', 'active', 'AI performing initial assessment...');
    try {
        const repoSummary = getCompactRepoSummary(); // Uses AppState.repoData
        const structureSummary = summarizeRepoStructure(AppState.dirStructure); // Uses AppState.dirStructure
        const keyPaths = identifyKeyFilesAndDirsHeuristics(AppState.flatTree).slice(0, 50);

        const prompt = AppState.prompts.stage1_ContextPrompt
            .replace('{repoSummary}', JSON.stringify(repoSummary, null, 2))
            .replace('{structureSummary}', structureSummary)
            .replace('{identifiedKeyPathsList}', keyPaths.map(p => `- ${p}`).join('\n'));

        const rawOutput = await callAI(prompt, AppState.prompts.systemMessage);
        const assessment = parseStage1Output(rawOutput);

        console.log("Stage 1 Assessment:", assessment);
        updateProcessingStep('ai-assess', 'completed', `AI assessed purpose: ${assessment.repoPurpose.substring(0,50)}...`);
        return assessment;
    } catch (error) {
        console.error("Error during Stage 1 AI Assessment:", error);
        updateProcessingStep('ai-assess', 'error', `AI assessment failed: ${error.message.substring(0,100)}`);
        // Fallback using heuristics only
        return {
            repoPurpose: AppState.repoData?.description || "General Repository",
            coreModules: identifyKeyFilesAndDirsHeuristics(AppState.flatTree, true).slice(0, 5),
            focusAreas: identifyKeyFilesAndDirsHeuristics(AppState.flatTree, true).slice(0, 3)
        };
    }
}

/**
 * Stage 3: Fetches content for selected files/groups with throttling.
 * @param {Map<string, Array<object>>} filesToAnalyze - Map from groupAndSelectFiles.
 * @returns {Promise<Map<string, object>>} - Map where keys are group names, values are { files: [], concatenatedCode: string, fileList: [] }.
 */
async function fetchContentForAnalysis(filesToAnalyze) {
    updateProcessingStep('fetch-code', 'active', 'Fetching selected file content (throttled)...');
    const fetchedData = new Map();
    let fetchedCount = 0;
    const totalToFetch = Array.from(filesToAnalyze.values()).reduce((sum, files) => sum + files.length, 0);
    let skippedFiles = 0;

    if (totalToFetch === 0) {
        updateProcessingStep('fetch-code', 'skipped', 'No files selected for content fetching.');
        return fetchedData;
    }

    for (const [groupName, files] of filesToAnalyze.entries()) {
        let groupCode = '';
        const groupFileList = [];
        const fetchedFilesData = [];

        for (const file of files) {
            const currentFileNum = ++fetchedCount;
            updateProcessingStep('fetch-code', 'active', `Fetching (${currentFileNum}/${totalToFetch}): ${file.path}`);
            try {
                const content = await fetchFileContent(file.path); // Handles errors internally, returns null on fail/skip
                if (content !== null) {
                    const truncatedContent = content.slice(0, MAX_CHARS_PER_FILE);
                    // Add file marker for AI context
                    groupCode += `--- File: ${file.path} ---\n`;
                    groupCode += truncatedContent;
                    if (content.length > MAX_CHARS_PER_FILE) groupCode += "\n... [File Truncated] ...";
                    groupCode += "\n\n";
                    // ---
                    groupFileList.push(file.path);
                    fetchedFilesData.push({ path: file.path, content: truncatedContent });
                } else {
                    skippedFiles++;
                    console.warn(`Skipped fetching content for ${file.path}`);
                }
            } catch (error) { // Catch unexpected errors from fetchFileContent itself
                skippedFiles++;
                console.error(`Unexpected error fetching ${file.path}:`, error);
                updateProcessingStep('fetch-code', 'warning', `Error fetching ${file.path}`);
            }
            await delay(GITHUB_FETCH_DELAY); // Throttle requests
        }

        if (groupCode) { // Only add group if content was actually fetched
            fetchedData.set(groupName, {
                files: fetchedFilesData,
                concatenatedCode: groupCode.trim(),
                fileList: groupFileList
            });
        }
    }

    const completionMsg = `Fetched content for ${fetchedData.size} groups/files.` + (skippedFiles > 0 ? ` Skipped ${skippedFiles}.` : '');
    updateProcessingStep('fetch-code', 'completed', completionMsg);
    return fetchedData;
}


/**
 * Stage 4: Perform focused AI analysis on fetched code groups/files.
 * @param {Map<string, object>} fetchedData - Output from fetchContentForAnalysis.
 * @param {object} assessment - Output from performInitialAssessment.
 * @returns {Promise<Array<object>>} - Array of all generated raw issues.
 */
async function performFocusedAnalysis(fetchedData, assessment) {
    updateProcessingStep('ai-focused', 'active', 'Performing focused AI analysis...');
    const allIssues = [];
    let groupsAnalyzed = 0;
    const totalGroups = fetchedData.size;

    if (totalGroups === 0) {
        updateProcessingStep('ai-focused', 'skipped', 'No code content fetched for analysis.');
         if (AppState.analysisDepth === 'deep') updateProcessingStep('ai-interaction', 'skipped', 'Skipped due to no focused analysis data.');
        return allIssues;
    }

    for (const [groupName, data] of fetchedData.entries()) {
        groupsAnalyzed++;
        const isIndividual = !groupName.startsWith('area-');
        const entityName = isIndividual ? data.files[0]?.path : groupName.replace(/^area-/, '');
        const currentProgressText = `AI analyzing (${groupsAnalyzed}/${totalGroups}): ${escapeHtml(entityName.substring(0, 40))}...`;

        updateProcessingStep('ai-focused', 'active', currentProgressText);

        try {
            // --- Determine Analysis Focus (Heuristic) ---
             let analysisFocus = "general code quality, potential bugs, and maintainability issues";
             const primaryFile = data.files[0];
             if (primaryFile) {
                 const lowerPath = primaryFile.path.toLowerCase();
                 if (lowerPath.includes('test') || lowerPath.includes('spec')) analysisFocus = "test completeness, effectiveness, and potential missing test cases";
                 else if (lowerPath.endsWith('.md')) analysisFocus = "documentation clarity, completeness, and formatting";
                 else if (lowerPath.includes('config') || lowerPath.endsWith('.yml') || lowerPath.endsWith('.json') || lowerPath.includes('dockerfile') || lowerPath.endsWith('.xml') || lowerPath.endsWith('.toml')) analysisFocus = "configuration correctness, potential security misconfigurations, and best practices";
                 else if (lowerPath.includes('sql') || lowerPath.includes('query') || lowerPath.includes('model') || lowerPath.includes('entity') || lowerPath.includes('dao') || lowerPath.includes('repository')) analysisFocus = "database interactions, potential SQL injection risks (if applicable), data modeling, and ORM usage practices";
                 else if (lowerPath.includes('auth') || lowerPath.includes('security') || lowerPath.includes('login') || lowerPath.includes('session') || lowerPath.includes('permission') || lowerPath.includes('jwt')) analysisFocus = "security vulnerabilities (like improper auth checks, credential handling), authentication/authorization logic flaws, and secure coding practices";
                 else if (lowerPath.includes('controller') || lowerPath.includes('route') || lowerPath.includes('handler') || lowerPath.includes('view') || lowerPath.includes('api')) analysisFocus = "request handling logic, input validation, error handling, response formatting, and separation of concerns";
                 else if (lowerPath.includes('service') || lowerPath.includes('manager') || lowerPath.includes('provider')) analysisFocus = "business logic implementation, encapsulation, error propagation, and transaction management (if applicable)";
                 else if (lowerPath.includes('util') || lowerPath.includes('helper') || lowerPath.includes('core') || lowerPath.includes('common')) analysisFocus = "utility function design, reusability, potential side effects, and clarity";
             }
            // --- Prepare and Call AI ---
            const promptTemplate = AppState.prompts.stage3_FocusedAnalysisPrompt;
            if (!promptTemplate) throw new Error("Stage 3 Prompt template is missing.");

            const prompt = promptTemplate
                .replace(/{areaName}/g, entityName)
                .replace(/{repoPurpose}/g, assessment.repoPurpose || 'the repository')
                .replace(/{stage1Summary}/g, `Overall Purpose: ${assessment.repoPurpose?.slice(0,100)}. Key Modules: ${assessment.coreModules?.slice(0,3).join(', ')}.`)
                .replace(/{fileList}/g, data.fileList.join(', '))
                .replace(/{concatenatedCodeSnippets}/g, data.concatenatedCode)
                .replace(/{analysisFocus}/g, analysisFocus)
                .replace(/{maxIssues}/g, MAX_ISSUES_PER_ENTITY.toString());

            const rawOutput = await callAI(prompt, AppState.prompts.systemMessage);
            const issues = parseAIResponseIssues(rawOutput); // Use central parser

            // Add context back
            issues.forEach(issue => {
                 issue.analysisArea = entityName;
                 if ((!issue.filePath || issue.filePath === 'N/A') && data.fileList.length === 1) {
                    issue.filePath = data.fileList[0];
                 } else if (!issue.filePath || issue.filePath === 'N/A') {
                     issue.filePath = groupName.startsWith('area-') ? `MultipleFilesIn(${entityName})` : data.fileList[0] || 'N/A';
                 }
             });

            allIssues.push(...issues);
            console.log(`Generated ${issues.length} issues for ${entityName}`);

        } catch (error) {
            console.error(`Error during focused AI analysis for ${entityName}:`, error);
            updateProcessingStep('ai-focused', 'warning', `AI analysis skipped/failed for ${escapeHtml(entityName.substring(0,40))}: ${error.message.substring(0,100)}`);
        }
    } // End loop through fetchedData

     // --- Optional Interaction Analysis (Only for 'deep' depth) ---
    if (AppState.analysisDepth === 'deep' && fetchedData.size >= 2 && MAX_INTERACTIONS_TO_ANALYZE > 0) {
        await performInteractionAnalysis(fetchedData, assessment, allIssues); // Pass allIssues to add to it
    } else if (AppState.analysisDepth === 'deep') {
         updateProcessingStep('ai-interaction', 'skipped', 'Not enough data/groups for interaction analysis.');
    }

    const finalMsg = `Focused analysis generated ${allIssues.length} raw issues.` + (totalGroups !== groupsAnalyzed ? ` (${totalGroups - groupsAnalyzed} groups skipped/failed)` : '');
    updateProcessingStep('ai-focused', 'completed', finalMsg);
    return allIssues;
}

/**
 * Stage 4 (Optional): Perform interaction analysis between key component groups.
 * @param {Map<string, object>} fetchedData - Fetched code data.
 * @param {object} assessment - Initial assessment results.
 * @param {Array<object>} allIssues - The array to push newly generated issues into.
 */
async function performInteractionAnalysis(fetchedData, assessment, allIssues) {
    updateProcessingStep('ai-interaction', 'active', 'Analyzing key interactions (Experimental)...');
    let interactionsAnalyzed = 0;
    const groups = Array.from(fetchedData.keys()).filter(k => k.startsWith('area-')); // Focus on 'area' groups

    // TODO: Implement smarter pairing logic (e.g., based on assessment.coreModules or common patterns)
    // Simple adjacent pairing for demonstration:
    for(let i = 0; i < Math.min(MAX_INTERACTIONS_TO_ANALYZE, groups.length -1); i++) {
        const keyA = groups[i];
        const keyB = groups[i+1]; // Example: Analyze interaction between adjacent identified areas
        const dataA = fetchedData.get(keyA);
        const dataB = fetchedData.get(keyB);
        const nameA = keyA.replace(/^area-/, '');
        const nameB = keyB.replace(/^area-/, '');
        const interactionName = `${nameA} <-> ${nameB}`;

        if (dataA?.concatenatedCode && dataB?.concatenatedCode) {
            interactionsAnalyzed++;
            const progressText = `AI analyzing interaction (${interactionsAnalyzed}/${MAX_INTERACTIONS_TO_ANALYZE}): ${escapeHtml(interactionName.substring(0,40))}...`;
            updateProcessingStep('ai-interaction', 'active', progressText);

            try {
                const promptTemplate = AppState.prompts.stage4_InteractionAnalysisPrompt; // Ensure this exists in prompts.json
                if (!promptTemplate) throw new Error("Interaction prompt template missing.");

                // Limit combined code size strictly for interaction analysis
                const maxCharsPerPart = Math.floor((MAX_CHARS_PER_FILE * 1.5) / 2); // Allow slightly more total, split

                const prompt = promptTemplate
                     .replace(/{areaNameA}/g, nameA)
                     .replace(/{areaNameB}/g, nameB)
                     .replace(/{repoPurpose}/g, assessment.repoPurpose || 'the repository')
                     .replace(/{stage1Summary}/g, `Overall Purpose: ${assessment.repoPurpose?.slice(0,100)}.`)
                     .replace(/{fileListA}/g, dataA.fileList.join(', '))
                     .replace(/{fileListB}/g, dataB.fileList.join(', '))
                     .replace(/{concatenatedCodeSnippetsA}/g, dataA.concatenatedCode.slice(0, maxCharsPerPart))
                     .replace(/{concatenatedCodeSnippetsB}/g, dataB.concatenatedCode.slice(0, maxCharsPerPart))
                     .replace(/{maxIssues}/g, '2'); // Ask for fewer, high-impact interaction issues

                const rawOutput = await callAI(prompt, AppState.prompts.systemMessage);
                const interactionIssues = parseAIResponseIssues(rawOutput);

                // Add context for interaction issues
                interactionIssues.forEach(issue => {
                    issue.analysisArea = `Interaction(${interactionName})`;
                    issue.filePath = `Interaction between ${nameA} & ${nameB}`; // Specific marker
                    issue.priority = issue.priority || 'High'; // Default interaction issues to High?
                });

                allIssues.push(...interactionIssues);
                console.log(`Generated ${interactionIssues.length} interaction issues for ${interactionName}`);

            } catch(error) {
                console.error(`Error analyzing interaction ${interactionName}:`, error);
                updateProcessingStep('ai-interaction', 'warning', `Interaction analysis failed for ${escapeHtml(interactionName.substring(0,40))}: ${error.message.substring(0,100)}`);
            }
        } // End if data exists
    } // End loop

     if (interactionsAnalyzed > 0) updateProcessingStep('ai-interaction', 'completed');
     else updateProcessingStep('ai-interaction', 'skipped', 'No suitable interactions analyzed.');
}


/**
 * Stage 5: Synthesizes final issues using client-side logic.
 * @param {Array<object>} rawIssues - Combined issues from previous stages.
 * @returns {Promise<Array<object>>} - Final, prioritized list of issues.
 */
async function synthesizeAndPrioritizeIssues(rawIssues) {
    updateProcessingStep('synthesize', 'active', 'Synthesizing & prioritizing findings...');
    await delay(100); // Simulate work

    if (rawIssues.length === 0) {
        updateProcessingStep('synthesize', 'completed', 'No raw issues to synthesize.');
        return [];
    }

    // Using Client-Side Synthesis for simplicity and reliability
    const finalIssues = simpleDeduplicateAndSort(rawIssues);

    updateProcessingStep('synthesize', 'completed', `Prioritized ${finalIssues.length} unique issues.`);
    return finalIssues;

    // --- AI Synthesis Option (Commented Out) ---
    /*
    try {
        const formattedForPrompt = rawIssues.map((issue, i) => ...).join('\n');
        const MAX_SYNTHESIS_INPUT_CHARS = 8000;
        const truncatedInput = formattedForPrompt.slice(0, MAX_SYNTHESIS_INPUT_CHARS);
        const promptTemplate = AppState.prompts.stage4_SynthesisPrompt;
        if (!promptTemplate) throw new Error("Synthesis prompt missing.");
        const prompt = promptTemplate.replace('{rawIssuesList}', truncatedInput);
        // Add truncation note if needed...
        const rawOutput = await callAI(prompt, AppState.prompts.systemMessage);
        const finalIssues = parseAIResponseIssues(rawOutput);
        console.log(`Synthesized ${finalIssues.length} issues via AI.`);
        updateProcessingStep('synthesize', 'completed');
        return finalIssues;
    } catch (error) {
        console.error("Error during AI Synthesis:", error);
        updateProcessingStep('synthesize', 'error', `AI synthesis failed: ${error.message.substring(0,100)}`);
        console.log("Falling back to client-side synthesis.");
        return simpleDeduplicateAndSort(rawIssues); // Fallback
    }
    */
}


/**
 * Stage 4 (Quick): Perform simple AI analysis based only on metadata and structure.
 * @param {object} assessment - Output from performInitialAssessment.
 * @returns {Promise<Array<object>>} - Array of generated raw issues.
 */
async function performQuickAnalysis(assessment) {
    updateProcessingStep('ai-quick', 'active', 'AI performing quick analysis...');
    try {
        const repoSummary = getCompactRepoSummary();
        const structureSummary = summarizeRepoStructure(AppState.dirStructure);
        const keyPaths = identifyKeyFilesAndDirsHeuristics(AppState.flatTree).slice(0, 20); // Fewer key paths for quick

        const promptTemplate = AppState.prompts.quickAnalysisUserPrompt; // Ensure this exists
        if (!promptTemplate) throw new Error("Quick analysis prompt template missing.");

        const prompt = promptTemplate
            .replace('{repoSummary}', JSON.stringify(repoSummary, null, 2))
            .replace('{structureSummary}', structureSummary)
            .replace('{identifiedKeyPathsList}', keyPaths.map(p => `- ${p}`).join('\n'));

        const rawOutput = await callAI(prompt, AppState.prompts.systemMessage, { max_tokens: 1500 }); // Less tokens for quick
        const issues = parseAIResponseIssues(rawOutput); // Use same parser

        updateProcessingStep('ai-quick', 'completed', `Quick analysis generated ${issues.length} suggestions.`);
        return issues;
    } catch (error) {
        console.error("Error during Quick AI Analysis:", error);
        updateProcessingStep('ai-quick', 'error', `Quick analysis failed: ${error.message.substring(0,100)}`);
        return []; // Return empty on failure
    }
}