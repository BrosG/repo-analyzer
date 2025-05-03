// --- Module Imports ---
import { escapeHtml } from './utils.js'; // Assuming utils.js exports this
import { AppState } from './state.js'; // State is needed for rendering
import { AI_PROVIDERS } from './config.js'; // Needed for provider names

// --- Module State ---
// Store DOM elements (initialized in main.js)
export let Elements = {}; // Exported for use in other modules if needed, but primarily used internally here

// --- Initialization ---
/**
 * Initializes the Elements object with references to DOM elements.
 * Called once from main.js after DOMContentLoaded.
 * @param {object} elementSelectors - An object containing references to key DOM elements.
 */
export function initUI(elementSelectors) {
    Elements = elementSelectors;
    if(Object.keys(Elements).length > 0 && Object.values(Elements).every(el => el instanceof Element || el === null)) {
        console.log("UI Elements Initialized:", Object.keys(Elements));
    } else {
        console.error("UI Elements object is empty or contains invalid references after initialization!", Elements);
    }
}

// --- UI Interaction Functions ---

/**
 * Toggle dark mode and update local storage.
 */
export function toggleDarkMode() {
    if (!Elements.themeToggleBtn) {
         console.warn("Theme toggle button not found.");
         return;
    }
    const isDarkMode = document.body.classList.toggle('dark-theme');
    AppState.theme = isDarkMode ? 'dark' : 'light'; // Update state (optional)
    Elements.themeToggleBtn.innerHTML = isDarkMode
        ? '<i class="fas fa-sun" aria-hidden="true"></i>' // Sun icon for dark mode
        : '<i class="fas fa-moon" aria-hidden="true"></i>'; // Moon icon for light mode
    localStorage.setItem('theme', AppState.theme);
    console.log(`Theme toggled to: ${AppState.theme}`);
}

/**
 * Update connection status display and Connect button text/state.
 * @param {boolean} success - Whether the connection was successful.
 * @param {string} [providerName='AI Provider'] - The display name of the provider.
 */
export function updateConnectionStatus(success, providerName = 'AI Provider') {
    // Guard against elements not being ready
    if (!Elements.apiStatusEl || !Elements.connectApiBtn) {
        console.warn("UI elements for connection status not ready.");
        return;
    }

    // Ensure spinner is removed from button if present
    const spinner = Elements.connectApiBtn.querySelector('.spinner');
    if (spinner) spinner.remove();

    if (success) {
        Elements.apiStatusEl.textContent = `✅ ${providerName} Connected`;
        Elements.apiStatusEl.className = 'key-status success';
        Elements.connectApiBtn.textContent = `${providerName} Connected`;
        Elements.connectApiBtn.style.backgroundColor = 'var(--success)';
    } else {
        // When disconnected or failed, always show "Connect [CurrentProvider] API"
        const currentProviderId = Elements.aiProviderSelect?.value || AppState.aiProvider || 'openai';
        const currentProviderConfig = AI_PROVIDERS[currentProviderId];
        const currentProviderName = currentProviderConfig?.name || 'AI Provider';

        // Only update status text if it's not already showing "Extension Required"
        // Let showExtensionRequired handle that specific text
        if (!Elements.apiStatusEl.textContent.includes('Extension Required')) {
            Elements.apiStatusEl.textContent = '❌ Not Connected';
            Elements.apiStatusEl.className = 'key-status error';
        }
        // Set button text correctly for the currently selected provider
        Elements.connectApiBtn.textContent = `Connect ${currentProviderName} API`;
        Elements.connectApiBtn.style.backgroundColor = ''; // Reset color
    }
    // Ensure button is enabled *unless* it's explicitly set to the 'Install' state
     if (Elements.connectApiBtn.textContent !== 'Install APIKeyConnect') {
        Elements.connectApiBtn.disabled = false;
     }
}

// --- Rendering Functions ---

/**
 * Render repository information and stats based on AppState.repoData.
 */
