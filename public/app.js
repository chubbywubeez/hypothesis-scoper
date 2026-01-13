// Frontend JavaScript for Hypothesis Scoper
// Handles user interactions, API calls, and clipboard operations

// Authentication state
let currentUser = null;
let authToken = null;
let userRole = null;
let subscriptionStatus = null; // 'active', 'inactive', or null
let hasAdvancedAccess = false; // Cached access status

// Check if token is expired or about to expire (within 5 minutes)
function isTokenExpired() {
    const expiresAt = localStorage.getItem('tokenExpiresAt');
    if (!expiresAt) return true; // No expiration info, assume expired
    
    // Convert expires_at (seconds since epoch) to milliseconds
    const expirationTime = parseInt(expiresAt) * 1000;
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    // Return true if expired or expires within 5 minutes
    return (expirationTime - now) < fiveMinutes;
}

// Refresh the access token using the refresh token
async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    
    if (!refreshToken) {
        // No refresh token, user needs to login again
        return false;
    }
    
    try {
        const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token: refreshToken })
        });
        
        if (!response.ok) {
            // Refresh failed, clear tokens and return false
            localStorage.removeItem('authToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('tokenExpiresAt');
            return false;
        }
        
        const data = await response.json();
        
        // Update stored tokens
        localStorage.setItem('authToken', data.access_token);
        if (data.refresh_token) {
            localStorage.setItem('refreshToken', data.refresh_token);
        }
        if (data.expires_at) {
            localStorage.setItem('tokenExpiresAt', data.expires_at);
        }
        
        // Update global auth state
        authToken = data.access_token;
        currentUser = data.user;
        userRole = data.user.role;
        
        return true;
    } catch (error) {
        console.error('Token refresh error:', error);
        // Clear tokens on error
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('tokenExpiresAt');
        return false;
    }
}

// Get a valid access token, refreshing if necessary
async function getValidToken() {
    let token = localStorage.getItem('authToken');
    
    // Check if token is expired or about to expire
    if (isTokenExpired()) {
        console.log('Token expired or expiring soon, refreshing...');
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
            // Refresh failed, redirect to login
            window.location.href = '/login.html';
            return null;
        }
        token = localStorage.getItem('authToken');
    }
    
    return token;
}

