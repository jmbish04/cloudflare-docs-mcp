# Task 5: Enhance Agent Logic with Clarification Phase

## Objective
Improve the research agent's accuracy and efficiency by introducing a "clarification phase" where it can ask the user follow-up questions if the initial query is ambiguous.

## Context
The current agent immediately generates and executes a research plan based on the user's initial query. If the query is vague (e.g., "Tell me about Workers"), the resulting plan may be too broad or miss the user's true intent. A clarification phase will allow the agent to narrow the scope and produce more relevant results.

## Requirements

### 1. Create a "Needs Clarification" Schema
- In `src/actors/ChatSessionActor.ts` (or a shared schema file), define a Zod schema that represents the decision to ask a clarifying question.

### Example `ClarificationCheckSchema`:

```typescript
// src/actors/ChatSessionActor.ts
import { z } from 'zod';

const ClarificationCheckSchema = z.object({
  needsClarification: z.boolean().describe("Set to true if the user's query is ambiguous, too broad, or lacks specific details to create a concrete research plan."),
  clarifyingQuestion: z.string().optional().describe("If needsClarification is true, pose a specific question to the user to narrow down their request."),
});
```

### 2. Modify `handleUserQuery` in `ChatSessionActor`
- Open `src/actors/ChatSessionActor.ts`.
- In the `handleUserQuery` method, before generating the research plan, insert a new step.

### 3. Implement the Clarification Check Step
- **Prompt:** Create a prompt that asks the LLM to evaluate the user's query for ambiguity.
- **Tool Call:** Use the `structuredResponseTool` with the new `ClarificationCheckSchema` to get a structured decision.
- **Conditional Logic:**
    - If `needsClarification` is `true`:
        - Send the `clarifyingQuestion` back to the user.
        - **Stop** the current execution and wait for the user's next message.
        - Store the context that you are waiting for an answer to a question.
    - If `needsClarification` is `false`:
        - Proceed with generating the research plan as before.

### Example `handleUserQuery` Modification:

```typescript
// src/actors/ChatSessionActor.ts

async handleUserQuery(sessionId: string, query: string): Promise<object> {
  // ... logging and message history push ...

  // === NEW: CLARIFICATION PHASE ===
  const clarificationPrompt = `Is the following user query ambiguous or too broad to create a specific, actionable research plan? Query: "${query}"`;
  const clarificationResult = await this.structuredResponseTool.analyzeText(ClarificationCheckSchema, clarificationPrompt);

  if (clarificationResult.success && clarificationResult.structuredResult?.needsClarification) {
    const question = clarificationResult.structuredResult.clarifyingQuestion || "Could you please provide more details?";
    this.sendUpdate('clarification_needed', { question });
    // Store state to indicate we are waiting for a response
    await this.state.storage.put('isAwaitingClarification', true);
    return { sessionId, response: question }; // End execution for now
  }
  // === END: CLARIFICATION PHASE ===


  // If we are here, the query is clear enough to proceed.
  this.sendUpdate('status', { message: 'Creating research plan...' });
  // ... rest of the planning and execution logic ...
}
```

### 4. Handle the User's Response
- The `handleUserQuery` method needs to be aware of the `isAwaitingClarification` state.
- If the agent was waiting for a clarification, the new user message should be treated as the answer.
- Combine the original query with the user's answer to form a new, more specific query, and then proceed to the planning phase.

### Example State Handling:

```typescript
// src/actors/ChatSessionActor.ts

async handleUserQuery(sessionId: string, query: string): Promise<object> {
  let finalQuery = query;
  const isAwaitingClarification = await this.state.storage.get<boolean>('isAwaitingClarification');

  if (isAwaitingClarification) {
    const originalQuery = this.messageHistory.find(msg => msg.role === 'user')?.content || '';
    finalQuery = `Original question was: "${originalQuery}". The user provided this clarification: "${query}"`;
    await this.state.storage.delete('isAwaitingClarification'); // Reset state
  }

  // ... push `query` to message history ...

  // Now, run the clarification check on the `finalQuery`
  const clarificationPrompt = `Is the following user query ambiguous...? Query: "${finalQuery}"`;
  // ... rest of the logic ...
}
```

## Acceptance Criteria
- If a user provides a vague query like "Tell me about D1", the agent responds with a clarifying question (e.g., "What specifically about D1 are you interested in? Its architecture, pricing, or how to use it with Workers?").
- The agent stops execution and waits for the user's answer.
- When the user provides an answer, the agent combines it with the original context and proceeds to create a more specific and useful research plan.
- If a user provides a specific query, the agent bypasses the clarification step and proceeds directly to planning.