export function renderRepositoryInfo() {
    if (!Elements.repoInfoEl || !Elements.repoSummaryEl) {
         console.error("Cannot render repo info: Target elements not found.");
         return;
    }

    Elements.repoInfoEl.innerHTML = ''; // Clear previous
    Elements.repoSummaryEl.innerHTML = ''; // Clear previous

    if (!AppState.repoData) {
        Elements.repoInfoEl.innerHTML = '<p>Repository information could not be loaded.</p>';
        return;
    }

    const repo = AppState.repoData;

    // Basic Info Section
    Elements.repoInfoEl.innerHTML = `
      <div class="repo-info-header">
        <img src="${escapeHtml(repo.owner?.avatar_url || '')}" alt="${escapeHtml(repo.owner?.login || 'owner')}" class="repo-avatar">
        <div class="repo-titles">
          <h3 class="repo-name">
            <a href="${escapeHtml(repo.html_url || '#')}" target="_blank" rel="noopener noreferrer" class="repo-link">
              ${escapeHtml(repo.name || 'N/A')}
            </a>
          </h3>
          <p class="repo-owner">
            by <a href="${escapeHtml(repo.owner?.html_url || '#')}" target="_blank" rel="noopener noreferrer" class="owner-link">${escapeHtml(repo.owner?.login || 'N/A')}</a>
          </p>
        </div>
      </div>
      <p class="repo-description">${repo.description ? escapeHtml(repo.description) : '<i>No description provided.</i>'}</p>
    `;

    // Stats Section
    const stats = [
        { label: 'Stars', value: repo.stargazers_count, icon: 'fa-star' },
        { label: 'Forks', value: repo.forks_count, icon: 'fa-code-fork' },
        { label: 'Open Issues', value: repo.open_issues_count, icon: 'fa-circle-dot' },
        { label: 'Watchers', value: repo.watchers_count, icon: 'fa-eye' }
    ];

    stats.forEach(stat => {
        if (stat.value === undefined || stat.value === null) return; // Don't render card if value is missing
        const statCard = document.createElement('div');
        statCard.className = 'stat-card';
        statCard.innerHTML = `
            <div class="stat-value"><i class="fas ${stat.icon} stat-icon" aria-hidden="true"></i> ${stat.value.toLocaleString()}</div>
            <div class="stat-label">${escapeHtml(stat.label)}</div>
        `;
        Elements.repoSummaryEl.appendChild(statCard);
    });

    // Languages Stat Card
    if (repo.languagesData && Object.keys(repo.languagesData).length > 0) {
        const languages = Object.keys(repo.languagesData);
        const totalBytes = Object.values(repo.languagesData).reduce((sum, bytes) => sum + (bytes || 0), 0);
        const topLanguages = languages.map(lang => ({ name: lang, bytes: repo.languagesData[lang] || 0 })).sort((a, b) => b.bytes - a.bytes);
        const mainLang = topLanguages[0]?.name || 'N/A';
        let languagesTooltip = topLanguages
            .slice(0, 5) // Show top 5 in tooltip
            .map(lang => `${escapeHtml(lang.name)} (${totalBytes > 0 ? Math.round((lang.bytes / totalBytes) * 100) : 0}%)`)
            .join(', ');
        if (topLanguages.length > 5) languagesTooltip += ', ...';

        const languagesDiv = document.createElement('div');
        languagesDiv.className = 'stat-card';
        languagesDiv.innerHTML = `
          <div class="stat-value lang-value" title="${languagesTooltip}">
             <i class="fas fa-code stat-icon" aria-hidden="true"></i> ${escapeHtml(mainLang)}
          </div>
          <div class="stat-label">Languages</div>
        `;
        Elements.repoSummaryEl.appendChild(languagesDiv);
    } else if (repo.language) { // Fallback
        const langDiv = document.createElement('div');
        langDiv.className = 'stat-card';
        langDiv.innerHTML = `
          <div class="stat-value lang-value">
            <i class="fas fa-code stat-icon" aria-hidden="true"></i> ${escapeHtml(repo.language)}
          </div>
          <div class="stat-label">Primary Language</div>
        `;
        Elements.repoSummaryEl.appendChild(langDiv);
    }

    // Date Stat Cards
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            return new Date(dateString).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) { return 'Invalid Date'; }
    };
    const createDateCard = (label, dateString, icon) => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML = `
          <div class="stat-value date-value">
            <i class="fas ${icon} stat-icon" aria-hidden="true"></i> ${formatDate(dateString)}
          </div>
          <div class="stat-label">${escapeHtml(label)}</div>`;
        return card;
    };
    if (repo.created_at) Elements.repoSummaryEl.appendChild(createDateCard('Created', repo.created_at, 'fa-calendar-day'));
    if (repo.pushed_at) Elements.repoSummaryEl.appendChild(createDateCard('Last Push', repo.pushed_at, 'fa-clock-rotate-left'));
}