// Check authentication on page load - redirect to login if not authenticated
async function checkAuthOnLoad() {
    const savedToken = localStorage.getItem('authToken');
    
    if (!savedToken) {
        // No token, redirect to login
        window.location.href = '/login.html';
        return;
    }
    
    // Check if token needs refresh
    if (isTokenExpired()) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
            // Refresh failed, redirect to login
            window.location.href = '/login.html';
            return;
        }
    }
    
    // Set token and verify it's still valid
    authToken = savedToken;
    const isValid = await checkAuth(authToken);
    if (!isValid) {
        // Token invalid, try refreshing once more
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
            // Refresh failed, redirect to login
            authToken = null;
            localStorage.removeItem('authToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('tokenExpiresAt');
            window.location.href = '/login.html';
            return;
        }
        // Retry auth check with new token
        authToken = localStorage.getItem('authToken');
        const retryValid = await checkAuth(authToken);
        if (!retryValid) {
            window.location.href = '/login.html';
            return;
        }
    }
    
    // Token is valid, initialize UI
    updateUIForAuth();
    
    // Check subscription status after auth
    await checkSubscriptionStatus();
    
    // Check if user just returned from Stripe checkout
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const canceled = urlParams.get('canceled');
    
    if (sessionId) {
        // User completed payment, check subscription status
        console.log('User returned from Stripe checkout, checking subscription status...');
        // Wait a moment for webhook to process
        setTimeout(async () => {
            await checkSubscriptionStatus();
            // Remove session_id from URL
            window.history.replaceState({}, document.title, window.location.pathname);
            if (hasAdvancedAccess) {
                showSuccess('Payment successful! You now have access to Advanced Mode.');
            }
        }, 2000); // Wait 2 seconds for webhook to process
    } else if (canceled) {
        // User canceled payment
        showError('Payment was canceled.');
        // Remove canceled parameter from URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// Check authentication when page loads
checkAuthOnLoad();

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

// Auth elements
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userEmail = document.getElementById('user-email');
const myScopesModal = document.getElementById('my-scopes-modal');
const closeScopesModal = document.getElementById('close-scopes-modal');
const closeScopesModalBtn = document.getElementById('close-scopes-modal-btn');
const scopesList = document.getElementById('scopes-list');
const myScopesBtn = document.getElementById('my-scopes-btn');
const scopesSearch = document.getElementById('scopes-search');

// Store current content to export (set when export button is clicked)
let currentContentToExport = '';
let currentExportType = ''; // 'hypothesis', 'scope', or 'quickScope'
let isLoginMode = true; // Toggle between login and signup
let allScopesData = []; // Store all scopes for search filtering

// Advanced Mode elements
const advancedModeBtn = document.getElementById('advanced-mode-btn');
const advancedModal = document.getElementById('advanced-modal');
const closeAdvancedModal = document.getElementById('close-advanced-modal');
const generateFromAdvancedBtn = document.getElementById('generate-from-advanced-btn');
const advancedChatMessages = document.getElementById('advanced-chat-messages');
const advancedChatInput = document.getElementById('advanced-chat-input');
const advancedSendBtn = document.getElementById('advanced-send-btn');

// Payment Modal elements
const paymentModal = document.getElementById('payment-modal');
const closePaymentModal = document.getElementById('close-payment-modal');
const paymentCancelBtn = document.getElementById('payment-cancel-btn');
const paymentUpgradeBtn = document.getElementById('payment-upgrade-btn');

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
    
    // Disable save button during generation
    setSaveButtonsState(true, 'hypothesis');
    
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
                            
                            // Enable save button after generation completes
                            setSaveButtonsState(false, 'hypothesis');
                            
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
        setSaveButtonsState(false, 'hypothesis'); // Re-enable on error
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
    
    // Disable save button during generation
    setSaveButtonsState(true, 'scope');
    
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
                            
                            // Enable save button after generation completes
                            setSaveButtonsState(false, 'scope');
                            
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
        setSaveButtonsState(false, 'scope'); // Re-enable on error
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

// Confluence Export / Save handlers
// Route based on user role: internal users export to Confluence, customers save to their scopes
exportHypothesisConfluenceBtn.addEventListener('click', async () => {
    // Use edited content if available, otherwise use raw or extract from display
    // If we're in edit mode, use the textarea content
    const text = hypothesisOutputEdit.style.display !== 'none' 
        ? hypothesisOutputEdit.value.trim()
        : rawHypothesisContent || hypothesisOutput.textContent.trim();
    
    if (!text) {
        showError('No hypothesis to export.');
        return;
    }
    
    // Check user role - internal users export to Confluence, customers save
    if (userRole === 'internal') {
        currentContentToExport = text; // Use raw markdown for export (or edited version)
        currentExportType = 'hypothesis';
        openConfluenceModal();
    } else {
        // Customer: save to their scopes
        await saveScope(null, text, 'hypothesis');
    }
});

exportScopeConfluenceBtn.addEventListener('click', async () => {
    const text = rawScopeContent || scopeOutput.textContent.trim();
    if (!text) {
        showError('No scope to export.');
        return;
    }
    
    // Check user role - internal users export to Confluence, customers save
    if (userRole === 'internal') {
        currentContentToExport = text; // Use raw markdown for export
        currentExportType = 'scope';
        openConfluenceModal();
    } else {
        // Customer: save to their scopes
        await saveScope(null, text, 'scope');
    }
});

exportQuickScopeConfluenceBtn.addEventListener('click', async () => {
    const text = rawQuickScopeContent || quickScopeOutput.textContent.trim();
    if (!text) {
        showError('No quick scope to export.');
        return;
    }
    
    // Check user role - internal users export to Confluence, customers save
    if (userRole === 'internal') {
        currentContentToExport = text; // Use raw content for export (will be formatted by server)
        currentExportType = 'quickScope';
        openConfluenceModal();
    } else {
        // Customer: save to their scopes
        await saveScope(null, text, 'quick_scope');
    }
});

// Open Confluence modal function
async function openConfluenceModal() {
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
        // Get valid token (refresh if needed)
        const token = await getValidToken();
        if (!token) {
            showConfluenceStatus('Error: Session expired. Please login again.', 'error');
            return;
        }
        
        // Use hardcoded credentials - no need to send from client
        const response = await fetch('/api/export-to-confluence', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                // Credentials are hardcoded on server, only send content and metadata
                pageTitle,
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
    
    // Disable save button during generation
    setSaveButtonsState(true, 'quickScope');
    
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
                            
                            // Enable save button after generation completes
                            setSaveButtonsState(false, 'quickScope');
                            
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
        setSaveButtonsState(false, 'quickScope'); // Re-enable on error
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

function showSuccess(message) {
    if (successNotification) {
        successNotification.textContent = message || 'Success!';
        successNotification.style.display = 'block';
        setTimeout(() => {
            successNotification.style.display = 'none';
        }, 3000);
    }
}

// Allow Enter key to submit (Ctrl/Cmd + Enter for newline)
ideaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        generateHypothesisBtn.click();
    }
});

