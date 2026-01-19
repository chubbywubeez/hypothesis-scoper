/**
 * Lightweight prompt DSL (Domain Specific Language)
 * -------------------------------------------------
 * Goal: Make long prompts composable and easy to maintain without changing output.
 *
 * Why this exists:
 * - Giant template strings are hard to edit safely.
 * - We want reusable "sections" that can be swapped/edited without touching endpoints.
 *
 * Design rules:
 * - Keep this dumb and transparent. No magic parsing.
 * - The output should be the same strings we used before (same whitespace, same content),
 *   except for the replaced input placeholders.
 * - Keep functions pure: input in, string out.
 */

function joinSections(sections) {
  // We join with "\n" because our prompt sections already include intentional blank lines.
  // This keeps the final prompt output stable and predictable.
  return sections.join('\n');
}

/**
 * Hypothesis prompt (Idea -> Hypothesis)
 * Note: This is intentionally stored as an array of sections for easier editing.
 */
const HYPOTHESIS_SECTIONS = [
  `Role & Framing

You are a Senior Growth Product Manager and Experimentation Lead.

I am going to give you a raw, unstructured brain dump about a product, feature, or system.



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

If information is missing, ask targeted questions at the end, but if there is enough context, just move on.

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

{INPUT_PLACEHOLDER}`
];

function buildHypothesisPrompt(idea) {
  // Keep the existing placeholder name so behavior stays predictable.
  return joinSections(HYPOTHESIS_SECTIONS).replace('{INPUT_PLACEHOLDER}', (idea || '').trim());
}

/**
 * Scope prompt (Hypothesis -> Scope)
 */
const SCOPE_SECTIONS = [
  `THE EXECUTION SCOPE PROMPT

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
{HYPOTHESIS_PLACEHOLDER}`
];

function buildScopePrompt(context, hypotheses) {
  const safeContext = (context || '').trim();
  const safeHypotheses = (hypotheses || '').trim();

  // Keep existing placeholders so behavior stays predictable.
  return joinSections(SCOPE_SECTIONS)
    .replace('{INPUT_PLACEHOLDER}', safeContext)
    .replace('{HYPOTHESIS_PLACEHOLDER}', safeHypotheses);
}

module.exports = {
  buildHypothesisPrompt,
  buildScopePrompt
};

