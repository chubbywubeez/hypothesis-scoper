// Frontend JavaScript for Hypothesis Scoper
// Handles user interactions, API calls, and clipboard operations

// Store original idea for scope generation
let originalIdea = '';
// Store conversation history for chat iteration
let conversationHistory = [];
// Track hypothesis version/draft number
let hypothesisVersion = 1;

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
const hypothesisVersionBadge = document.getElementById('hypothesis-version');
const updateSuggestion = document.getElementById('update-suggestion');
const exchangeCountDisplay = document.getElementById('exchange-count');
const chatWelcome = document.getElementById('chat-welcome');

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
        // Prepare output area
        hypothesisOutput.textContent = '';
        hypothesisSection.style.display = 'block';
        
        // Reset conversation history and show chat section
        conversationHistory = [];
        chatMessages.innerHTML = '';
        chatSection.style.display = 'block';
        
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
                            
                            // Reset conversation and show UI elements
                            conversationHistory = [];
                            chatMessages.innerHTML = '';
                            hypothesisVersion = 1;
                            updateVersionBadge();
                            updateSuggestion.style.display = 'none';
                            
                            // Generate personalized welcome message based on hypothesis
                            generateWelcomeMessage(fullText);
                            
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

// Helper function to send chat message
async function sendChatMessage(message) {
    if (!message || message.trim().length === 0) {
        return;
    }
    
    // Hide welcome message if present
    if (chatWelcome && chatWelcome.parentNode) {
        chatWelcome.style.display = 'none';
    }
    
    // Hide welcome loading/content if still visible
    const welcomeLoading = document.getElementById('welcome-loading');
    const welcomeContent = document.getElementById('welcome-content');
    if (welcomeLoading) welcomeLoading.style.display = 'none';
    if (welcomeContent) welcomeContent.style.display = 'none';
    
    // Add user message to conversation
    conversationHistory.push({ role: 'user', content: message });
    addChatMessage('user', message);
    chatInput.value = '';
    
    // Disable input while processing
    sendChatBtn.disabled = true;
    chatInput.disabled = true;
    
    try {
        // Call chat API with conversation history
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                idea: originalIdea,
                hypothesis: hypothesisOutput.textContent.trim(),
                conversation: conversationHistory.slice(0, -1) // Send previous conversation, not current message
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to get chat response');
        }
        
        // Add assistant response to conversation
        conversationHistory.push({ role: 'assistant', content: data.response });
        addChatMessage('assistant', data.response, 'critic');
        
        // Show update suggestion after meaningful exchanges (after at least 1 user message and 1 assistant response)
        if (conversationHistory.length >= 2) {
            updateSuggestion.style.display = 'block';
        }
        
    } catch (error) {
        showError(`Error: ${error.message}`);
    } finally {
        sendChatBtn.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
    }
}

// Send chat message
sendChatBtn.addEventListener('click', async () => {
    const message = chatInput.value.trim();
    await sendChatMessage(message);
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
        // Prepare output area
        hypothesisOutput.textContent = '';
        
        // Scroll to hypothesis
        hypothesisSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Call API with streaming
        const response = await fetch('/api/generate-updated-hypothesis', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                idea: originalIdea,
                conversation: historyToSend
            })
        });
        
        // Hide update suggestion during generation
        updateSuggestion.style.display = 'none';
        
        // Clear conversation history after starting the API call (version will increment on completion)
        const historyToSend = [...conversationHistory];
        conversationHistory = [];
        chatMessages.innerHTML = '';
        chatExchangeCount.style.display = 'none';
        
        if (!response.ok) {
            throw new Error('Failed to generate updated hypothesis');
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
                            hypothesisOutput.textContent = fullText;
                            // Auto-scroll to bottom as text streams in
                            hypothesisOutput.scrollTop = hypothesisOutput.scrollHeight;
                        }
                        
                        if (data.done) {
                            // Stop progress and complete
                            stopProgress();
                            generateUpdatedHypothesisBtn.disabled = false;
                            
                            // Increment version after successful update
                            hypothesisVersion++;
                            updateVersionBadge();
                            
                            // Reset UI
                            updateSuggestion.style.display = 'none';
                            
                            // Generate new welcome message for updated hypothesis
                            generateWelcomeMessage(fullText);
                            
                            setTimeout(() => {
                                updatedHypothesisLoading.style.display = 'none';
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
        generateUpdatedHypothesisBtn.disabled = false;
        updatedHypothesisLoading.style.display = 'none';
    }
});

// Add chat message to UI
function addChatMessage(role, content, roleLabel = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}`;
    
    const roleDiv = document.createElement('div');
    roleDiv.className = 'role';
    roleDiv.textContent = role === 'user' ? 'You' : (roleLabel === 'critic' ? 'Critic' : 'Assistant');
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    contentDiv.textContent = content;
    
    messageDiv.appendChild(roleDiv);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Update version badge
function updateVersionBadge() {
    if (hypothesisVersionBadge) {
        hypothesisVersionBadge.textContent = `Draft v${hypothesisVersion}`;
    }
}

// Generate personalized welcome message by analyzing the hypothesis
async function generateWelcomeMessage(hypothesis) {
    if (!hypothesis || hypothesis.trim().length === 0) {
        return;
    }
    
    // Show welcome message with loading indicator
    if (chatWelcome) {
        chatWelcome.style.display = 'block';
        const welcomeLoading = document.getElementById('welcome-loading');
        const welcomeContent = document.getElementById('welcome-content');
        if (welcomeLoading) welcomeLoading.style.display = 'block';
        if (welcomeContent) welcomeContent.style.display = 'none';
        
        // Ensure welcome is in the messages container
        if (!chatWelcome.parentNode) {
            chatMessages.appendChild(chatWelcome);
        }
    }
    
    try {
        // Call chat API to generate personalized welcome based on hypothesis
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Hi! I\'m here to help you refine this hypothesis. Let me take a look and ask a few questions that could help strengthen it.',
                idea: originalIdea,
                hypothesis: hypothesis,
                conversation: [] // Empty conversation for first message
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate welcome message');
        }
        
        // Hide loading, show content
        const welcomeLoading = document.getElementById('welcome-loading');
        const welcomeContent = document.getElementById('welcome-content');
        
        if (welcomeLoading) welcomeLoading.style.display = 'none';
        if (welcomeContent) {
            welcomeContent.style.display = 'block';
            // Format the response as paragraphs
            const paragraphs = data.response.split('\n\n').filter(p => p.trim().length > 0);
            welcomeContent.innerHTML = paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
        }
        
    } catch (error) {
        console.error('Error generating welcome message:', error);
        // Fallback to generic message on error
        const welcomeLoading = document.getElementById('welcome-loading');
        const welcomeContent = document.getElementById('welcome-content');
        if (welcomeLoading) welcomeLoading.style.display = 'none';
        if (welcomeContent) {
            welcomeContent.style.display = 'block';
            welcomeContent.innerHTML = '<p>I\'ll help you refine your hypothesis by asking clarifying questions and providing feedback.</p><p><strong>Send a message to start, or use the buttons below to get quick feedback.</strong></p>';
        }
    }
}


// Allow Enter key to send chat (Ctrl/Cmd + Enter for newline)
if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            sendChatBtn.click();
        }
    });
}

// Allow Enter key to submit (Ctrl/Cmd + Enter for newline)
ideaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        generateHypothesisBtn.click();
    }
});