// Advanced Mode functionality
advancedModeBtn.addEventListener('click', async () => {
    // Check subscription status before opening
    if (!hasAdvancedAccess && userRole !== 'internal') {
        // Check subscription status
        await checkSubscriptionStatus();
        
        if (!hasAdvancedAccess && userRole !== 'internal') {
            // Show payment modal
            openPaymentModal();
            return;
        }
    }
    
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

// Payment Modal functions
function openPaymentModal() {
    if (paymentModal) {
        paymentModal.style.display = 'flex';
        paymentModal.classList.add('show');
    }
}

function closePaymentModalFunc() {
    if (paymentModal) {
        paymentModal.style.display = 'none';
        paymentModal.classList.remove('show');
    }
}

// Payment Modal event listeners
if (closePaymentModal) {
    closePaymentModal.addEventListener('click', closePaymentModalFunc);
}

if (paymentCancelBtn) {
    paymentCancelBtn.addEventListener('click', closePaymentModalFunc);
}

if (paymentUpgradeBtn) {
    paymentUpgradeBtn.addEventListener('click', () => {
        createCheckoutSession();
    });
}

// Close payment modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && paymentModal && paymentModal.style.display !== 'none') {
        closePaymentModalFunc();
    }
});

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
    
    // Get valid token (refresh if needed)
    const token = await getValidToken();
    if (!token) {
        showError('Session expired. Please login again.');
        closeAdvancedModalFunc();
        return;
    }
    
    try {
        // Call API to get assistant response
        const response = await fetch('/api/advanced-conversation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
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
    
    // Disable save button during generation
    setSaveButtonsState(true, 'hypothesis');
    
    // Start progress tracking
    startProgress('hypothesis', ESTIMATED_TIMES.hypothesis);
    
    try {
        // Prepare output area
        hypothesisOutput.textContent = '';
        hypothesisSection.style.display = 'block';
        
        // Scroll to hypothesis section
        hypothesisSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Get valid token (refresh if needed)
        const token = await getValidToken();
        if (!token) {
            showError('Session expired. Please login again.');
            return;
        }
        
        // Call API with conversation history (using the stored copy)
        const response = await fetch('/api/generate-hypothesis-advanced', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
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
                            
                            // Enable save button after generation completes
                            setSaveButtonsState(false, 'hypothesis');
                            
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
        setSaveButtonsState(false, 'hypothesis'); // Re-enable on error
        hypothesisLoading.style.display = 'none';
    }
});

// ============================================
// SUBSCRIPTION FUNCTIONS
// ============================================

// Check subscription status
async function checkSubscriptionStatus() {
    if (!authToken) {
        hasAdvancedAccess = false;
        return false;
    }
    
    // Get valid token (refresh if needed)
    const token = await getValidToken();
    if (!token) {
        hasAdvancedAccess = false;
        return false;
    }
    
    try {
        const response = await fetch('/api/subscription/status', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            hasAdvancedAccess = data.hasAccess;
            subscriptionStatus = data.subscriptionStatus;
            
            // Update UI based on access
            updateAdvancedModeButton();
            
            return hasAdvancedAccess;
        } else {
            hasAdvancedAccess = false;
            return false;
        }
    } catch (error) {
        console.error('Subscription check error:', error);
        hasAdvancedAccess = false;
        return false;
    }
}

// Update Advanced Mode button based on subscription status
function updateAdvancedModeButton() {
    if (advancedModeBtn) {
        if (hasAdvancedAccess || userRole === 'internal') {
            advancedModeBtn.textContent = 'Advanced Mode';
            advancedModeBtn.classList.remove('btn-locked');
        } else {
            advancedModeBtn.textContent = 'Advanced Mode 🔒';
            advancedModeBtn.classList.add('btn-locked');
        }
    }
}

// Create Stripe checkout session
async function createCheckoutSession() {
    // Get valid token (refresh if needed)
    const token = await getValidToken();
    if (!token) {
        showError('Session expired. Please login again.');
        return;
    }
    
    try {
        const response = await fetch('/api/stripe/create-checkout-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to create checkout session');
        }
        
        // Redirect to Stripe Checkout
        if (data.url) {
            window.location.href = data.url;
        }
    } catch (error) {
        console.error('Checkout error:', error);
        showError(error.message || 'Failed to start checkout. Please try again.');
    }
}

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================

