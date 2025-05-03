import { AppState } from './state.js';
import { MAX_FILES_PER_GROUP_ANALYSIS } from './config.js';

/**
 * Basic HTML escaping function
 * @param {string | null | undefined} str Input string
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const strVal = String(str); // Ensure it's a string first

    // Define the map with CORRECT entity replacements
    const map = {
        '&': '&amp;',  // Replace & with &amp;
        '<': '&lt;',   // Replace < with &lt;
        '>': '&gt;',   // Replace > with &gt;
        '"': '&quot;', // Replace " with &quot;
        "'": '&#39;'   // Replace ' with &#39;
    }; // Closing brace for the map object

    // Use a single regex to replace characters using the map
    // This return statement is now OUTSIDE the map definition
    return strVal.replace(/[&<>\"']/g, m => map[m]);
}
/**
 * Create a delay using a Promise
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse GitHub repository URL to extract owner and name
 */
export function parseRepoUrl(url) {
    try {
      const cleanedUrl = url.split('#')[0].split('?')[0];
      const githubUrlPattern = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/)?$/;
      const match = cleanedUrl.match(githubUrlPattern);
      if (match && match.length === 3) {
        return { owner: match[1], name: match[2] };
      }
      return null;
    } catch (error) {
      console.error('Error parsing repo URL:', error);
      return null;
    }
}

/**
 * Convert flat tree from GitHub API to a hierarchical structure.
 */
export function createDirectoryTree(items) {
    const root = { name: '', path: '', type: 'directory', children: [] };
    const nodeMap = { '': root };
    items.sort((a, b) => a.path.split('/').length - b.path.split('/').length);

    for (const item of items) {
        const pathParts = item.path.split('/');
        const itemName = pathParts.pop();
        const parentPath = pathParts.join('/');
        let parentNode = nodeMap[parentPath];

        if (!parentNode) {
             console.warn(`Parent node not found for path: ${item.path}. Attaching to root.`);
             parentNode = root;
        }

        const newNode = {
            name: itemName, path: item.path, type: item.type === 'tree' ? 'directory' : 'file',
            sha: item.sha, size: item.size, children: item.type === 'tree' ? [] : undefined
        };

        if (!parentNode.children) parentNode.children = [];
        parentNode.children.push(newNode);

        if (newNode.type === 'directory') nodeMap[item.path] = newNode;
    }
    return root;
}

/**
 * Creates a compact summary of repo data for AI prompts.
 */
export function getCompactRepoSummary() {
     return {
        name: AppState.repoData?.name,
        description: AppState.repoData?.description?.slice(0, 200),
        language: AppState.repoData?.language,
        stars: AppState.repoData?.stargazers_count,
        createdAt: AppState.repoData?.created_at,
      };
}

/**
 * Count items (files or directories) recursively in tree
 */
export function countItems(node, type) {
    if (!node || !node.children) return 0;
    let count = 0;
    for (const child of node.children) {
      if (child.type === type) count += 1;
      if (child.type === 'directory') count += countItems(child, type);
    }
    return count;
}

/**
 * Summarize file types (extensions) in tree
 */
export function summarizeFileTypes(node) {
    const extensions = {};
    function traverse(node) {
      if (!node || !node.children) return;
      for (const child of node.children) {
        if (child.type === 'file') {
          const parts = child.name.split('.');
          const ext = parts.length > 1 ? parts.pop().toLowerCase() : (child.name.startsWith('.') ? child.name.substring(1) || '(hidden)' : '(no ext)');
          if (ext) extensions[ext] = (extensions[ext] || 0) + 1;
        } else if (child.type === 'directory') traverse(child);
      }
    }
    traverse(node);
    return extensions;
}

/**
 * Summarize top-level directories and their file counts
 */
export function summarizeTopLevelDirs(node) {
    const directories = [];
    if (!node || !node.children) return directories;
    for (const child of node.children) {
      if (child.type === 'directory') {
        directories.push({ name: child.name, fileCount: countItems(child, 'file') });
      }
    }
    return directories.sort((a, b) => b.fileCount - a.fileCount);
}

/**
 * Summarize repository structure for the AI prompt
 */
