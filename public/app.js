// Frontend JavaScript for Hypothesis Scoper
// Handles user interactions, API calls, and clipboard operations

// Store original idea for scope generation
let originalIdea = '';
// Store conversation history for chat iteration
let conversationHistory = [];

// Progress tracking for loading bars
let progressInterval = null;
let startTime = null;

// Estimated generation times (in seconds) - based on typical API response times
const ESTIMATED_TIMES = {
    hypothesis: 15, // ~15 seconds for hypothesis generation
    scope: 20,      // ~20 seconds for scope generation
    updatedHypothesis: 18 // ~18 seconds for updated hypothesis
};

// DOM elements
const ideaInput = document.getElementById('idea-input');
const generateHypothesisBtn = document.getElementById('generate-hypothesis-btn');
const hypothesisSection = document.getElementById('hypothesis-section');
const hypothesisOutput = document.getElementById('hypothesis-output');
const copyHypothesisBtn = document.getElementById('copy-hypothesis-btn');
const generateScopeBtn = document.getElementById('generate-scope-btn');
const scopeSection = document.getElementById('scope-section');
const scopeOutput = document.getElementById('scope-output');
const copyScopeBtn = document.getElementById('copy-scope-btn');
const hypothesisLoading = document.getElementById('hypothesis-loading');
const scopeLoading = document.getElementById('scope-loading');
const errorMessage = document.getElementById('error-message');
const successNotification = document.getElementById('success-notification');

// Progress bar elements
const hypothesisProgressBar = document.getElementById('hypothesis-progress-bar');
const hypothesisTimeElapsed = document.getElementById('hypothesis-time-elapsed');
const hypothesisTimeEstimate = document.getElementById('hypothesis-time-estimate');

const scopeProgressBar = document.getElementById('scope-progress-bar');
const scopeTimeElapsed = document.getElementById('scope-time-elapsed');
const scopeTimeEstimate = document.getElementById('scope-time-estimate');

const updatedHypothesisProgressBar = document.getElementById('updated-hypothesis-progress-bar');
const updatedHypothesisTimeElapsed = document.getElementById('updated-hypothesis-time-elapsed');
const updatedHypothesisTimeEstimate = document.getElementById('updated-hypothesis-time-estimate');

// Chat elements
const chatSection = document.getElementById('chat-section');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const generateUpdatedHypothesisBtn = document.getElementById('generate-updated-hypothesis-btn');
const updatedHypothesisLoading = document.getElementById('updated-hypothesis-loading');

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
    } else if (type === 'updatedHypothesis') {
        progressBar = updatedHypothesisProgressBar;
        timeElapsed = updatedHypothesisTimeElapsed;
        timeEstimate = updatedHypothesisTimeEstimate;
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
    if (updatedHypothesisProgressBar) updatedHypothesisProgressBar.style.width = '100%';
    
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
        // Call API
        const response = await fetch('/api/generate-hypothesis', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ idea })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate hypothesis');
        }
        
        // Stop progress and complete
        stopProgress();
        
        // Display hypothesis
        hypothesisOutput.textContent = data.hypothesis;
        hypothesisSection.style.display = 'block';
        
        // Reset conversation history and show chat section
        conversationHistory = [];
        chatMessages.innerHTML = '';
        chatSection.style.display = 'block';
        
        // Scroll to hypothesis section
        hypothesisSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
    } catch (error) {
        stopProgress();
        showError(`Error: ${error.message}`);
    } finally {
        generateHypothesisBtn.disabled = false;
        // Hide loading after a brief delay to show 100% completion
        setTimeout(() => {
            hypothesisLoading.style.display = 'none';
        }, 500);
    }
});

// Generate scope from hypothesis
generateScopeBtn.addEventListener('click', async () => {
    const hypothesis = hypothesisOutput.textContent.trim();
    
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
        // Call API with both hypothesis and original idea
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
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate scope');
        }
        
        // Stop progress and complete
        stopProgress();
        
        // Display scope
        scopeOutput.textContent = data.scope;
        scopeSection.style.display = 'block';
        
        // Scroll to scope section
        scopeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
    } catch (error) {
        stopProgress();
        showError(`Error: ${error.message}`);
    } finally {
        generateScopeBtn.disabled = false;
        // Hide loading after a brief delay to show 100% completion
        setTimeout(() => {
            scopeLoading.style.display = 'none';
        }, 500);
    }
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

// Send chat message
sendChatBtn.addEventListener('click', async () => {
    const message = chatInput.value.trim();
    
    if (!message) {
        return;
    }
    
    // Add user message to conversation
    conversationHistory.push({ role: 'user', content: message });
    addChatMessage('user', message);
    chatInput.value = '';
    
    // Disable input while processing
    sendChatBtn.disabled = true;
    chatInput.disabled = true;
    
    try {
        // Call chat API
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                idea: originalIdea,
                hypothesis: hypothesisOutput.textContent.trim()
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to get chat response');
        }
        
        // Add assistant response to conversation
        conversationHistory.push({ role: 'assistant', content: data.response });
        addChatMessage('assistant', data.response);
        
    } catch (error) {
        showError(`Error: ${error.message}`);
    } finally {
        sendChatBtn.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
    }
});

// Generate updated hypothesis with conversation history
generateUpdatedHypothesisBtn.addEventListener('click', async () => {
    if (conversationHistory.length === 0) {
        showError('Please have at least one conversation exchange before generating an updated hypothesis.');
        return;
    }
    
    // Show loading state with progress
    generateUpdatedHypothesisBtn.disabled = true;
    updatedHypothesisLoading.style.display = 'block';
    hideError();
    
    // Start progress tracking
    startProgress('updatedHypothesis', ESTIMATED_TIMES.updatedHypothesis);
    
    try {
        // Call API with conversation history
        const response = await fetch('/api/generate-updated-hypothesis', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                idea: originalIdea,
                conversation: conversationHistory
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate updated hypothesis');
        }
        
        // Stop progress and complete
        stopProgress();
        
        // Display updated hypothesis
        hypothesisOutput.textContent = data.hypothesis;
        
        // Clear conversation history after update
        conversationHistory = [];
        chatMessages.innerHTML = '';
        
        // Scroll to hypothesis
        hypothesisSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
    } catch (error) {
        stopProgress();
        showError(`Error: ${error.message}`);
    } finally {
        generateUpdatedHypothesisBtn.disabled = false;
        // Hide loading after a brief delay to show 100% completion
        setTimeout(() => {
            updatedHypothesisLoading.style.display = 'none';
        }, 500);
    }
});

// Add chat message to UI
function addChatMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}`;
    
    const roleDiv = document.createElement('div');
    roleDiv.className = 'role';
    roleDiv.textContent = role === 'user' ? 'You' : 'Assistant';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    contentDiv.textContent = content;
    
    messageDiv.appendChild(roleDiv);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Allow Enter key to send chat (Ctrl/Cmd + Enter for newline)
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        sendChatBtn.click();
    }
});

// Allow Enter key to submit (Ctrl/Cmd + Enter for newline)
ideaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        generateHypothesisBtn.click();
    }
});