/**
 * Get appropriate Font Awesome icon HTML string for file type based on extension/name.
 * @param {string} [filename='file'] - Name of the file.
 * @returns {string} - HTML string for the icon.
 */
export function getFileIcon(filename = 'file') {
    const safeFilename = String(filename);
    const extension = safeFilename.includes('.') ? safeFilename.split('.').pop().toLowerCase() : '';
    const lowerFilename = safeFilename.toLowerCase();

    // Specific filenames prioritized
    const specificFiles = {
        'dockerfile': ['fab fa-docker', '#0db7ed'],
        '.gitignore': ['fab fa-git-alt', '#f1502f'],
        '.gitattributes': ['fab fa-git-alt', '#f1502f'],
        'readme': ['fas fa-book-open', '#6f42c1'],
        'license': ['fas fa-balance-scale', '#f0ad4e'],
        'package.json': ['fab fa-npm', '#cb3837'],
        'package-lock.json': ['fab fa-npm', '#cb3837'],
        'yarn.lock': ['fab fa-yarn', '#2c8ebb'],
        'gemfile': ['fas fa-gem', '#cc342d'],
        'gemfile.lock': ['fas fa-gem', '#cc342d'],
        'requirements.txt': ['fab fa-python', '#3776ab'],
        'pipfile': ['fab fa-python', '#3776ab'],
        'makefile': ['fas fa-cogs', '#4682B4'],
        'composer.json': ['fab fa-php', '#777bb4'],
        'composer.lock': ['fab fa-php', '#777bb4'],
        'go.mod': ['fab fa-golang', '#00add8'],
        'go.sum': ['fab fa-golang', '#00add8'],
        'cargo.toml': ['fab fa-rust', '#dea584'],
        'cargo.lock': ['fab fa-rust', '#dea584'],
    };
    for (const name in specificFiles) {
        if (lowerFilename.startsWith(name)) {
             const [iconClass, iconColor] = specificFiles[name];
            return `<i class="${iconClass} fa-fw" style="color: ${iconColor}; margin-right: 6px;" aria-hidden="true"></i>`;
        }
    }
     if (lowerFilename.includes('docker-compose')) return '<i class="fab fa-docker fa-fw" style="color: #0db7ed;" aria-hidden="true"></i>';
     if (lowerFilename.startsWith('.env')) return '<i class="fas fa-key fa-fw" style="color: #f59e0b;" aria-hidden="true"></i>';

    // Extension mapping
    const iconMap = { // [class, color]
      js: ['fab fa-js', '#f0db4f'], jsx: ['fab fa-react', '#61dafb'],
      ts: ['fa-brands fa-node-js', '#007acc'], tsx: ['fab fa-react', '#007acc'], // Verify fa-brands fa-node-js
      py: ['fab fa-python', '#3776ab'], rb: ['fas fa-gem', '#cc342d'],
      php: ['fab fa-php', '#777bb4'], html: ['fab fa-html5', '#e34f26'],
      css: ['fab fa-css3-alt', '#264de4'], scss: ['fab fa-sass', '#cc6699'],
      sass: ['fab fa-sass', '#cc6699'], less: ['fab fa-less', '#1d365d'],
      md: ['fab fa-markdown', '#6c757d'], json: ['fas fa-brackets-curly', '#adb5bd'],
      yml: ['fas fa-file-code', '#CB171E'], yaml: ['fas fa-file-code', '#CB171E'],
      xml: ['fas fa-file-code', '#ff6600'], java: ['fab fa-java', '#b07219'],
      c: ['fas fa-file-code', '#a8b9cc'], h: ['fas fa-file-code', '#a8b9cc'],
      cpp: ['fas fa-file-code', '#00599c'], hpp: ['fas fa-file-code', '#00599c'],
      cs: ['fas fa-file-code', '#68217a'], go: ['fab fa-golang', '#00add8'],
      rs: ['fab fa-rust', '#dea584'], swift: ['fab fa-swift', '#ffac45'],
      kt: ['fa-brands fa-kickstarter-k', '#f18e33'], // Verify fa-brands fa-kickstarter-k
      sh: ['fas fa-terminal', '#4EAA25'], sql: ['fas fa-database', '#f29111'],
      txt: ['fas fa-file-alt', '#6c757d'], pdf: ['fas fa-file-pdf', '#dc3545'],
      png: ['fas fa-file-image', '#28a745'], jpg: ['fas fa-file-image', '#28a745'],
      jpeg: ['fas fa-file-image', '#28a745'], gif: ['fas fa-file-image', '#28a745'],
      svg: ['fas fa-file-image', '#fd7e14'], webp: ['fas fa-file-image', '#28a745'],
      zip: ['fas fa-file-archive', '#ffc107'], gz: ['fas fa-file-archive', '#ffc107'],
      tar: ['fas fa-file-archive', '#ffc107'], rar: ['fas fa-file-archive', '#ffc107'],
      '7z': ['fas fa-file-archive', '#ffc107'],
      mp3: ['fas fa-file-audio', '#007bff'], wav: ['fas fa-file-audio', '#007bff'],
      ogg: ['fas fa-file-audio', '#007bff'], mp4: ['fas fa-file-video', '#6f42c1'],
      mov: ['fas fa-file-video', '#6f42c1'], avi: ['fas fa-file-video', '#6f42c1'],
      webm: ['fas fa-file-video', '#6f42c1'], log: ['fas fa-file-lines', '#6c757d'],
      csv: ['fas fa-file-csv', '#28a745'], xls: ['fas fa-file-excel', '#1D6F42'],
      xlsx: ['fas fa-file-excel', '#1D6F42'], doc: ['fas fa-file-word', '#2B579A'],
      docx: ['fas fa-file-word', '#2B579A'], ppt: ['fas fa-file-powerpoint', '#D04423'],
      pptx: ['fas fa-file-powerpoint', '#D04423'],
    };

    const [iconClass, iconColor] = iconMap[extension] || ['fas fa-file', '#6c757d']; // Default

    // Use fa-fw for fixed width icons
    return `<i class="${iconClass} fa-fw" style="color: ${iconColor}; margin-right: 6px;" aria-hidden="true"></i>`;
}