// Check authentication status
async function checkAuth(token) {
    try {
        const response = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            userRole = data.user.role;
            updateUIForAuth();
            return true;
        } else {
            // Token invalid, try refreshing
            const refreshed = await refreshAccessToken();
            if (refreshed) {
                // Retry with new token
                const newToken = localStorage.getItem('authToken');
                const retryResponse = await fetch('/api/auth/me', {
                    headers: {
                        'Authorization': `Bearer ${newToken}`
                    }
                });
                if (retryResponse.ok) {
                    const retryData = await retryResponse.json();
                    currentUser = retryData.user;
                    userRole = retryData.user.role;
                    authToken = newToken;
                    updateUIForAuth();
                    return true;
                }
            }
            // Refresh failed or retry failed, clear tokens
            localStorage.removeItem('authToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('tokenExpiresAt');
            authToken = null;
            currentUser = null;
            userRole = null;
            updateUIForAuth();
            return false;
        }
    } catch (error) {
        console.error('Auth check error:', error);
        return false;
    }
}

// Helper functions to manage save/export button states
function setSaveButtonsState(disabled, type = null) {
    // type can be 'hypothesis', 'scope', 'quickScope', or null (all)
    const buttons = [];
    
    if (!type || type === 'hypothesis') {
        if (exportHypothesisConfluenceBtn) buttons.push(exportHypothesisConfluenceBtn);
    }
    if (!type || type === 'scope') {
        if (exportScopeConfluenceBtn) buttons.push(exportScopeConfluenceBtn);
    }
    if (!type || type === 'quickScope') {
        if (exportQuickScopeConfluenceBtn) buttons.push(exportQuickScopeConfluenceBtn);
    }
    
    buttons.forEach(btn => {
        if (btn) {
            btn.disabled = disabled;
            if (disabled) {
                btn.classList.add('save-btn-disabled');
                btn.classList.remove('save-btn-enabled');
            } else {
                btn.classList.remove('save-btn-disabled');
                // Only add teal styling for customer users (not internal)
                if (userRole === 'customer') {
                    btn.classList.add('save-btn-enabled');
                }
            }
        }
    });
}