export function summarizeRepoStructure(tree) {
    if (!tree || !tree.children || tree.children.length === 0) {
      return "No directory structure could be retrieved or the repository is empty.";
    }
    const directoryCount = countItems(tree, 'directory');
    const fileCount = countItems(tree, 'file');
    const fileTypes = summarizeFileTypes(tree);
    const mainDirs = summarizeTopLevelDirs(tree);
    let summary = `Root contains ${tree.children.length} items.\nTotal Directories: ${directoryCount}, Total Files: ${fileCount}\n\n`;
    const sortedTypes = Object.entries(fileTypes).sort((a, b) => b[1] - a[1]);
    if (sortedTypes.length > 0) {
      summary += "Top File Extensions:\n" + sortedTypes.slice(0, 10).map(([ext, count]) => `- .${ext}: ${count}`).join('\n') + (sortedTypes.length > 10 ? '\n- ... and others' : '') + '\n\n';
    }
    if (mainDirs.length > 0) {
      summary += "Main Top-Level Directories:\n" + mainDirs.slice(0,10).map(dir => `- ${dir.name} (${dir.fileCount} files)`).join('\n') + '\n';
    }
    const commonConfigs = AppState.flatTree // Use flatTree from state
        .filter(item => item.type === 'file' && item.path.indexOf('/') === -1 && /^(package\.json|requirements\.txt|pom\.xml|build\.gradle|composer\.json|go\.mod|Cargo\.toml|Gemfile|\.env|\.gitignore|Dockerfile|docker-compose\.yml|Makefile|setup\.py)$/i.test(item.name))
        .map(item => item.name);
    if (commonConfigs.length > 0) {
        summary += "\nCommon Config Files at Root:\n- " + commonConfigs.join('\n- ');
    }
    return summary.trim();
}


/**
 * Identifies potentially important files/dirs using heuristics.
 */
