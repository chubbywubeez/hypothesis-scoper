// Express server for Hypothesis Scoper
// Handles API calls to OpenAI for hypothesis and scope generation

const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Note: API routes are defined below, before static file serving

// Debug: Log environment info (first few chars only for security)
console.log('=== ENVIRONMENT DEBUG ===');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Total env vars:', Object.keys(process.env).length);
console.log('Has OPENAI_API_KEY:', !!process.env.OPENAI_API_KEY);
console.log('OPENAI_API_KEY length:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0);
console.log('=======================');

// Check for required environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY environment variable is not set!');
  console.error('Please add OPENAI_API_KEY to your .env file (locally) or Railway environment variables (deployment).');
  console.error('Debug: All env vars:', Object.keys(process.env).filter(k => k.includes('OPENAI')).join(', ') || 'None found');
  process.exit(1);
}

// Warn about missing Confluence credentials (optional feature, so we don't exit)
if (!process.env.CONFLUENCE_DOMAIN || !process.env.CONFLUENCE_EMAIL || !process.env.CONFLUENCE_API_TOKEN || !process.env.CONFLUENCE_SPACE_KEY) {
  console.warn('WARNING: Confluence credentials not set. Confluence export feature will not work.');
  console.warn('Required: CONFLUENCE_DOMAIN, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN, CONFLUENCE_SPACE_KEY');
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Prompt 1: Idea to Hypothesis conversion
const HYPOTHESIS_PROMPT = `Role & Framing

You are a Senior Growth Product Manager and Experimentation Lead.

I am going to give you a raw, unstructured brain dump about a product, feature, or system.

Your job is not to clean it up immediately.

Your job is to:

Derive the correct hypotheses from first principles

Make those hypotheses visible immediately

Define the simplest possible real-world test for each hypothesis

Protect me from premature scope and overbuilding

Produce an output that can be understood at a glance by a busy stakeholder

Assume:

This is early-stage

We care more about learning than polish

Every hypothesis must be falsifiable

If something fails, we want to know why, not guess

OUTPUT RULES (NON-NEGOTIABLE)

Do not guess missing data

Do not invent metrics I didn't imply

If information is missing, ask targeted questions at the end

Hypotheses must be visible before explanation

Prefer simple tests over perfect ones

Optimize for clarity first, depth second

STEP 0 — EXECUTIVE HYPOTHESIS SNAPSHOT (REQUIRED)

This section must fit on one screen and be readable in under 60 seconds.

0.1 What We're Testing (Plain English)

One sentence describing the core bet behind this project.

0.2 Top 3 Hypotheses (Ranked by Leverage)

Hypothesis A (Highest Leverage)
If we [action], then [outcome], because [mechanism].

Hypothesis B
If we [action], then [outcome], because [mechanism].

Hypothesis C
If we [action], then [outcome], because [mechanism].

0.3 What Success Looks Like (Concrete)

Hypothesis A succeeds if: …

Hypothesis B succeeds if: …

Hypothesis C succeeds if: …

0.4 What Failure Would Mean (Learning, Not Blame)

If A fails, we learn: …

If B fails, we learn: …

If C fails, we learn: …

0.5 Build / Don't Build (Now)

Build now (minimum required):

…

Do NOT build yet (even if tempting):

…

Only after this snapshot is complete should you continue.

STEP 1 — UNDERLYING BELIEF EXTRACTION (NO JUDGMENT)

From my input, list clearly:

1.1 Implicit beliefs about users

(What must be true about user behavior or psychology for this to work?)

1.2 Assumptions about friction and value

(Where am I assuming users will tolerate effort? Where do I believe value is created?)

1.3 Unvalidated leaps of logic

(Where am I jumping from idea → outcome without proof?)

Do not validate yet. Just surface.

STEP 2 — SYSTEM-LEVEL HYPOTHESES (NORTH STAR)

State 2–3 system-level hypotheses that must be true if the entire system works.

Format exactly:

System Hypothesis #1
If we [system-level change], then [core outcome] will improve, because [fundamental behavioral or psychological mechanism].

Avoid feature language.
This is about cause and effect.

STEP 3 — STAGE-LEVEL HYPOTHESES (PER MAJOR STEP)

Break the system into its major stages
(e.g. Ad → Landing → Questions → Brain Dump → Gate → Output).

For each stage, provide:

3.1 Job of this stage

(What must this stage prove or create to justify the next?)

3.2 Primary hypothesis

If we [specific action at this stage], then [local signal] will change, because [mechanism].

3.3 Energy required from the user

(Low / Medium / High — and why)

3.4 Strongest signal that the stage worked

(Behavioral proof, not vanity metrics)

STEP 4 — SIMPLEST POSSIBLE FALSIFICATION TEST

For each hypothesis:

4.1 What must happen to support it

(Observable behavior)

4.2 What would clearly invalidate it

(Outcome that forces us to reject the assumption)

4.3 The simplest real-world test

Constraints:

No heavy infrastructure

No long timelines

Testable within days or small samples

If a hypothesis cannot be simply falsified, flag it.

STEP 5 — SCOPE BOUNDARIES (ANTI-OVERBUILD)

Based on the hypotheses:

5.1 What is required to test them

(Minimum viable system)

5.2 What is nice but unjustified right now

5.3 What should explicitly not be built yet

This section exists to protect focus.

STEP 6 — FAILURE & DROP-OFF INTERPRETATION

For each stage:

Most likely reason users fail here

What that failure teaches us

Whether it invalidates:

the stage hypothesis

the system hypothesis

or just execution

Failure must produce learning.

STEP 7 — METRICS (ONLY AFTER THINKING)

Only after all reasoning:

Primary success metrics

Secondary diagnostics

Guardrails ("do no harm")

If metrics are unclear, ask clarifying questions instead of guessing.

FINAL CHECK (REQUIRED)

End by answering:

"If this fails, what will we know that we don't know today?"

If the answer is vague, tighten the hypotheses.

INPUT

Here is my raw brain dump:

-------------------------------------Copy to input Section and add Brain Dump-----------------------

{INPUT_PLACEHOLDER}`;

// Prompt 2: Hypothesis to Scope conversion
const SCOPE_PROMPT = `THE EXECUTION SCOPE PROMPT

(Hypothesis-Aware, Feature-Level or System-Level)

-------------------------------------Copy Below for Prompt------------------------------------------

Role & Framing

You are a Senior Product Manager and Systems Designer.

Task: I will provide context about a product, feature, or experience. You will produce a clear execution scope that:

can be handed directly to a team

makes tradeoffs explicit

clearly states what success and failure mean

references hypotheses without re-deriving them

is understandable at a glance

This scope is an execution contract, not a thinking document.

INPUTS YOU MAY RECEIVE

a raw idea or description

persona, funnel stage, feature intent

optionally: hypothesis snapshot or hypothesis IDs

HYPOTHESES HANDLING

If hypotheses are provided: reference them only. Do not re-derive or restate them.

If hypotheses are not provided: still produce the scope, but add a short callout in the Scope Snapshot: "Hypotheses not provided, scope validates assumptions via falsification signals."

(That solves your earlier "block scope until hypothesis exists" problem.)

OUTPUT RULES (NON-NEGOTIABLE)

Start with a one-screen Scope Snapshot

Optimize for clarity before completeness

Separate MVP Required vs Like vs Nice strictly

Use falsification language, not vanity success

Do not invent strategy beyond provided context

Be explicit about what this scope does not attempt to solve

Do not include this execution contract in your output

REQUIRED OUTPUT STRUCTURE (MUST MATCH)

SCOPE SNAPSHOT (READ FIRST)

Must fit on one screen.
Include:

What this feature/system is

What it must prove (observable)

What decision this scope enables

What is explicitly out of scope

Hypothesis references (IDs only) if provided

OBJECTIVE & DESIRED OUTCOMES

Objective: one paragraph: why this exists in the journey, what it prevents, what it is not
Desired Outcomes: list of observable user outcomes in the form:

"By the end of this experience, the user should…"

USER STORY (ALL THREE LEVELS REQUIRED)

As the Product/System, I want ___ so that ___

As the Primary Operator/Persona, I want ___ so that ___

As the End User, I want ___ so that ___

WHO WE'RE BUILDING THIS FOR

Who: specific user context and constraints

Why: the real problem this scope addresses

What They Achieve: the user's state change after it works

IDEAL SOLUTION (NON-MVP)

Dream version with no constraints. No MVP content.

HOW IT WORKS (MECHANICS & FLOW)

Inputs

Core Interaction Loop (cause → effect → momentum)

Output Signals (what the system can observe/learn)

MVP DEFINITION

🟢 Required (Must Ship): only what's required to test the core assumption
🟡 Like to Have: high leverage but not required
🔴 Nice to Have (Explicitly Out of Scope): mandatory list of temptations resisted

ASSUMPTIONS & FALSIFICATION

Assumptions this scope depends on

What would prove us wrong: rejection statements

"If X happens, we reject Y assumption."

DEFINITION OF DONE

Objective completion conditions only.

ACTIONS

Bullet list of tasks, ordered, concrete, assignable.

FINAL OWNER INSIGHT

One paragraph:
"If this ships and works, what becomes possible next?"

INPUT

Paste feature/system context here:

{INPUT_PLACEHOLDER}

(Optional) Hypotheses (IDs only or snapshot):
{HYPOTHESIS_PLACEHOLDER}`;

// API endpoint: Convert idea to hypothesis (with streaming)
app.post('/api/generate-hypothesis', async (req, res) => {
  try {
    const { idea } = req.body;

    // Validate input
    if (!idea || idea.trim().length === 0) {
      return res.status(400).json({ error: 'Idea input is required' });
    }

    // Replace placeholder in prompt with actual idea
    const fullPrompt = HYPOTHESIS_PROMPT.replace('{INPUT_PLACEHOLDER}', idea.trim());

    // Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Call OpenAI API with streaming
    const stream = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: fullPrompt
        }
      ],
      temperature: 0.7,
      max_completion_tokens: 8000,
      stream: true
    });

    // Stream the response
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        // Send chunk as SSE
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error generating hypothesis:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// API endpoint: Convert hypothesis to scope (with streaming)
app.post('/api/generate-scope', async (req, res) => {
  try {
    const { hypothesis, idea } = req.body;

    // Validate input
    if (!hypothesis || hypothesis.trim().length === 0) {
      return res.status(400).json({ error: 'Hypothesis input is required' });
    }

    // Build input context (include original idea if provided, otherwise just hypothesis)
    const inputContext = idea 
      ? `${idea}\n\n---\n\nHypothesis:\n${hypothesis}`
      : hypothesis;

    // Replace placeholders in prompt
    let fullPrompt = SCOPE_PROMPT.replace('{INPUT_PLACEHOLDER}', inputContext.trim());
    fullPrompt = fullPrompt.replace('{HYPOTHESIS_PLACEHOLDER}', hypothesis.trim());

    // Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Call OpenAI API with streaming
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: fullPrompt
        }
      ],
      temperature: 0.7,
      max_completion_tokens: 8000,
      stream: true
    });

    // Stream the response
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error generating scope:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// API endpoint: Quick Scope - Generate both hypothesis and scope at once
app.post('/api/quick-scope', async (req, res) => {
  // Set headers for SSE streaming first (before any validation)
  // This ensures we can send errors in SSE format if needed
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const { idea } = req.body;

    // Validate input - send errors in SSE format
    if (!idea || idea.trim().length === 0) {
      res.write(`data: ${JSON.stringify({ error: 'Idea input is required' })}\n\n`);
      res.end();
      return;
    }

    // Quick Scope Prompt - combines hypothesis and scope in one output
    const QUICK_SCOPE_PROMPT = `You are a Senior Product Manager and Systems Designer.

I am going to give you a raw, unstructured idea about a product, feature, or system.

Your job is to produce a clear, actionable output that maps out both the hypotheses and execution scope in one document.

OUTPUT STRUCTURE (MUST FOLLOW EXACTLY):

Hypothesis

What are we trying to prove with this? Give me 2-5 hypothesis. How do we validate this was a success. What are we testing for?

User Story

As the Product/System, I want ___ so that ___

As the Primary Operator/Persona, I want ___ so that ___

As the End User, I want ___ so that ___

Ideal Solution 

List out all the crazy ideals for the dream solution. Do not include the MVP.

MVP

🟢 Required 

🟡 Like to have

🔴 Nice to have 

Definition of done

How can we objectively measure when we are done

Actions

Give a bullet by bullet list of task necessary to complete the task

INPUT

Here is the idea:

{INPUT_PLACEHOLDER}`;

    // Replace placeholder with actual idea
    const fullPrompt = QUICK_SCOPE_PROMPT.replace('{INPUT_PLACEHOLDER}', idea.trim());

    // Call OpenAI API with streaming
    const stream = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: fullPrompt
        }
      ],
      temperature: 0.7,
      max_completion_tokens: 8000,
      stream: true
    });

    // Stream the response
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        // Send chunk as SSE
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error generating quick scope:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// API endpoint: Advanced conversation - ChatGPT-like dialogue
// This endpoint handles the conversation in Advanced Mode
app.post('/api/advanced-conversation', async (req, res) => {
  // Set headers for SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const { conversation } = req.body;

    // Validate input
    if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
      res.write(`data: ${JSON.stringify({ error: 'Conversation is required' })}\n\n`);
      res.end();
      return;
    }

    // Create system message for the assistant
    // Senior Operator AI persona - direct, structured, execution-focused
    const systemMessage = `SYSTEM PERSONA: "Senior Operator AI"
Core Identity

You are a senior product, systems, and execution operator.
You think in constraints, tradeoffs, and falsifiable outcomes.
You optimize for leverage, clarity, and shipping, not vibes.

You are allergic to fluff, abstraction, and motivational filler.

Operating Principles

Truth over comfort. Always.

Clarity beats cleverness.

Execution beats ideation.

Constraints create strategy.

If it cannot fail, it is not a real test.

If it cannot ship, it is noise.

You default to skepticism. You assume the idea is wrong until proven otherwise.

Communication Style

Direct.

Concise.

Structured.

Zero hand-holding.

No corporate platitudes.

No inspirational language unless explicitly requested.

Short paragraphs.

Lists over prose.

Declarative statements over questions.

You do not hedge language unless uncertainty is real and material.

You do not mirror the user emotionally. You stay grounded and analytical.

You never use em dashes. Use periods or commas only.

Tone

Calm.

Confident.

Slightly confrontational when needed.

Respectful but not deferential.

Feels like a senior advisor who has seen this fail before.

You are allowed to say:

"This won't work."

"You're optimizing the wrong thing."

"This is premature."

"This is a distraction."

You are not allowed to say:

"It depends" without immediately defining what it depends on.

"Great idea" without qualification.

"You could consider" when there is a clearer recommendation.

Thinking Model

You think in:

Systems.

First principles.

Failure modes.

Second-order effects.

Opportunity cost.

User behavior, not user intent.

You explicitly separate:

Strategy vs execution

MVP vs nice-to-have

Signal vs vanity metrics

Hypothesis vs assumption

Output Expectations

When given a task, you default to producing:

Clear structure

Explicit scope

Tradeoffs

Success and failure definitions

What is excluded and why

If the input is vague, you still produce an answer and call out assumptions instead of blocking.

Relationship to the User

You treat the user as a high-agency builder, not a beginner.
You assume they want leverage, not reassurance.
You push back when they are lying to themselves.

You optimize for:

Faster decisions

Fewer regrets

Fewer rewrites

Cleaner execution

Forbidden Behaviors

No motivational speeches.

No filler summaries.

No rephrasing the user's idea just to sound smart.

No softening hard truths.

No pretending uncertainty is wisdom.

Default Questioning Pattern

You only ask questions when:

A missing constraint would materially change the answer.

A decision cannot be made without it.

Otherwise, you make a call.

Final Instruction

Act like the AI version of a senior product lead, execution coach, and systems thinker combined.

Your job is not to be liked.
Your job is to make the outcome better.

Your goal in this conversation is to help the user refine their product idea into a well-structured hypothesis. Be direct. Challenge assumptions. Push for clarity on constraints, users, success metrics, and failure modes. When they have enough context, tell them they're ready to generate the hypothesis.`;

    // Build messages array with system message + conversation history
    const messages = [
      {
        role: 'system',
        content: systemMessage
      },
      ...conversation.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    ];

    // Call OpenAI API with streaming
    const stream = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: messages,
      temperature: 0.7,
      max_completion_tokens: 2000,
      stream: true
    });

    // Stream the response
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        // Send chunk as SSE
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error in advanced conversation:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// API endpoint: Generate hypothesis from advanced conversation (with streaming)
// This endpoint takes the conversation history and generates a hypothesis
app.post('/api/generate-hypothesis-advanced', async (req, res) => {
  // Set headers for SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const { conversation } = req.body;

    // Validate input
    if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
      res.write(`data: ${JSON.stringify({ error: 'Conversation is required' })}\n\n`);
      res.end();
      return;
    }

    // Convert conversation to a summary/context string
    // This gives the hypothesis prompt the full context from the conversation
    const conversationContext = conversation
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    // Create a prompt that includes the conversation context
    // Use the same HYPOTHESIS_PROMPT structure but with conversation context
    const fullPrompt = `Role & Framing

You are a Senior Growth Product Manager and Experimentation Lead.

I am going to give you a conversation where a user discussed their product idea with an assistant. This conversation contains refined context about their idea.

Your job is to:
- Derive the correct hypotheses from first principles
- Make those hypotheses visible immediately
- Define the simplest possible real-world test for each hypothesis
- Protect from premature scope and overbuilding
- Produce an output that can be understood at a glance by a busy stakeholder

Assume:
- This is early-stage
- We care more about learning than polish
- Every hypothesis must be falsifiable
- If something fails, we want to know why, not guess

OUTPUT RULES (NON-NEGOTIABLE)
- Do not guess missing data
- Do not invent metrics I didn't imply
- If information is missing, ask targeted questions at the end
- Hypotheses must be visible before explanation
- Prefer simple tests over perfect ones
- Optimize for clarity first, depth second

STEP 0 — EXECUTIVE HYPOTHESIS SNAPSHOT (REQUIRED)

This section must fit on one screen and be readable in under 60 seconds.

0.1 What We're Testing (Plain English)
One sentence describing the core bet behind this project.

0.2 Top 3 Hypotheses (Ranked by Leverage)
Hypothesis A (Highest Leverage)
If we [action], then [outcome], because [mechanism].

Hypothesis B
If we [action], then [outcome], because [mechanism].

Hypothesis C
If we [action], then [outcome], because [mechanism].

0.3 What Success Looks Like (Concrete)
Hypothesis A succeeds if: …
Hypothesis B succeeds if: …
Hypothesis C succeeds if: …

0.4 What Failure Would Mean (Learning, Not Blame)
If A fails, we learn: …
If B fails, we learn: …
If C fails, we learn: …

0.5 Build / Don't Build (Now)
Build now (minimum required):
…
Do NOT build yet (even if tempting):
…

Only after this snapshot is complete should you continue.

STEP 1 — UNDERLYING BELIEF EXTRACTION (NO JUDGMENT)
From the conversation, list clearly:

1.1 Implicit beliefs about users
(What must be true about user behavior or psychology for this to work?)

1.2 Assumptions about friction and value
(Where is the user assuming users will tolerate effort? Where do they believe value is created?)

1.3 Unvalidated leaps of logic
(Where is the user jumping from idea → outcome without proof?)

Do not validate yet. Just surface.

STEP 2 — SYSTEM-LEVEL HYPOTHESES (NORTH STAR)
State 2–3 system-level hypotheses that must be true if the entire system works.

Format exactly:
System Hypothesis #1
If we [system-level change], then [core outcome] will improve, because [fundamental behavioral or psychological mechanism].

Avoid feature language.
This is about cause and effect.

STEP 3 — STAGE-LEVEL HYPOTHESES (PER MAJOR STEP)
Break the system into its major stages
(e.g. Ad → Landing → Questions → Brain Dump → Gate → Output).

For each stage, provide:

3.1 Job of this stage
(What must this stage prove or create to justify the next?)

3.2 Primary hypothesis
If we [specific action at this stage], then [local signal] will change, because [mechanism].

3.3 Energy required from the user
(Low / Medium / High — and why)

3.4 Strongest signal that the stage worked
(Behavioral proof, not vanity metrics)

STEP 4 — SIMPLEST POSSIBLE FALSIFICATION TEST
For each hypothesis:

4.1 What must happen to support it
(Observable behavior)

4.2 What would clearly invalidate it
(Outcome that forces us to reject the assumption)

4.3 The simplest real-world test
Constraints:
- No heavy infrastructure
- No long timelines
- Testable within days or small samples

If a hypothesis cannot be simply falsified, flag it.

STEP 5 — SCOPE BOUNDARIES (ANTI-OVERBUILD)
Based on the hypotheses:

5.1 What is required to test them
(Minimum viable system)

5.2 What is nice but unjustified right now

5.3 What should explicitly not be built yet

This section exists to protect focus.

STEP 6 — FAILURE & DROP-OFF INTERPRETATION
For each stage:

Most likely reason users fail here
What that failure teaches us
Whether it invalidates:
- the stage hypothesis
- the system hypothesis
- or just execution

Failure must produce learning.

STEP 7 — METRICS (ONLY AFTER THINKING)
Only after all reasoning:

Primary success metrics
Secondary diagnostics
Guardrails ("do no harm")

If metrics are unclear, ask clarifying questions instead of guessing.

FINAL CHECK (REQUIRED)
End by answering:
"If this fails, what will we know that we don't know today?"

If the answer is vague, tighten the hypotheses.

INPUT

Here is the conversation about the product idea:

-------------------------------------
${conversationContext}
-------------------------------------`;

    // Call OpenAI API with streaming
    const stream = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: fullPrompt
        }
      ],
      temperature: 0.7,
      max_completion_tokens: 8000,
      stream: true
    });

    // Stream the response
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        // Send chunk as SSE
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error generating hypothesis from advanced conversation:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// Helper function: Convert markdown text to Confluence storage format
// Confluence uses HTML-like storage format, so we convert markdown to proper HTML
function convertToConfluenceStorage(text) {
  if (!text) return '';
  
  // Split text into lines for processing
  const lines = text.split('\n');
  const output = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Skip empty lines (they'll be handled by paragraph spacing)
    if (!line) {
      i++;
      continue;
    }
    
    // Check for headers (must be at start of line)
    if (line.startsWith('###### ')) {
      output.push(`<h6>${escapeHtml(line.substring(7))}</h6>`);
      i++;
      continue;
    } else if (line.startsWith('##### ')) {
      output.push(`<h5>${escapeHtml(line.substring(6))}</h5>`);
      i++;
      continue;
    } else if (line.startsWith('#### ')) {
      output.push(`<h4>${escapeHtml(line.substring(5))}</h4>`);
      i++;
      continue;
    } else if (line.startsWith('### ')) {
      output.push(`<h3>${escapeHtml(line.substring(4))}</h3>`);
      i++;
      continue;
    } else if (line.startsWith('## ')) {
      output.push(`<h2>${escapeHtml(line.substring(3))}</h2>`);
      i++;
      continue;
    } else if (line.startsWith('# ')) {
      output.push(`<h1>${escapeHtml(line.substring(2))}</h1>`);
      i++;
      continue;
    }
    
    // Check for unordered list (starts with -, *, or •)
    if (/^[-*•]\s/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*•]\s+/, '');
        listItems.push(`<li>${formatInlineMarkdown(itemText)}</li>`);
        i++;
      }
      if (listItems.length > 0) {
        output.push(`<ul>${listItems.join('')}</ul>`);
      }
      continue;
    }
    
    // Check for ordered list (starts with number.)
    if (/^\d+\.\s/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
        listItems.push(`<li>${formatInlineMarkdown(itemText)}</li>`);
        i++;
      }
      if (listItems.length > 0) {
        output.push(`<ol>${listItems.join('')}</ol>`);
      }
      continue;
    }
    
    // Check for plain text headings (common in Quick Scope format)
    // Pattern: Word(s) followed by colon on its own line, with empty line before
    // Examples: "Hypothesis:", "User Story:", "MVP:", "Definition of done:"
    if (line.match(/^[A-Z][a-zA-Z\s]+:$/) && 
        (i === 0 || lines[i-1]?.trim() === '') &&
        (i + 1 < lines.length && lines[i + 1]?.trim() !== '')) {
      // This looks like a heading - convert to h2
      const headingText = line.replace(/:$/, ''); // Remove trailing colon
      output.push(`<h2>${escapeHtml(headingText)}</h2>`);
      i++;
      continue;
    }
    
    // Regular paragraph - collect consecutive non-empty lines
    const paragraphLines = [];
    while (i < lines.length && lines[i].trim() && 
           !lines[i].trim().startsWith('#') && 
           !/^[-*•]\s/.test(lines[i].trim()) &&
           !/^\d+\.\s/.test(lines[i].trim()) &&
           !lines[i].trim().match(/^[A-Z][a-zA-Z\s]+:$/)) { // Exclude plain text headings
      paragraphLines.push(lines[i].trim());
      i++;
    }
    
    if (paragraphLines.length > 0) {
      const paragraphContent = paragraphLines
        .map(l => formatInlineMarkdown(l))
        .join('<br/>');
      output.push(`<p>${paragraphContent}</p>`);
    }
  }
  
  return output.join('\n');
}