// Update UI based on authentication state
function updateUIForAuth() {
    if (currentUser && authToken) {
        // User is logged in
        if (loginBtn) loginBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        if (userEmail) {
            userEmail.textContent = currentUser.email;
            userEmail.style.display = 'inline-block';
        }
        if (myScopesBtn) myScopesBtn.style.display = 'inline-block';
        
        // Show Admin Dashboard button for internal users
        const adminDashboardBtn = document.getElementById('admin-dashboard-btn');
        if (adminDashboardBtn) {
            adminDashboardBtn.style.display = userRole === 'internal' ? 'inline-block' : 'none';
        }
        
        // Show/hide buttons based on role
        if (userRole === 'internal') {
            // Internal users see Export to Confluence buttons
            if (exportHypothesisConfluenceBtn) {
                exportHypothesisConfluenceBtn.style.display = 'inline-block';
                exportHypothesisConfluenceBtn.textContent = 'Export to Confluence';
                // Check if there's content to enable/disable
                const hasHypothesis = rawHypothesisContent || (hypothesisOutput && hypothesisOutput.textContent.trim());
                setSaveButtonsState(!hasHypothesis, 'hypothesis');
            }
            if (exportScopeConfluenceBtn) {
                exportScopeConfluenceBtn.style.display = 'inline-block';
                exportScopeConfluenceBtn.textContent = 'Export to Confluence';
                const hasScope = rawScopeContent || (scopeOutput && scopeOutput.textContent.trim());
                setSaveButtonsState(!hasScope, 'scope');
            }
            if (exportQuickScopeConfluenceBtn) {
                exportQuickScopeConfluenceBtn.style.display = 'inline-block';
                exportQuickScopeConfluenceBtn.textContent = 'Export to Confluence';
                const hasQuickScope = rawQuickScopeContent || (quickScopeOutput && quickScopeOutput.textContent.trim());
                setSaveButtonsState(!hasQuickScope, 'quickScope');
            }
        } else {
            // Customers see Save buttons instead (teal when enabled)
            if (exportHypothesisConfluenceBtn) {
                exportHypothesisConfluenceBtn.style.display = 'inline-block';
                exportHypothesisConfluenceBtn.textContent = 'Save Hypothesis';
                const hasHypothesis = rawHypothesisContent || (hypothesisOutput && hypothesisOutput.textContent.trim());
                setSaveButtonsState(!hasHypothesis, 'hypothesis');
            }
            if (exportScopeConfluenceBtn) {
                exportScopeConfluenceBtn.style.display = 'inline-block';
                exportScopeConfluenceBtn.textContent = 'Save Scope';
                const hasScope = rawScopeContent || (scopeOutput && scopeOutput.textContent.trim());
                setSaveButtonsState(!hasScope, 'scope');
            }
            if (exportQuickScopeConfluenceBtn) {
                exportQuickScopeConfluenceBtn.style.display = 'inline-block';
                exportQuickScopeConfluenceBtn.textContent = 'Save Quick Scope';
                const hasQuickScope = rawQuickScopeContent || (quickScopeOutput && quickScopeOutput.textContent.trim());
                setSaveButtonsState(!hasQuickScope, 'quickScope');
            }
        }
    } else {
        // User is not logged in
        if (loginBtn) loginBtn.style.display = 'inline-block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (userEmail) userEmail.style.display = 'none';
        if (myScopesBtn) myScopesBtn.style.display = 'none';
        
        // Hide admin dashboard button
        const adminDashboardBtn = document.getElementById('admin-dashboard-btn');
        if (adminDashboardBtn) {
            adminDashboardBtn.style.display = 'none';
        }
        
        // Hide all export/save buttons until logged in
        if (exportHypothesisConfluenceBtn) exportHypothesisConfluenceBtn.style.display = 'none';
        if (exportScopeConfluenceBtn) exportScopeConfluenceBtn.style.display = 'none';
        if (exportQuickScopeConfluenceBtn) exportQuickScopeConfluenceBtn.style.display = 'none';
    }
}

// Logout function
function handleLogout() {
    authToken = null;
    currentUser = null;
    userRole = null;
    // Clear all auth-related data from localStorage
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('tokenExpiresAt');
    updateUIForAuth();
    showSuccess('Logged out successfully');
    // Redirect to login page
    window.location.href = '/login.html';
}

