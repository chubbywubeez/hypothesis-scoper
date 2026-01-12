// Frontend JavaScript for Hypothesis Scoper
// Handles user interactions, API calls, and clipboard operations

// Store original idea for scope generation
let originalIdea = '';

// Store raw markdown content for export (before formatting for display)
let rawHypothesisContent = '';
let rawScopeContent = '';
let rawQuickScopeContent = '';

// Store original content when editing (for cancel functionality)
let originalHypothesisContent = '';

// Progress tracking for loading bars
let progressInterval = null;
let startTime = null;

// Helper function: Convert markdown to HTML for nice display in the app
// This renders markdown as formatted HTML so it looks nice in the browser
function markdownToHtml(markdown) {
    if (!markdown) return '';
    
    // Split into lines for processing
    const lines = markdown.split('\n');
    const output = [];
    let inList = false;
    let listType = null; // 'ul' or 'ol'
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        if (!trimmed) {
            // Empty line - close current list if open, add paragraph break
            if (inList) {
                output.push(`</${listType}>`);
                inList = false;
                listType = null;
            }
            continue;
        }
        
        // Check for headers
        if (trimmed.startsWith('###### ')) {
            if (inList) {
                output.push(`</${listType}>`);
                inList = false;
                listType = null;
            }
            output.push(`<h6>${escapeHtml(trimmed.substring(7))}</h6>`);
            continue;
        } else if (trimmed.startsWith('##### ')) {
            if (inList) {
                output.push(`</${listType}>`);
                inList = false;
                listType = null;
            }
            output.push(`<h5>${escapeHtml(trimmed.substring(6))}</h5>`);
            continue;
        } else if (trimmed.startsWith('#### ')) {
            if (inList) {
                output.push(`</${listType}>`);
                inList = false;
                listType = null;
            }
            output.push(`<h4>${escapeHtml(trimmed.substring(5))}</h4>`);
            continue;
        } else if (trimmed.startsWith('### ')) {
            if (inList) {
                output.push(`</${listType}>`);
                inList = false;
                listType = null;
            }
            output.push(`<h3>${escapeHtml(trimmed.substring(4))}</h3>`);
            continue;
        } else if (trimmed.startsWith('## ')) {
            if (inList) {
                output.push(`</${listType}>`);
                inList = false;
                listType = null;
            }
            output.push(`<h2>${escapeHtml(trimmed.substring(3))}</h2>`);
            continue;
        } else if (trimmed.startsWith('# ')) {
            if (inList) {
                output.push(`</${listType}>`);
                inList = false;
                listType = null;
            }
            output.push(`<h1>${escapeHtml(trimmed.substring(2))}</h1>`);
            continue;
        }
        
        // Check for unordered list
        if (/^[-*•]\s/.test(trimmed)) {
            if (!inList || listType !== 'ul') {
                if (inList) {
                    output.push(`</${listType}>`);
                }
                output.push('<ul>');
                inList = true;
                listType = 'ul';
            }
            const content = formatInlineMarkdown(trimmed.replace(/^[-*•]\s+/, ''));
            output.push(`<li>${content}</li>`);
            continue;
        }
        
        // Check for ordered list
        if (/^\d+\.\s/.test(trimmed)) {
            if (!inList || listType !== 'ol') {
                if (inList) {
                    output.push(`</${listType}>`);
                }
                output.push('<ol>');
                inList = true;
                listType = 'ol';
            }
            const content = formatInlineMarkdown(trimmed.replace(/^\d+\.\s+/, ''));
            output.push(`<li>${content}</li>`);
            continue;
        }
        
        // Regular paragraph line
        if (inList) {
            output.push(`</${listType}>`);
            inList = false;
            listType = null;
        }
        
        // Format inline markdown and add as paragraph (or combine with previous paragraph)
        const formatted = formatInlineMarkdown(trimmed);
        output.push(`<p>${formatted}</p>`);
    }
    
    // Close any open list
    if (inList) {
        output.push(`</${listType}>`);
    }
    
    return output.join('\n');
}