/**
 * Render directory structure tree view based on AppState.dirStructure.
 */
export function renderDirectoryStructure() {
    if (!Elements.dirTreeEl) return;
    Elements.dirTreeEl.innerHTML = ''; // Clear previous

    if (!AppState.dirStructure || !AppState.dirStructure.children || AppState.dirStructure.children.length === 0) {
        Elements.dirTreeEl.innerHTML = '<p class="empty-tree-msg"><i>Directory structure is empty or could not be loaded.</i></p>';
        return;
    }

    // Recursive rendering function
    function renderTree(node, container, level = 0) {
        if (level > 15) { // Depth limit safeguard
            const li = document.createElement('li');
            li.className = 'tree-depth-limit';
            li.innerHTML = '<span class="text-muted"><i>... (Depth limit reached)</i></span>';
            container.appendChild(li); return;
        }

        const ul = document.createElement('ul');
        ul.setAttribute('role', level === 0 ? 'tree' : 'group'); // Set role for nested groups
        if (level > 0) ul.classList.add('nested-list'); // For styling indentation via CSS

        if (node.children && node.children.length > 0) {
            node.children.sort((a, b) => { // Sort: dirs first, then alpha
                if (a.type === 'directory' && b.type !== 'directory') return -1;
                if (a.type !== 'directory' && b.type === 'directory') return 1;
                return a.name.localeCompare(b.name);
            });

            for (const child of node.children) {
                const li = document.createElement('li');
                li.setAttribute('role', 'treeitem');
                li.setAttribute('aria-level', level + 1);

                if (child.type === 'directory') {
                    li.classList.add('dir-node');
                    const hasChildren = child.children && child.children.length > 0;
                    li.innerHTML = `<span class="dir">${getFileIcon(child.name || 'folder')} ${escapeHtml(child.name)}</span>`;
                    if (hasChildren) {
                        renderTree(child, li, level + 1);
                        li.setAttribute('aria-expanded', 'true'); // Assume expanded
                    } else {
                         li.setAttribute('aria-expanded', 'false');
                         li.classList.add('empty-dir');
                    }
                } else { // File node
                    li.classList.add('file-node');
                    li.innerHTML = `<span class="file">${getFileIcon(child.name)} ${escapeHtml(child.name)}</span>`;
                }
                ul.appendChild(li);
            }
            container.appendChild(ul);
        }
    }
    // Start rendering from the root node, attaching to the main dirTreeEl
    renderTree(AppState.dirStructure, Elements.dirTreeEl, 0);
    Elements.dirTreeEl.setAttribute('aria-label', 'Repository Directory Tree');
}