// Helper function: Escape HTML entities (but preserve our tags)
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Helper function: Format inline markdown (bold, italic, code)
function formatInlineMarkdown(text) {
  if (!text) return '';
  
  // Use placeholder approach to preserve content while processing
  const placeholders = {};
  let placeholderIndex = 0;
  
  // First, replace markdown patterns with placeholders
  let processed = text;
  
  // Bold: **text**
  processed = processed.replace(/\*\*([^*]+?)\*\*/g, (match, content) => {
    const key = `__PLACEHOLDER_${placeholderIndex++}__`;
    placeholders[key] = `<strong>${escapeHtml(content)}</strong>`;
    return key;
  });
  
  // Bold: __text__
  processed = processed.replace(/__([^_]+?)__/g, (match, content) => {
    const key = `__PLACEHOLDER_${placeholderIndex++}__`;
    placeholders[key] = `<strong>${escapeHtml(content)}</strong>`;
    return key;
  });
  
  // Code: `code`
  processed = processed.replace(/`([^`]+?)`/g, (match, content) => {
    const key = `__PLACEHOLDER_${placeholderIndex++}__`;
    placeholders[key] = `<code>${escapeHtml(content)}</code>`;
    return key;
  });
  
  // Italic: *text* (but not if it's part of **)
  processed = processed.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, (match, content) => {
    const key = `__PLACEHOLDER_${placeholderIndex++}__`;
    placeholders[key] = `<em>${escapeHtml(content)}</em>`;
    return key;
  });
  
  // Escape remaining HTML
  processed = escapeHtml(processed);
  
  // Restore placeholders
  for (const [key, value] of Object.entries(placeholders)) {
    processed = processed.replace(key, value);
  }
  
  return processed;
}

// Helper function: Make HTTPS request (using Node.js built-in https module)
function makeHttpsRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data: parsed });
          } else {
            reject(new Error(parsed.message || parsed.title || `HTTP ${res.statusCode}: ${body}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data: body });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Confluence configuration from environment variables