// Helper: Format inline markdown (bold, italic, code)
function formatInlineMarkdown(text) {
    if (!text) return '';
    
    let html = escapeHtml(text);
    
    // Bold: **text** (must be before italic)
    html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+?)__/g, '<strong>$1</strong>');
    
    // Code: `code`
    html = html.replace(/`([^`]+?)`/g, '<code>$1</code>');
    
    // Italic: *text* (avoid matching **)
    html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
    
    return html;
}

// Helper: Escape HTML entities
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Helper: Format plain text with headings (for Quick Scope which doesn't use markdown)
// Detects common heading patterns and converts them to HTML headings
function formatPlainTextWithHeadings(text) {
    if (!text) return '';
    
    const lines = text.split('\n');
    const output = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
            output.push('<br/>');
            continue;
        }
        
        // Detect common heading patterns (word followed by colon on its own line)
        // Like "Hypothesis:", "User Story:", "MVP:", etc.
        if (line.match(/^[A-Z][a-zA-Z\s]+:$/) && (i === 0 || lines[i-1].trim() === '')) {
            // Check if next line is not empty (so it's not just a label)
            if (i + 1 < lines.length && lines[i + 1].trim() !== '') {
                output.push(`<h2>${escapeHtml(line.slice(0, -1))}</h2>`); // Remove colon
                continue;
            }
        }
        
        // Format as paragraph
        output.push(`<p>${formatInlineMarkdown(escapeHtml(line))}</p>`);
    }
    
    return output.join('\n');
}

// Estimated generation times (in seconds) - based on typical API response times
const ESTIMATED_TIMES = {
    hypothesis: 15, // ~15 seconds for hypothesis generation
    scope: 20,      // ~20 seconds for scope generation
    quickScope: 25  // ~25 seconds for quick scope (combined generation)
};

// DOM elements
const ideaInput = document.getElementById('idea-input');
const generateHypothesisBtn = document.getElementById('generate-hypothesis-btn');
const hypothesisSection = document.getElementById('hypothesis-section');
const hypothesisOutput = document.getElementById('hypothesis-output');
const hypothesisOutputEdit = document.getElementById('hypothesis-output-edit');
const copyHypothesisBtn = document.getElementById('copy-hypothesis-btn');
const editHypothesisBtn = document.getElementById('edit-hypothesis-btn');
const saveHypothesisBtn = document.getElementById('save-hypothesis-btn');
const cancelEditHypothesisBtn = document.getElementById('cancel-edit-hypothesis-btn');
const generateScopeBtn = document.getElementById('generate-scope-btn');
const scopeSection = document.getElementById('scope-section');
const scopeOutput = document.getElementById('scope-output');
const copyScopeBtn = document.getElementById('copy-scope-btn');
const hypothesisLoading = document.getElementById('hypothesis-loading');
const scopeLoading = document.getElementById('scope-loading');
const errorMessage = document.getElementById('error-message');
const successNotification = document.getElementById('success-notification');

// Quick Scope elements
const quickScopeBtn = document.getElementById('quick-scope-btn');
const quickScopeSection = document.getElementById('quick-scope-section');
const quickScopeOutput = document.getElementById('quick-scope-output');
const copyQuickScopeBtn = document.getElementById('copy-quick-scope-btn');
const quickScopeLoading = document.getElementById('quick-scope-loading');
const quickScopeProgressBar = document.getElementById('quick-scope-progress-bar');
const quickScopeTimeElapsed = document.getElementById('quick-scope-time-elapsed');
const quickScopeTimeEstimate = document.getElementById('quick-scope-time-estimate');

// Confluence Export elements
const exportHypothesisConfluenceBtn = document.getElementById('export-hypothesis-confluence-btn');
const exportScopeConfluenceBtn = document.getElementById('export-scope-confluence-btn');
const exportQuickScopeConfluenceBtn = document.getElementById('export-quick-scope-confluence-btn');
const confluenceModal = document.getElementById('confluence-modal');
const closeConfluenceModal = document.getElementById('close-confluence-modal');
const confluenceCancelBtn = document.getElementById('confluence-cancel-btn');
const confluenceExportBtn = document.getElementById('confluence-export-btn');
const confluenceStatus = document.getElementById('confluence-status');
const confluencePageTitle = document.getElementById('confluence-page-title');
const confluenceParentId = document.getElementById('confluence-parent-id');

// Store current content to export (set when export button is clicked)
let currentContentToExport = '';
let currentExportType = ''; // 'hypothesis', 'scope', or 'quickScope'

// Advanced Mode elements
const advancedModeBtn = document.getElementById('advanced-mode-btn');
const advancedModal = document.getElementById('advanced-modal');
const closeAdvancedModal = document.getElementById('close-advanced-modal');
const generateFromAdvancedBtn = document.getElementById('generate-from-advanced-btn');
const advancedChatMessages = document.getElementById('advanced-chat-messages');
const advancedChatInput = document.getElementById('advanced-chat-input');
const advancedSendBtn = document.getElementById('advanced-send-btn');

// Store conversation history for advanced mode
let advancedConversationHistory = [];

// Progress bar elements
const hypothesisProgressBar = document.getElementById('hypothesis-progress-bar');
const hypothesisTimeElapsed = document.getElementById('hypothesis-time-elapsed');
const hypothesisTimeEstimate = document.getElementById('hypothesis-time-estimate');

const scopeProgressBar = document.getElementById('scope-progress-bar');
const scopeTimeElapsed = document.getElementById('scope-time-elapsed');
const scopeTimeEstimate = document.getElementById('scope-time-estimate');

// Progress bar helper functions
function startProgress(type, estimatedTime) {
    startTime = Date.now();
    let progressBar, timeElapsed, timeEstimate;
    
    // Get the right elements based on type
    if (type === 'hypothesis') {
        progressBar = hypothesisProgressBar;
        timeElapsed = hypothesisTimeElapsed;
        timeEstimate = hypothesisTimeEstimate;
    } else if (type === 'scope') {
        progressBar = scopeProgressBar;
        timeElapsed = scopeTimeElapsed;
        timeEstimate = scopeTimeEstimate;
    } else if (type === 'quickScope') {
        progressBar = quickScopeProgressBar;
        timeElapsed = quickScopeTimeElapsed;
        timeEstimate = quickScopeTimeEstimate;
    }
    
    // Reset progress bar
    progressBar.style.width = '0%';
    
    // Update progress and time estimates
    progressInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000; // seconds
        const progress = Math.min((elapsed / estimatedTime) * 100, 95); // Cap at 95% until complete
        
        // Update progress bar
        progressBar.style.width = progress + '%';
        
        // Update time display
        const elapsedSec = Math.floor(elapsed);
        timeElapsed.textContent = elapsedSec + 's';
        
        // Estimate remaining time
        if (elapsed < estimatedTime) {
            const remaining = Math.ceil(estimatedTime - elapsed);
            timeEstimate.textContent = `(~${remaining}s remaining)`;
        } else {
            timeEstimate.textContent = '(almost done...)';
        }
    }, 100); // Update every 100ms
}

function stopProgress() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    
    // Set progress to 100% when done
    if (hypothesisProgressBar) hypothesisProgressBar.style.width = '100%';
    if (scopeProgressBar) scopeProgressBar.style.width = '100%';
    if (quickScopeProgressBar) quickScopeProgressBar.style.width = '100%';
    
    startTime = null;
}

// Generate hypothesis from idea
generateHypothesisBtn.addEventListener('click', async () => {
    const idea = ideaInput.value.trim();
    
    // Validate input
    if (!idea) {
        showError('Please enter an idea before generating a hypothesis.');
        return;
    }
    
    // Store original idea for later use
    originalIdea = idea;
    
    // Show loading state with progress
    generateHypothesisBtn.disabled = true;
    hypothesisLoading.style.display = 'block';
    hideError();
    hypothesisSection.style.display = 'none';
    
    // Start progress tracking
    startProgress('hypothesis', ESTIMATED_TIMES.hypothesis);
    
    try {
        // Prepare output area
        hypothesisOutput.innerHTML = '';
        rawHypothesisContent = ''; // Reset raw content
        hypothesisSection.style.display = 'block';
        
        // Scroll to hypothesis section
        hypothesisSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Call API with streaming
        const response = await fetch('/api/generate-hypothesis', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ idea })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate hypothesis');
        }
        
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        
                        if (data.error) {
                            throw new Error(data.error);
                        }
                        
                        if (data.content) {
                            fullText += data.content;
                            rawHypothesisContent = fullText; // Store raw markdown for export
                            // Check if user is near bottom before scrolling (within 50px)
                            const isNearBottom = hypothesisOutput.scrollHeight - hypothesisOutput.scrollTop - hypothesisOutput.clientHeight < 50;
                            
                            // Display formatted HTML (rendered from markdown)
                            hypothesisOutput.innerHTML = markdownToHtml(fullText);
                            
                            // Only auto-scroll if user was near bottom
                            if (isNearBottom) {
                                // Use requestAnimationFrame for smoother scrolling
                                requestAnimationFrame(() => {
                                    hypothesisOutput.scrollTop = hypothesisOutput.scrollHeight;
                                });
                            }
                        }
                        
                        if (data.done) {
                            // Stop progress and complete
                            stopProgress();
                            generateHypothesisBtn.disabled = false;
                            
                            setTimeout(() => {
                                hypothesisLoading.style.display = 'none';
                            }, 500);
                            return;
                        }
                    } catch (e) {
                        // Skip invalid JSON lines
                    }
                }
            }
        }
        
    } catch (error) {
        stopProgress();
        showError(`Error: ${error.message}`);
        generateHypothesisBtn.disabled = false;
        hypothesisLoading.style.display = 'none';
    }
});

// Generate scope from hypothesis
generateScopeBtn.addEventListener('click', async () => {
    // Use edited content if available, otherwise use raw or extract from display
    // If we're in edit mode, use the textarea content
    const hypothesis = hypothesisOutputEdit.style.display !== 'none' 
        ? hypothesisOutputEdit.value.trim()
        : rawHypothesisContent || hypothesisOutput.textContent.trim();
    
    if (!hypothesis) {
        showError('Please generate a hypothesis first.');
        return;
    }
    
    // Show loading state with progress
    generateScopeBtn.disabled = true;
    scopeLoading.style.display = 'block';
    hideError();
    scopeSection.style.display = 'none';
    
    // Start progress tracking
    startProgress('scope', ESTIMATED_TIMES.scope);
    
    try {
        // Prepare output area
        scopeOutput.innerHTML = '';
        rawScopeContent = ''; // Reset raw content
        scopeSection.style.display = 'block';
        
        // Scroll to scope section
        scopeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Call API with streaming
        const response = await fetch('/api/generate-scope', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                hypothesis,
                idea: originalIdea 
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate scope');
        }
        
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        
                        if (data.error) {
                            throw new Error(data.error);
                        }
                        
                        if (data.content) {
                            fullText += data.content;
                            rawScopeContent = fullText; // Store raw markdown
                            
                            // Check if user is near bottom before scrolling (within 50px)
                            const isNearBottom = scopeOutput.scrollHeight - scopeOutput.scrollTop - scopeOutput.clientHeight < 50;
                            
                            // Display formatted HTML (rendered from markdown)
                            scopeOutput.innerHTML = markdownToHtml(fullText);
                            
                            // Only auto-scroll if user was near bottom
                            if (isNearBottom) {
                                // Use requestAnimationFrame for smoother scrolling
                                requestAnimationFrame(() => {
                                    scopeOutput.scrollTop = scopeOutput.scrollHeight;
                                });
                            }
                        }
                        
                        if (data.done) {
                            // Stop progress and complete
                            stopProgress();
                            generateScopeBtn.disabled = false;
                            setTimeout(() => {
                                scopeLoading.style.display = 'none';
                            }, 500);
                            return;
                        }
                    } catch (e) {
                        // Skip invalid JSON lines
                    }
                }
            }
        }
        
    } catch (error) {
        stopProgress();
        showError(`Error: ${error.message}`);
        generateScopeBtn.disabled = false;
        scopeLoading.style.display = 'none';
    }
});

// Edit hypothesis functionality
// Store original content and switch to edit mode
editHypothesisBtn.addEventListener('click', () => {
    // Get the current content (raw markdown if available, otherwise extract from HTML)
    const currentContent = rawHypothesisContent || hypothesisOutput.textContent.trim();
    
    if (!currentContent) {
        showError('No hypothesis to edit.');
        return;
    }
    
    // Store original content for cancel functionality
    originalHypothesisContent = currentContent;
    
    // Switch to edit mode
    hypothesisOutput.style.display = 'none';
    hypothesisOutputEdit.style.display = 'block';
    hypothesisOutputEdit.value = currentContent;
    hypothesisOutputEdit.focus();
    
    // Update button visibility
    editHypothesisBtn.style.display = 'none';
    saveHypothesisBtn.style.display = 'inline-flex';
    cancelEditHypothesisBtn.style.display = 'inline-flex';
});

// Save edited hypothesis
saveHypothesisBtn.addEventListener('click', () => {
    const editedContent = hypothesisOutputEdit.value.trim();
    
    if (!editedContent) {
        showError('Cannot save empty hypothesis.');
        return;
    }
    
    // Update raw content with edited version
    rawHypothesisContent = editedContent;
    
    // Update display with formatted HTML
    hypothesisOutput.innerHTML = markdownToHtml(editedContent);
    
    // Switch back to display mode
    hypothesisOutput.style.display = 'block';
    hypothesisOutputEdit.style.display = 'none';
    
    // Update button visibility
    editHypothesisBtn.style.display = 'inline-flex';
    saveHypothesisBtn.style.display = 'none';
    cancelEditHypothesisBtn.style.display = 'none';
    
    // Clear original content (changes are saved)
    originalHypothesisContent = '';
});

// Cancel editing and restore original
cancelEditHypothesisBtn.addEventListener('click', () => {
    // Restore original content
    if (originalHypothesisContent) {
        rawHypothesisContent = originalHypothesisContent;
        hypothesisOutput.innerHTML = markdownToHtml(originalHypothesisContent);
    }
    
    // Switch back to display mode
    hypothesisOutput.style.display = 'block';
    hypothesisOutputEdit.style.display = 'none';
    
    // Update button visibility
    editHypothesisBtn.style.display = 'inline-flex';
    saveHypothesisBtn.style.display = 'none';
    cancelEditHypothesisBtn.style.display = 'none';
    
    // Clear original content
    originalHypothesisContent = '';
});

// Copy hypothesis to clipboard
copyHypothesisBtn.addEventListener('click', async () => {
    const text = hypothesisOutput.textContent;
    
    if (!text) {
        showError('No hypothesis to copy.');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(text);
        showSuccess();
    } catch (error) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showSuccess();
    }
});

// Copy scope to clipboard
copyScopeBtn.addEventListener('click', async () => {
    const text = scopeOutput.textContent;
    
    if (!text) {
        showError('No scope to copy.');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(text);
        showSuccess();
    } catch (error) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showSuccess();
    }
});

// Copy quick scope to clipboard
copyQuickScopeBtn.addEventListener('click', async () => {
    const text = quickScopeOutput.textContent;
    
    if (!text) {
        showError('No quick scope to copy.');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(text);
        showSuccess();
    } catch (error) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showSuccess();
    }
});

// Confluence Export handlers
// Open Confluence modal and store content to export
exportHypothesisConfluenceBtn.addEventListener('click', () => {
    // Use edited content if available, otherwise use raw or extract from display
    // If we're in edit mode, use the textarea content
    const text = hypothesisOutputEdit.style.display !== 'none' 
        ? hypothesisOutputEdit.value.trim()
        : rawHypothesisContent || hypothesisOutput.textContent.trim();
    
    if (!text) {
        showError('No hypothesis to export.');
        return;
    }
    currentContentToExport = text; // Use raw markdown for export (or edited version)
    currentExportType = 'hypothesis';
    openConfluenceModal();
});

exportScopeConfluenceBtn.addEventListener('click', () => {
    const text = rawScopeContent || scopeOutput.textContent.trim();
    if (!text) {
        showError('No scope to export.');
        return;
    }
    currentContentToExport = text; // Use raw markdown for export
    currentExportType = 'scope';
    openConfluenceModal();
});

exportQuickScopeConfluenceBtn.addEventListener('click', () => {
    const text = rawQuickScopeContent || quickScopeOutput.textContent.trim();
    if (!text) {
        showError('No quick scope to export.');
        return;
    }
    currentContentToExport = text; // Use raw content for export (will be formatted by server)
    currentExportType = 'quickScope';
    openConfluenceModal();
});

// Open Confluence modal function
async function openConfluenceModal() {
    // Clear parent ID
    confluenceParentId.value = '';
    
    // Hide any previous status messages
    confluenceStatus.style.display = 'none';
    
    // Show modal first (so user sees it immediately)
    confluenceModal.style.display = 'flex';
    confluenceModal.classList.add('show');
    
    // Set a placeholder title while generating
    confluencePageTitle.value = 'Generating title...';
    
    // Auto-generate title using AI - runs automatically when modal opens
    await generateConfluenceTitle();
}

// Close Confluence modal function
function closeConfluenceModalFunc() {
    confluenceModal.style.display = 'none';
    confluenceModal.classList.remove('show');
    confluenceStatus.style.display = 'none';
}

// Generate title function - uses AI to create a short, usable title
// Runs automatically when modal opens
async function generateConfluenceTitle() {
    // Validate that we have content to generate a title from
    if (!currentContentToExport || currentContentToExport.trim().length === 0) {
        console.error('No content available to generate title. Content length:', currentContentToExport?.length || 0);
        const defaultTitle = currentExportType === 'hypothesis' 
            ? 'Hypothesis: ' + (ideaInput.value.trim().substring(0, 50) || 'New Hypothesis')
            : currentExportType === 'scope'
            ? 'Scope: ' + (ideaInput.value.trim().substring(0, 50) || 'New Scope')
            : 'Quick Scope: ' + (ideaInput.value.trim().substring(0, 50) || 'New Quick Scope');
        confluencePageTitle.value = defaultTitle;
        return;
    }
    
    // Keep showing "Generating title..." while we fetch
    confluencePageTitle.value = 'Generating title...';
    
    try {
        console.log('Generating title for content type:', currentExportType, 'Content length:', currentContentToExport.length);
        
        const response = await fetch('/api/generate-title', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: currentContentToExport,
                contentType: currentExportType === 'hypothesis' ? 'hypothesis' : currentExportType === 'scope' ? 'scope' : 'quick scope'
            })
        });
        
        console.log('Title generation response status:', response.status);
        
        // Check if response is ok before parsing
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Title generation failed with status:', response.status, 'Error:', errorText);
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { error: errorText || `HTTP ${response.status}` };
            }
            throw new Error(errorData.error || 'Failed to generate title');
        }
        
        const data = await response.json();
        console.log('Title generation response data:', data);
        
        // Validate that we got a title
        if (!data || !data.title || data.title.trim().length === 0) {
            console.error('Empty title received from server');
            throw new Error('Empty title received from server');
        }
        
        // Set the generated title
        confluencePageTitle.value = data.title.trim();
        console.log('Title generated successfully:', data.title.trim());
        
    } catch (error) {
        console.error('Error generating title:', error);
        // If generation fails, use a simple default based on content type
        const defaultTitle = currentExportType === 'hypothesis' 
            ? 'Hypothesis: ' + (ideaInput.value.trim().substring(0, 50) || 'New Hypothesis')
            : currentExportType === 'scope'
            ? 'Scope: ' + (ideaInput.value.trim().substring(0, 50) || 'New Scope')
            : 'Quick Scope: ' + (ideaInput.value.trim().substring(0, 50) || 'New Quick Scope');
        confluencePageTitle.value = defaultTitle;
        console.log('Using default title:', defaultTitle);
    }
}

// Close modal handlers
closeConfluenceModal.addEventListener('click', closeConfluenceModalFunc);
confluenceCancelBtn.addEventListener('click', closeConfluenceModalFunc);

// Export to Confluence handler
confluenceExportBtn.addEventListener('click', async () => {
    // Validate page title (only required field now)
    const pageTitle = confluencePageTitle.value.trim();
    
    if (!pageTitle) {
        showConfluenceStatus('Please enter a page title.', 'error');
        return;
    }
    
    // Show loading state
    confluenceExportBtn.disabled = true;
    confluenceExportBtn.textContent = 'Exporting...';
    showConfluenceStatus('Exporting to Confluence...', 'success');
    
    try {
        // Use hardcoded credentials - no need to send from client
        const response = await fetch('/api/export-to-confluence', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // Credentials are hardcoded on server, only send content and metadata
                pageTitle,
                parentId: confluenceParentId.value.trim() || null,
                content: currentContentToExport
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to export to Confluence');
        }
        
        // Success
        showConfluenceStatus(`Successfully exported to Confluence! Page ID: ${data.pageId}. <a href="${data.url}" target="_blank">View page</a>`, 'success');
        
        // Close modal after 3 seconds
        setTimeout(() => {
            closeConfluenceModalFunc();
        }, 3000);
        
    } catch (error) {
        showConfluenceStatus(`Error: ${error.message}`, 'error');
    } finally {
        confluenceExportBtn.disabled = false;
        confluenceExportBtn.textContent = 'Export to Confluence';
    }
});

// Show status message in Confluence modal
function showConfluenceStatus(message, type) {
    confluenceStatus.textContent = '';
    confluenceStatus.innerHTML = message;
    confluenceStatus.className = `confluence-status ${type}`;
    confluenceStatus.style.display = 'block';
    confluenceStatus.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Quick Scope - Generate both hypothesis and scope at once
quickScopeBtn.addEventListener('click', async () => {
    const idea = ideaInput.value.trim();
    
    // Validate input
    if (!idea) {
        showError('Please enter an idea before generating quick scope.');
        return;
    }
    
    // Store original idea
    originalIdea = idea;
    
    // Show loading state with progress
    quickScopeBtn.disabled = true;
    quickScopeLoading.style.display = 'block';
    hideError();
    quickScopeSection.style.display = 'none';
    hypothesisSection.style.display = 'none';
    scopeSection.style.display = 'none';
    
    // Start progress tracking
    startProgress('quickScope', ESTIMATED_TIMES.quickScope);
    
    try {
        // Prepare output area
        quickScopeOutput.innerHTML = '';
        rawQuickScopeContent = ''; // Reset raw content
        quickScopeSection.style.display = 'block';
        
        // Scroll to quick scope section
        quickScopeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Call API with streaming
        const response = await fetch('/api/quick-scope', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ idea })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate quick scope');
        }
        
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        
                        if (data.error) {
                            throw new Error(data.error);
                        }
                        
                        if (data.content) {
                            fullText += data.content;
                            rawQuickScopeContent = fullText; // Store raw content
                            
                            // Check if user is near bottom before scrolling (within 50px)
                            const isNearBottom = quickScopeOutput.scrollHeight - quickScopeOutput.scrollTop - quickScopeOutput.clientHeight < 50;
                            
                            // For Quick Scope, detect plain text headings and format them
                            // If it has markdown headers, render them. Otherwise, display as-is with basic formatting
                            const formattedContent = fullText.includes('##') || fullText.includes('###') 
                                ? markdownToHtml(fullText) 
                                : formatPlainTextWithHeadings(fullText);
                            quickScopeOutput.innerHTML = formattedContent;
                            
                            // Only auto-scroll if user was near bottom
                            if (isNearBottom) {
                                // Use requestAnimationFrame for smoother scrolling
                                requestAnimationFrame(() => {
                                    quickScopeOutput.scrollTop = quickScopeOutput.scrollHeight;
                                });
                            }
                        }
                        
                        if (data.done) {
                            // Stop progress and complete
                            stopProgress();
                            quickScopeBtn.disabled = false;
                            
                            setTimeout(() => {
                                quickScopeLoading.style.display = 'none';
                            }, 500);
                            return;
                        }
                    } catch (e) {
                        // Skip invalid JSON lines
                    }
                }
            }
        }
        
    } catch (error) {
        stopProgress();
        showError(`Error: ${error.message}`);
        quickScopeBtn.disabled = false;
        quickScopeLoading.style.display = 'none';
    }
});

// Utility functions
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function hideError() {
    errorMessage.style.display = 'none';
}

function showSuccess() {
    successNotification.style.display = 'block';
    setTimeout(() => {
        successNotification.style.display = 'none';
    }, 2000);
}

// Allow Enter key to submit (Ctrl/Cmd + Enter for newline)
ideaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        generateHypothesisBtn.click();
    }
});

// Advanced Mode functionality
advancedModeBtn.addEventListener('click', () => {
    openAdvancedModal();
});

closeAdvancedModal.addEventListener('click', () => {
    closeAdvancedModalFunc();
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && advancedModal.style.display !== 'none') {
        closeAdvancedModalFunc();
    }
});

function openAdvancedModal() {
    advancedModal.style.display = 'flex';
    advancedModal.classList.add('show');
    advancedChatInput.focus();
    
    // Reset conversation history
    advancedConversationHistory = [];
    advancedChatMessages.innerHTML = '';
    generateFromAdvancedBtn.disabled = true;
    
    // Add welcome message from assistant
    addAdvancedWelcomeMessage();
}

function closeAdvancedModalFunc() {
    advancedModal.style.display = 'none';
    advancedModal.classList.remove('show');
    advancedChatInput.value = '';
    advancedConversationHistory = [];
}

function addAdvancedWelcomeMessage() {
    const welcomeMessage = `Share your product idea, feature, or system.