// Auth event handlers - ensure DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            window.location.href = '/login.html';
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
});

// Also attach immediately in case DOM is already loaded
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        window.location.href = '/login.html';
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
}

// ============================================
// SAVE SCOPE FUNCTIONALITY
// ============================================

// Save scope function (for customers)
async function saveScope(title, content, contentType) {
    // Get valid token (refresh if needed)
    const token = await getValidToken();
    if (!token) {
        showError('Session expired. Please login again.');
        return;
    }
    
    try {
        const response = await fetch('/api/save-scope', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                title: title || `Saved ${contentType}`,
                content: content,
                content_type: contentType
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to save scope');
        }
        
        showSuccess('Scope saved successfully!');
        return data.scope;
        
    } catch (error) {
        console.error('Save scope error:', error);
        showError(error.message || 'Failed to save scope');
        throw error;
    }
}

// Load user's saved scopes
async function loadMyScopes() {
    if (!authToken) {
        showError('Please login to view your saved scopes');
        window.location.href = '/login.html';
        return;
    }
    
    scopesList.innerHTML = '<p>Loading your saved scopes...</p>';
    myScopesModal.style.display = 'flex';
    myScopesModal.classList.add('show');
    
    // Get valid token (refresh if needed)
    const token = await getValidToken();
    if (!token) {
        showError('Session expired. Please login again.');
        myScopesModal.classList.remove('show');
        return;
    }
    
    try {
        const response = await fetch('/api/my-scopes', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load scopes');
        }
        
        if (!data.scopes || data.scopes.length === 0) {
            scopesList.innerHTML = '<div class="empty-state"><p>No saved scopes yet. Save your first scope to see it here!</p></div>';
            allScopesData = [];
            return;
        }
        
        // Store all scopes for search filtering
        allScopesData = data.scopes;
        
        // Sort by date (newest first)
        const sortedScopes = [...data.scopes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        // Render scopes
        renderScopesList(sortedScopes);
        
    } catch (error) {
        console.error('Load scopes error:', error);
        scopesList.innerHTML = `<p style="color: #e74c3c;">Error: ${error.message}</p>`;
    }
}

// Render scopes list (used for initial load and search filtering)
function renderScopesList(scopesToRender) {
    if (scopesToRender.length === 0) {
        scopesList.innerHTML = '<div class="empty-state"><p>No scopes match your search.</p></div>';
        return;
    }
    
    // Display scopes as expandable list
    scopesList.innerHTML = scopesToRender.map((scope, index) => `
            <div class="scope-list-item" data-scope-id="${scope.id}">
                <div class="scope-list-header" data-expand-target="${scope.id}">
                    <div class="scope-list-header-content">
                        <div class="scope-list-icon">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M2 4L8 2L14 4V7C14 10.5 11.5 13.5 8 14.5C4.5 13.5 2 10.5 2 7V4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <div class="scope-list-info">
                            <h4 class="scope-list-title">${escapeHtml(scope.title)}</h4>
                            <div class="scope-list-meta">
                                <span class="scope-type-badge scope-type-${scope.content_type.replace('_', '-')}">${scope.content_type.replace('_', ' ')}</span>
                                <span class="scope-date">${new Date(scope.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                        </div>
                    </div>
                    <div class="scope-list-actions">
                        <button class="scope-action-btn scope-expand-btn" data-scope-id="${scope.id}" title="Expand">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                        <button class="scope-action-btn scope-delete-btn" data-scope-id="${scope.id}" title="Delete">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M2 4H14M12.6667 4V13.3333C12.6667 14 12 14.6667 11.3333 14.6667H4.66667C4 14.6667 3.33333 14 3.33333 13.3333V4M5.33333 4V2.66667C5.33333 2 6 1.33333 6.66667 1.33333H9.33333C10 1.33333 10.6667 2 10.6667 2.66667V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="scope-list-content" id="scope-content-${scope.id}" style="display: none;">
                    <div class="scope-content-wrapper">
                        <pre class="scope-content-text">${escapeHtml(scope.content)}</pre>
                        <div class="scope-content-actions">
                            <button class="btn btn-secondary btn-small scope-copy-btn" data-scope-content="${escapeHtml(scope.content)}">Copy Content</button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
        
        // Add expand/collapse handlers
        document.querySelectorAll('.scope-expand-btn, .scope-list-header').forEach(element => {
            element.addEventListener('click', (e) => {
                // Don't expand if clicking delete button
                if (e.target.closest('.scope-delete-btn')) return;
                
                const scopeId = element.getAttribute('data-scope-id') || element.getAttribute('data-expand-target');
                const contentDiv = document.getElementById(`scope-content-${scopeId}`);
                const expandBtn = document.querySelector(`.scope-expand-btn[data-scope-id="${scopeId}"]`);
                
                if (contentDiv.style.display === 'none') {
                    contentDiv.style.display = 'block';
                    expandBtn.querySelector('svg').style.transform = 'rotate(180deg)';
                    expandBtn.closest('.scope-list-item').classList.add('expanded');
                } else {
                    contentDiv.style.display = 'none';
                    expandBtn.querySelector('svg').style.transform = 'rotate(0deg)';
                    expandBtn.closest('.scope-list-item').classList.remove('expanded');
                }
            });
        });
        
        // Add delete handlers
        document.querySelectorAll('.scope-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent expanding when clicking delete
                const scopeId = btn.getAttribute('data-scope-id');
                if (confirm('Are you sure you want to delete this scope?')) {
                    // Get valid token (refresh if needed)
                    const token = await getValidToken();
                    if (!token) {
                        showError('Session expired. Please login again.');
                        return;
                    }
                    
                    try {
                        const deleteResponse = await fetch(`/api/scopes/${scopeId}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });
                        
                        if (deleteResponse.ok) {
                            showSuccess('Scope deleted');
                            loadMyScopes(); // Reload list
                        } else {
                            throw new Error('Failed to delete scope');
                        }
                    } catch (error) {
                        showError('Failed to delete scope');
                    }
                }
            });
        });
        
        // Add copy handlers
        document.querySelectorAll('.scope-copy-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const content = btn.getAttribute('data-scope-content');
                try {
                    await navigator.clipboard.writeText(content);
                    showSuccess('Content copied to clipboard!');
                } catch (error) {
                    showError('Failed to copy content');
                }
            });
        });
}