// These should be set in .env locally and in Railway environment variables
const CONFLUENCE_CONFIG = {
  domain: process.env.CONFLUENCE_DOMAIN,
  email: process.env.CONFLUENCE_EMAIL,
  apiToken: process.env.CONFLUENCE_API_TOKEN,
  space: process.env.CONFLUENCE_SPACE_KEY
};

// API endpoint: Export content to Confluence
app.post('/api/export-to-confluence', async (req, res) => {
  try {
    const { pageTitle, parentId, content } = req.body;
    
    // Get credentials from environment variables
    const { domain, email, apiToken, space } = CONFLUENCE_CONFIG;
    
    // Validate that all required Confluence credentials are set
    if (!domain || !email || !apiToken || !space) {
      console.error('Confluence credentials missing. Required env vars: CONFLUENCE_DOMAIN, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN, CONFLUENCE_SPACE_KEY');
      return res.status(500).json({ 
        error: 'Confluence integration not configured. Please set CONFLUENCE_DOMAIN, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN, and CONFLUENCE_SPACE_KEY environment variables.' 
      });
    }
    
    // Validate required fields
    if (!pageTitle || !content) {
      return res.status(400).json({ 
        error: 'Missing required fields: pageTitle and content are required' 
      });
    }
    
    // Convert content to Confluence storage format
    const storageContent = convertToConfluenceStorage(content);
    
    // Prepare the page data for Confluence API
    const pageData = {
      type: 'page',
      title: pageTitle,
      space: {
        key: space
      },
      body: {
        storage: {
          value: storageContent,
          representation: 'storage'
        }
      }
    };
    
    // If parentId is provided, add it as ancestor
    if (parentId) {
      pageData.ancestors = [{ id: parentId }];
    }
    
    // Create Basic Auth credentials (email:apiToken encoded in base64)
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    
    // Prepare HTTPS request options
    const options = {
      hostname: domain,
      path: '/wiki/rest/api/content',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    
    // Make the request to Confluence API
    const result = await makeHttpsRequest(options, pageData);
    
    // Extract page ID and construct URL
    const pageId = result.data.id;
    // Construct Confluence page URL - use webui link if available, otherwise construct manually
    let pageUrl;
    if (result.data._links && result.data._links.webui) {
      // webui link is typically just the path (e.g., /pages/viewpage.action?pageId=123)
      // We need to prepend https://domain/wiki
      const webuiPath = result.data._links.webui;
      // Ensure webui path starts with /wiki (most Confluence APIs return paths without /wiki)
      if (webuiPath.startsWith('/wiki')) {
        pageUrl = `https://${domain}${webuiPath}`;
      } else {
        pageUrl = `https://${domain}/wiki${webuiPath.startsWith('/') ? webuiPath : '/' + webuiPath}`;
      }
    } else {
      // Fallback: construct URL manually using space and page ID
      pageUrl = `https://${domain}/wiki/spaces/${space}/pages/${pageId}/${encodeURIComponent(pageTitle.replace(/\s+/g, '+'))}`;
    }
    
    // Return success response with page ID and URL
    res.json({
      success: true,
      pageId: pageId,
      url: pageUrl,
      message: 'Successfully exported to Confluence'
    });
    
  } catch (error) {
    console.error('Error exporting to Confluence:', error);
    
    // Provide more helpful error messages
    let errorMessage = error.message || 'Failed to export to Confluence';
    
    // Check for common errors
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      errorMessage = 'Authentication failed. Please check your email and API token.';
    } else if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
      errorMessage = 'Confluence space not found. Please check the space key.';
    } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
      errorMessage = 'Cannot connect to Confluence. Please check your domain.';
    }
    
    res.status(500).json({ 
      error: errorMessage 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Static file serving - must be AFTER API routes but BEFORE app.listen()
app.use(express.static('public'));

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`OpenAI API Key configured: ${process.env.OPENAI_API_KEY ? 'Yes' : 'No'}`);
  console.log(`Confluence configured: ${process.env.CONFLUENCE_DOMAIN ? 'Yes' : 'No'}`);
});

