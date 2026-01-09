// Frontend JavaScript for Hypothesis Scoper
// Handles user interactions, API calls, and clipboard operations

// Store original idea for scope generation
let originalIdea = '';

// Progress tracking for loading bars
let progressInterval = null;
let startTime = null;

// Estimated generation times (in seconds) - based on typical API response times
const ESTIMATED_TIMES = {
    hypothesis: 15, // ~15 seconds for hypothesis generation
    scope: 20      // ~20 seconds for scope generation
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
        hypothesisOutput.textContent = '';
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
                            hypothesisOutput.textContent = fullText;
                            // Auto-scroll to bottom as text streams in
                            hypothesisOutput.scrollTop = hypothesisOutput.scrollHeight;
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
        // Prepare output area
        scopeOutput.textContent = '';
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
                            scopeOutput.textContent = fullText;
                            // Auto-scroll to bottom as text streams in
                            scopeOutput.scrollTop = scopeOutput.scrollHeight;
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

// Allow Enter key to submit (Ctrl/Cmd + Enter for newline)
ideaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        generateHypothesisBtn.click();
    }
});