/**
 * Render generated issues list based on AppState.finalGeneratedIssues.
 */
export function renderIssuesList() {
    if (!Elements.issuesListEl) {
        console.error("Issues list element not found.");
        return;
    }
    Elements.issuesListEl.innerHTML = ''; // Clear previous

    const issuesToRender = AppState.finalGeneratedIssues;

    if (!issuesToRender || issuesToRender.length === 0) {
      Elements.issuesListEl.innerHTML = '<p class="empty-issues-msg"><i>No actionable issue recommendations were generated.</i></p>';
      return;
    }

    issuesToRender.forEach((issue, index) => {
      const issueCard = document.createElement('div');
      issueCard.className = 'issue-card';
      issueCard.setAttribute('role', 'listitem');
      // Sanitize type and priority for CSS classes
      const type = issue.type || 'general';
      const priority = issue.priority || 'medium';
      const typeClass = type.toLowerCase().replace(/[^a-z0-9-]/g, '');
      const priorityClass = `priority-${priority.toLowerCase()}`;

      // Create GitHub Issue URL
      const createIssueUrl = () => {
          if (!AppState.repoData?.html_url) return '#';
          const repoUrl = AppState.repoData.html_url;
          const title = encodeURIComponent(issue.title || `AI Suggestion ${index + 1}`);
          let body = `**AI Generated Issue Suggestion (${AppState.aiProvider || 'AI'})**\n\n`;
          body += `**Description:**\n${issue.description || 'N/A'}\n\n`;
          const displayPath = (issue.filePath && !issue.filePath.startsWith('MultipleFilesIn') && !issue.filePath.startsWith('Interaction between')) ? issue.filePath : null;
          if (displayPath) {
               body += `**Relevant File:** \`${displayPath}\``;
               if (issue.lineNumber) body += ` (around line ${issue.lineNumber})`;
               body += `\n`;
          } else if (issue.analysisArea) {
               body += `**Relevant Area:** ${issue.analysisArea}\n`;
          }
          body += `\n**Priority:** ${priority}\n`;
          body += `\n_Generated by RepoAnalyzer | Analysis Area: ${issue.analysisArea || 'General'}_`;
          const labels = [type, 'AI-Suggestion', `priority-${priority}`];
          return `${repoUrl}/issues/new?title=${title}&body=${encodeURIComponent(body)}&labels=${labels.map(encodeURIComponent).join(',')}`;
      };

      // Determine display path/area for card
      let displayLocation = '';
      const displayPath = (issue.filePath && !issue.filePath.startsWith('MultipleFilesIn') && !issue.filePath.startsWith('Interaction between')) ? issue.filePath : null;
       if (displayPath) {
           displayLocation = `
            <div class="issue-file" title="Relevant File: ${escapeHtml(issue.filePath)}">
              ${getFileIcon(issue.filePath)}
              <span>${escapeHtml(issue.filePath)}${issue.lineNumber ? `:${issue.lineNumber}` : ''}</span>
            </div>`;
       } else if (issue.analysisArea) {
           displayLocation = `
            <div class="issue-file analysis-area" title="Analysis Area: ${escapeHtml(issue.analysisArea)}">
              <i class="fas fa-puzzle-piece fa-fw" aria-hidden="true"></i>
              <span>${escapeHtml(issue.analysisArea)}</span>
            </div>`;
       }

      issueCard.innerHTML = `
        <div class="issue-header">
            <span class="issue-type ${typeClass}" title="Type: ${escapeHtml(type)}">${escapeHtml(type)}</span>
            <span class="issue-priority ${priorityClass}" title="Priority: ${escapeHtml(priority)}">${escapeHtml(priority)}</span>
        </div>
        <h3 class="issue-title">${escapeHtml(issue.title || 'Untitled Issue')}</h3>
        <p class="issue-description">${escapeHtml(issue.description || 'No description provided.')}</p>
        ${displayLocation}
        <div class="issue-actions">
          <a href="${createIssueUrl()}" target="_blank" rel="noopener noreferrer" class="issue-btn create-gh-issue" title="Create this issue on GitHub">
            <i class="fab fa-github" aria-hidden="true"></i> Create Issue
          </a>
        </div>`;
      Elements.issuesListEl.appendChild(issueCard);
    });
}


