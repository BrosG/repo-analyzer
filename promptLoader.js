import { AppState, updateState } from './state.js';
import { Elements } from './ui.js'; // May need Elements if disabling button

/**
 * Load prompts from prompts.json file.
 */
export async function loadPrompts() {
  try {
    const response = await fetch('prompts.json'); // Ensure prompts.json is accessible
    if (!response.ok) {
      // Provide more context on the error
      throw new Error(`Failed to fetch prompts.json: ${response.status} ${response.statusText}`);
    }
    // Check content type maybe? Optional.
    // const contentType = response.headers.get("content-type");
    // if (!contentType || !contentType.includes("application/json")) {
    //   throw new TypeError("Received non-JSON response for prompts file");
    // }

    const loadedPrompts = await response.json(); // This is where the original error likely occurred

    // Basic validation of loaded prompts (optional but good)
    if (!loadedPrompts || typeof loadedPrompts !== 'object' || !loadedPrompts.systemMessage) {
        throw new Error("Prompts file is missing required fields or is not valid JSON.");
    }

    updateState({ prompts: loadedPrompts });
    console.log("Prompts loaded successfully.");

  } catch (error) {
    console.error("Could not load or parse prompts:", error);
    alert(`Error loading critical AI prompts: ${error.message}. Analysis features will be disabled. Please check the file 'prompts.json' and ensure it's valid JSON served correctly.`);
    // Disable analysis button if prompts fail
    if (Elements.analyzeBtn) {
        Elements.analyzeBtn.disabled = true;
        Elements.analyzeBtn.textContent = 'Prompt Loading Failed';
        Elements.analyzeBtn.style.cursor = 'not-allowed';
        Elements.analyzeBtn.style.backgroundColor = 'var(--error)';
    }
  }
}