export function identifyKeyFilesAndDirsHeuristics(flatTree, dirsOnly = false) {
    // (Implementation from previous response - keep as is)
    const keyFiles = [];
    const keyDirs = new Set();
    const patterns = [
        { regex: /^(readme|contributing|license|changelog)\.md$/i, weight: 10, type: 'doc' },
        { regex: /^(package\.json|composer\.json|pom\.xml|build\.gradle|requirements\.txt|go\.mod|gemfile|cargo\.toml)$/i, weight: 9, type: 'config' },
        { regex: /^(dockerfile|docker-compose\.yml)$/i, weight: 8, type: 'config' },
        { regex: /\.(test|spec)\.[jt]sx?$/i, weight: 7, type: 'test' }, // Test files
        { regex: /^(src|app|lib|core|server|client|ui|api)\//i, weight: 6, type: 'code' }, // Common source dirs
        { regex: /(controller|service|handler|router|middleware|model|entity|repository|dao|util|helper|config|main|index|app|server)\.[a-z]+$/i, weight: 5, type: 'code' }, // Common file roles
        { regex: /\.jsx?$/i, weight: 4, type: 'code' },
        { regex: /\.tsx?$/i, weight: 4, type: 'code' },
        { regex: /\.py$/i, weight: 4, type: 'code' },
        { regex: /\.java$/i, weight: 4, type: 'code' },
        { regex: /\.go$/i, weight: 4, type: 'code' },
        { regex: /\.rb$/i, weight: 4, type: 'code' },
        { regex: /\.php$/i, weight: 4, type: 'code' },
        { regex: /\.rs$/i, weight: 4, type: 'code' },
    ];

    const scoredItems = flatTree.map(item => {
        let score = 0;
        let type = 'other';
        for (const p of patterns) {
            if (item.path.match(p.regex)) {
                score += p.weight;
                type = p.type;
                break;
            }
        }
        score -= item.path.split('/').length * 0.1;
        if (item.size > 0) score += 1;

        if (item.type === 'tree' || (item.type === 'blob' && item.path.includes('/'))) {
            const dir = item.path.substring(0, item.path.lastIndexOf('/'));
             if (dir && !dir.includes('/')) { keyDirs.add(dir); }
             else if (dir) { // Add nested common dirs too
                 const dirName = dir.substring(dir.lastIndexOf('/') + 1);
                 if(/^(src|app|lib|core|server|client|ui|api|components|modules|pages|services|controllers|models|utils|helpers)$/i.test(dirName)) {
                     keyDirs.add(dir);
                 }
             }
        }
        return { ...item, score, type };
    }).filter(item => item.type === 'blob');

    scoredItems.sort((a, b) => b.score - a.score);

    if (dirsOnly) {
         const likelyModuleDirs = [...keyDirs].filter(dir =>
            /^(src|app|lib|core|server|client|ui|api|components|modules|pages|services|controllers|models|utils|helpers)$/i.test(dir.split('/').pop()) || // check last part of path
            scoredItems.some(item => item.path.startsWith(dir + '/') && item.type === 'code')
        );
        // Sort by path depth (shallower first) then name
        likelyModuleDirs.sort((a,b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
        return likelyModuleDirs.slice(0,10);
    } else {
        return scoredItems.map(item => item.path);
    }
}

/**
 * Selects files/groups for deeper analysis based on focus areas and heuristics.
 */
 export function groupAndSelectFilesForAnalysis(focusAreas, prioritizedFiles, maxFilesToFetch) {
    const filesToAnalyze = new Map();
    const selectedPaths = new Set();
    let fileCount = 0;
    const allFiles = AppState.flatTree.filter(item => item.type === 'blob'); // Use state

    const addFile = (file, groupName = `individual-${file.path.replace(/[\/\.]/g, '-')}`) => { // Unique individual keys
        if (fileCount >= maxFilesToFetch || selectedPaths.has(file.path)) return;

        if (!filesToAnalyze.has(groupName)) {
            filesToAnalyze.set(groupName, []);
        }

        // If group is full or it's meant to be individual, ensure it's handled correctly
        if (groupName.startsWith('individual-') || filesToAnalyze.get(groupName).length >= MAX_FILES_PER_GROUP_ANALYSIS) {
             // If it was meant for a group but group is full, create new individual group
             if (!groupName.startsWith('individual-')) {
                 groupName = `individual-${file.path.replace(/[\/\.]/g, '-')}`;
                 if (!filesToAnalyze.has(groupName)) { // Ensure unique key isn't already taken somehow
                     filesToAnalyze.set(groupName, []);
                 } else { return; } // Skip if somehow key exists and is full (unlikely)
             }
             // If individual group already has a file (shouldn't happen with unique keys), skip
             if (filesToAnalyze.get(groupName).length > 0) return;
        }

        filesToAnalyze.get(groupName).push(file);
        selectedPaths.add(file.path);
        fileCount++;
    };

    // 1. Files related to focus areas (try grouping)
    focusAreas.forEach(area => {
        const areaKeywords = area.toLowerCase().split(/[\s_-]+/).filter(k => k.length > 2);
        const relatedFiles = allFiles
            .filter(file => areaKeywords.some(kw => file.path.toLowerCase().includes(kw)))
            .sort((a, b) => prioritizedFiles.indexOf(a.path) - prioritizedFiles.indexOf(b.path)); // Use heuristic prio

        const groupName = `area-${area.replace(/[^a-z0-9]/gi, '-').toLowerCase().substring(0, 20)}`;
        relatedFiles.slice(0, MAX_FILES_PER_GROUP_ANALYSIS).forEach(file => addFile(file, groupName));
    });

    // 2. Top priority individual files (fill remaining quota)
    prioritizedFiles.forEach(path => {
        if (fileCount >= maxFilesToFetch) return;
        const file = allFiles.find(f => f.path === path);
        if (file && !selectedPaths.has(path)) {
            addFile(file); // Will create unique individual group key
        }
    });

    console.log(`Selected ${fileCount} files in ${filesToAnalyze.size} groups for analysis.`);
    return filesToAnalyze;
}

/**
 * Parses the structured output expected from the Stage 1 AI prompt.
 */
export function parseStage1Output(rawOutput) {
    // (Implementation from previous response - keep as is)
    const output = { repoPurpose: "General Repository", coreModules: [], focusAreas: [] };
    try {
        const purposeMatch = rawOutput.match(/Purpose:\s*([\s\S]*?)(?:Core Modules:|Focus Areas:|$)/im);
        if (purposeMatch) output.repoPurpose = purposeMatch[1].trim();

        const modulesMatch = rawOutput.match(/Core Modules:\s*([\s\S]*?)(?:Focus Areas:|$)/im);
        if (modulesMatch) {
            output.coreModules = modulesMatch[1].split('\n').map(line => line.replace(/^-?\s*/, '').trim()).filter(line => line.length > 1);
        }

        const focusMatch = rawOutput.match(/Focus Areas:\s*([\s\S]*?)$/im);
        if (focusMatch) {
            output.focusAreas = focusMatch[1].split('\n').map(line => line.replace(/^-?\s*/, '').trim()).filter(line => line.length > 1);
        }
    } catch (e) { console.error("Failed to parse Stage 1 output:", e, "\nRaw output:", rawOutput); }
    if (output.focusAreas.length === 0 && output.coreModules.length > 0) output.focusAreas = output.coreModules.slice(0, 3);
    else if (output.focusAreas.length === 0) output.focusAreas = identifyKeyFilesAndDirsHeuristics(AppState.flatTree, true).slice(0, 3);
    return output;
}

/**
 * Parses the structured output expected from Stage 3/4 AI prompts.
 */
export function parseAIResponseIssues(rawOutput) {
     // (Implementation from previous response - keep as is)
     const issues = [];
     const issueBlocks = rawOutput.split('---');
     for (const block of issueBlocks) {
         if (block.trim().length < 10) continue;
         const issue = {};
         const titleMatch = block.match(/\*\*Title:\*\*\s*([\s\S]*?)(?=\n\*\*Description:\*\*|$)/i);
         const descMatch = block.match(/\*\*Description:\*\*\s*([\s\S]*?)(?=\n\*\*Type:\*\*|$)/i);
         const typeMatch = block.match(/\*\*Type:\*\*\s*([\s\S]*?)(?=\n\*\*File Path:\*\*|$)/i);
         const fileMatch = block.match(/\*\*File Path:\*\*\s*([\s\S]*?)(?=\n\*\*Line Number:|\*\*Priority:\*\*|$)/i);
         const lineMatch = block.match(/\*\*Line Number:\*\*\s*([\s\S]*?)(?=\n\*\*Priority:\*\*|$)/i);
         const priorityMatch = block.match(/\*\*Priority:\*\*\s*(Low|Medium|High|Critical)/i);

         if (titleMatch) issue.title = titleMatch[1].trim();
         if (descMatch) issue.description = descMatch[1].trim();
         if (typeMatch) issue.type = typeMatch[1].trim().toLowerCase().replace(/[^a-z0-9-]/g,''); // Sanitize type
         if (fileMatch) issue.filePath = fileMatch[1].trim().replace(/[`]/g, '');
         if (lineMatch) { const lineNum = parseInt(lineMatch[1].trim(), 10); issue.lineNumber = isNaN(lineNum) ? null : lineNum; }
         if (priorityMatch) issue.priority = priorityMatch[1].trim();
         else issue.priority = 'Medium'; // Default priority

         if (issue.title && issue.description && issue.type) issues.push(issue);
         else console.warn("Skipped parsing issue block:", block);
     }
     return issues;
 }

/**
 * Simple client-side deduplication and sorting.
 */
export function simpleDeduplicateAndSort(rawIssues) {
    const uniqueIssuesMap = new Map();
    const priorityOrder = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };

    rawIssues.forEach(issue => {
        const key = `${(issue.filePath || 'na').toLowerCase()}_${issue.title.toLowerCase().substring(0, 30)}`;
        if (!uniqueIssuesMap.has(key) || (priorityOrder[issue.priority] > priorityOrder[uniqueIssuesMap.get(key).priority])) {
            uniqueIssuesMap.set(key, issue);
        }
    });

    let finalIssues = Array.from(uniqueIssuesMap.values());
    finalIssues.sort((a, b) => (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0));
    return finalIssues;
}