// Helper to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// My Scopes button handler
if (myScopesBtn) {
    myScopesBtn.addEventListener('click', () => {
        loadMyScopes();
        // Clear search when opening modal
        if (scopesSearch) {
            scopesSearch.value = '';
        }
    });
}

// Search/filter scopes
if (scopesSearch) {
    scopesSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        if (!searchTerm) {
            // Show all scopes if search is empty
            const sortedScopes = [...allScopesData].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            renderScopesList(sortedScopes);
            return;
        }
        
        // Filter scopes by title or content
        const filteredScopes = allScopesData.filter(scope => {
            const titleMatch = scope.title.toLowerCase().includes(searchTerm);
            const contentMatch = scope.content.toLowerCase().includes(searchTerm);
            return titleMatch || contentMatch;
        });
        
        // Sort filtered results by date (newest first)
        const sortedFiltered = filteredScopes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        renderScopesList(sortedFiltered);
    });
}

// Close scopes modal
if (closeScopesModal) {
    closeScopesModal.addEventListener('click', () => {
        if (myScopesModal) {
            myScopesModal.style.display = 'none';
            myScopesModal.classList.remove('show');
        }
    });
}
if (closeScopesModalBtn) {
    closeScopesModalBtn.addEventListener('click', () => {
        if (myScopesModal) {
            myScopesModal.style.display = 'none';
            myScopesModal.classList.remove('show');
        }
    });
}

// Add "My Scopes" button to header (for logged in users)
// We'll add this dynamically based on auth state

// ============================================
// UPDATE EXPORT BUTTONS TO BE ROLE-BASED
// ============================================

// Authentication check happens in checkAuthOnLoad() above