I'll challenge assumptions, identify constraints, and push for clarity on:
- The problem you're solving
- Who your users are
- What success and failure look like
- What you're not building

Be direct. I'll be direct back.

When you have enough context, I'll tell you. Then generate the hypothesis.`;
    
    addAdvancedMessage('assistant', welcomeMessage);
}

function addAdvancedMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `advanced-chat-message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'advanced-message-avatar';
    avatar.textContent = role === 'user' ? 'U' : 'AI';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'advanced-message-content';
    messageContent.textContent = content;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(messageContent);
    advancedChatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    advancedChatMessages.scrollTop = advancedChatMessages.scrollHeight;
    
    // Store in conversation history
    advancedConversationHistory.push({ role, content });
    
    // Enable generate button if we have at least one user message
    const hasUserMessage = advancedConversationHistory.some(msg => msg.role === 'user');
    generateFromAdvancedBtn.disabled = !hasUserMessage;
}

// Send message in advanced mode
advancedSendBtn.addEventListener('click', sendAdvancedMessage);

advancedChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAdvancedMessage();
    }
});

async function sendAdvancedMessage() {
    const message = advancedChatInput.value.trim();
    
    if (!message) {
        return;
    }
    
    // Disable input while sending
    advancedChatInput.disabled = true;
    advancedSendBtn.disabled = true;
    
    // Add user message to chat
    addAdvancedMessage('user', message);
    
    // Clear input
    advancedChatInput.value = '';
    
    // Add loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'advanced-chat-message assistant';
    loadingDiv.id = 'advanced-loading';
    const loadingAvatar = document.createElement('div');
    loadingAvatar.className = 'advanced-message-avatar';
    loadingAvatar.textContent = 'AI';
    const loadingContent = document.createElement('div');
    loadingContent.className = 'advanced-message-content';
    loadingContent.textContent = 'Thinking...';
    loadingDiv.appendChild(loadingAvatar);
    loadingDiv.appendChild(loadingContent);
    advancedChatMessages.appendChild(loadingDiv);
    advancedChatMessages.scrollTop = advancedChatMessages.scrollHeight;
    
    try {
        // Call API to get assistant response
        const response = await fetch('/api/advanced-conversation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                conversation: advancedConversationHistory
            })
        });
        
        if (!response.ok) {
            let errorMsg = 'Failed to get response';
            try {
                const errorText = await response.text();
                if (errorText) {
                    try {
                        const errorData = JSON.parse(errorText);
                        errorMsg = errorData.error || errorMsg;
                    } catch (e) {
                        errorMsg = errorText || errorMsg;
                    }
                } else {
                    errorMsg = `Server error: ${response.status} ${response.statusText}`;
                }
            } catch (e) {
                errorMsg = `Server error: ${response.status} ${response.statusText}`;
            }
            throw new Error(errorMsg);
        }
        
        // Remove loading indicator
        loadingDiv.remove();
        
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';
        
        // Create assistant message div
        const assistantDiv = document.createElement('div');
        assistantDiv.className = 'advanced-chat-message assistant';
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'advanced-message-avatar';
        avatarDiv.textContent = 'AI';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'advanced-message-content';
        assistantDiv.appendChild(avatarDiv);
        assistantDiv.appendChild(contentDiv);
        advancedChatMessages.appendChild(assistantDiv);
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        
                        if (data.error) {
                            throw new Error(data.error);
                        }
                        
                        if (data.content) {
                            fullResponse += data.content;
                            contentDiv.textContent = fullResponse;
                            advancedChatMessages.scrollTop = advancedChatMessages.scrollHeight;
                        }
                        
                        if (data.done) {
                            // Add to conversation history
                            advancedConversationHistory.push({ role: 'assistant', content: fullResponse });
                            return;
                        }
                    } catch (e) {
                        // Skip invalid JSON lines
                    }
                }
            }
        }
        
    } catch (error) {
        // Remove loading indicator if still present
        const loadingEl = document.getElementById('advanced-loading');
        if (loadingEl) {
            loadingEl.remove();
        }
        
        // Show error message
        addAdvancedMessage('assistant', `Sorry, I encountered an error: ${error.message}`);
    } finally {
        // Re-enable input
        advancedChatInput.disabled = false;
        advancedSendBtn.disabled = false;
        advancedChatInput.focus();
    }
}

// Generate hypothesis from advanced conversation
generateFromAdvancedBtn.addEventListener('click', async () => {
    if (advancedConversationHistory.length === 0) {
        return;
    }
    
    // Store conversation history BEFORE closing modal (since closeAdvancedModalFunc clears it)
    const conversationToUse = [...advancedConversationHistory];
    
    // Close modal
    closeAdvancedModalFunc();
    
    // Show loading state
    generateHypothesisBtn.disabled = true;
    hypothesisLoading.style.display = 'block';
    hideError();
    hypothesisSection.style.display = 'none';
    
    // Start progress tracking
    startProgress('hypothesis', ESTIMATED_TIMES.hypothesis);
    
    try {
        // Prepare output area
        hypothesisOutput.textContent = '';
        hypothesisSection.style.display = 'block';
        
        // Scroll to hypothesis section
        hypothesisSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Call API with conversation history (using the stored copy)
        const response = await fetch('/api/generate-hypothesis-advanced', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                conversation: conversationToUse
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate hypothesis');
        }
        
        // Store conversation as original idea for scope generation (using the stored copy)
        originalIdea = conversationToUse.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n\n');
        
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        
                        if (data.error) {
                            throw new Error(data.error);
                        }
                        
                        if (data.content) {
                            fullText += data.content;
                            rawHypothesisContent = fullText; // Store raw markdown for export
                            // Check if user is near bottom before scrolling (within 50px)
                            const isNearBottom = hypothesisOutput.scrollHeight - hypothesisOutput.scrollTop - hypothesisOutput.clientHeight < 50;
                            
                            // Display formatted HTML (rendered from markdown)
                            hypothesisOutput.innerHTML = markdownToHtml(fullText);
                            
                            // Only auto-scroll if user was near bottom
                            if (isNearBottom) {
                                // Use requestAnimationFrame for smoother scrolling
                                requestAnimationFrame(() => {
                                    hypothesisOutput.scrollTop = hypothesisOutput.scrollHeight;
                                });
                            }
                        }
                        
                        if (data.done) {
                            // Stop progress and complete
                            stopProgress();
                            generateFromAdvancedBtn.disabled = false;
                            
                            setTimeout(() => {
                                hypothesisLoading.style.display = 'none';
                            }, 500);
                            return;
                        }
                    } catch (e) {
                        // Skip invalid JSON lines
                    }
                }
            }
        }
        
    } catch (error) {
        stopProgress();
        showError(`Error: ${error.message}`);
        generateFromAdvancedBtn.disabled = false;
        hypothesisLoading.style.display = 'none';
    }
});