/**
 * Show processing popup and initialize steps based on AppState.analysisSteps.
 */
export function showProcessingPopup() {
    if (!Elements.processingPopup || !Elements.processingStepsEl || !Elements.progressBarEl || !Elements.statusTextEl) {
         console.error("Cannot show processing popup: Required elements missing.");
         return;
    }

    Elements.processingStepsEl.innerHTML = ''; // Clear previous steps
    if (!AppState.analysisSteps || AppState.analysisSteps.length === 0) {
         console.warn("No analysis steps defined for popup.");
         AppState.analysisSteps = [{id:'fallback', title:'Processing...', description:'Starting analysis.'}];
    }

    // Build step elements
    AppState.analysisSteps.forEach(step => {
      const stepEl = document.createElement('div');
      stepEl.className = 'processing-step pending';
      stepEl.id = `step-${step.id}`;
      stepEl.setAttribute('role', 'listitem');
      stepEl.innerHTML = `
        <div class="step-icon pending" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>
        </div>
        <div class="step-content">
          <div class="step-title">${escapeHtml(step.title)}</div>
          <div class="step-description">${escapeHtml(step.description)}</div>
        </div>`;
      Elements.processingStepsEl.appendChild(stepEl);
    });

    // Reset progress bar and status text
    Elements.progressBarEl.style.width = '0%';
    Elements.progressBarEl.setAttribute('aria-valuenow', "0");
    Elements.statusTextEl.textContent = AppState.analysisSteps[0]?.description || 'Initializing analysis...';

    // Show popup with transition
    Elements.processingPopup.style.display = 'flex';
    void Elements.processingPopup.offsetWidth; // Trigger reflow
    Elements.processingPopup.classList.add('active');
    document.body.style.overflow = 'hidden';
    Elements.processingPopup.focus(); // Set focus
}

/**
 * Hide processing popup with fade out transition.
 */
export function hideProcessingPopup() {
    if (!Elements.processingPopup) return;
    Elements.processingPopup.classList.remove('active');
    const transitionDuration = 300; // Match CSS transition duration
    const onTransitionEnd = (event) => {
        if (event.target === Elements.processingPopup && event.propertyName === 'opacity') {
            Elements.processingPopup.style.display = 'none';
            Elements.processingPopup.removeEventListener('transitionend', onTransitionEnd);
        }
    };
    Elements.processingPopup.addEventListener('transitionend', onTransitionEnd);
    // Fallback timeout
    setTimeout(() => {
        if (!Elements.processingPopup.classList.contains('active')) {
            Elements.processingPopup.style.display = 'none';
            Elements.processingPopup.removeEventListener('transitionend', onTransitionEnd);
        }
    }, transitionDuration + 50);

    document.body.style.overflow = ''; // Restore scroll
}

/**
 * Update individual processing step's visual status and icon.
 * Also updates the overall progress bar and status text.
 * @param {string} stepId - ID of the step to update.
 * @param {'pending'|'active'|'completed'|'error'|'warning'|'skipped'} status - The new status.
 * @param {string} [description=null] - Optional text to update the step description and status text area.
 */
export function updateProcessingStep(stepId, status, description = null) {
    if (!Elements.processingStepsEl) return;
    const stepEl = document.getElementById(`step-${stepId}`);
    if (!stepEl) {
        console.warn(`Processing step element not found: #step-${stepId}`);
        return;
    }

    // Update Status Class
    stepEl.className = 'processing-step'; // Reset classes
    stepEl.classList.add(status);

    // Update Icon
    const iconEl = stepEl.querySelector('.step-icon');
    if (iconEl) {
        iconEl.className = `step-icon ${status}`;
        iconEl.style.backgroundColor = ''; // Reset inline style
        const icons = { // SVG Icons
            active: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spinner-icon"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
            completed: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>`,
            error: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
            warning: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
            skipped: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
            pending: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>`
        };
        iconEl.innerHTML = icons[status] || icons.pending;
        // Apply background color via class where needed (CSS preferred)
         if (status === 'error') iconEl.style.backgroundColor = 'var(--error)'; // Keep direct style for emphasis
         else if (status === 'warning') iconEl.style.backgroundColor = 'var(--warning)';
    }

    // Update Step Description Text
    const descEl = stepEl.querySelector('.step-description');
    if (description && descEl) {
        descEl.textContent = description;
    }

    // Update Overall Status Text at bottom
    if (description && Elements.statusTextEl && (status === 'active' || status === 'error' || status === 'warning')) {
        Elements.statusTextEl.textContent = description;
    } else if (status === 'completed' && stepId === AppState.analysisSteps[AppState.analysisSteps.length - 1]?.id) {
         Elements.statusTextEl.textContent = description || "Analysis complete!"; // Final status update
    }

    // Ensure visibility and update progress
    stepEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    updateProgressBar(); // Recalculate progress
}


/**
 * Update progress bar based on current completed/active steps in AppState.analysisSteps.
 */
export function updateProgressBar() {
    if (!Elements.progressBarEl || !AppState.analysisSteps || AppState.analysisSteps.length === 0) return;

    const totalSteps = AppState.analysisSteps.length;
    let completedIndex = -1;
    let activeIndex = -1;

    // Find last completed and first active step index
    for (let i = 0; i < totalSteps; i++) {
        const stepId = AppState.analysisSteps[i].id;
        const stepEl = document.getElementById(`step-${stepId}`);
        if (stepEl) {
            if (stepEl.classList.contains('completed')) completedIndex = i;
            if (activeIndex === -1 && stepEl.classList.contains('active')) activeIndex = i;
        }
    }

    let currentProgressIndex = completedIndex;
    // Adjust progress based on the active step
    if (activeIndex !== -1 && activeIndex > completedIndex) {
        currentProgressIndex = activeIndex - 0.5; // Show partial progress
    } else if (completedIndex === totalSteps - 1) {
        currentProgressIndex = totalSteps -1; // Fully completed
    }

    const percentage = Math.min(100, Math.max(0, ((currentProgressIndex + 1) / totalSteps) * 100));

    Elements.progressBarEl.style.width = `${percentage}%`;
    Elements.progressBarEl.setAttribute('aria-valuenow', Math.round(percentage).toString());
}

/**
 * Renders all results sections (Info, Structure, Issues) based on current AppState.
 */
export function renderResults() {
    console.log("Rendering final results...");
    if (!Elements.resultsSection) {
         console.error("Results section element not found for rendering.");
         return; // Exit if the main container isn't there
    }

    try {
        renderRepositoryInfo();      // Render repo details and stats
        renderDirectoryStructure(); // Render the file tree
        renderIssuesList();         // Render the generated issues
    } catch (error) {
        console.error("Error during final results rendering:", error);
        Elements.resultsSection.innerHTML = `<div class="data-card"><h2 class="card-title error">Rendering Error</h2><p class="card-description">Failed to display analysis results. Please check the console.</p></div>`;
    } finally {
        // Ensure the results section is made visible
        Elements.resultsSection.style.display = 'block';
    }
}