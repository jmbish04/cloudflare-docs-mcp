# Task 6: Implement RAG with Vectorize

## Objective
Implement a Retrieval-Augmented Generation (RAG) pipeline using Cloudflare Vectorize to provide the agent with contextual knowledge from curated sources, improving the accuracy and relevance of its responses.

## Context
The agent currently relies solely on its base model knowledge and the results of live tool calls. By adding a RAG pipeline, we can "ground" its responses in a trusted, internal knowledge base. The `curated_knowledge` table in D1 is intended for this purpose.

## Requirements

### 1. Create a Vectorization Service
- Create a new file: `src/data/vectorize_service.ts`.
- Create a `VectorizeService` class that takes the `VECTORIZE_INDEX` binding and the AI binding in its constructor.
- **Implement `upsertDocument` method:**
    - Signature: `async upsertDocument(document: { id: string; text: string; metadata: object }): Promise<void>`
    - Logic:
        1.  Generate embeddings for the `text` using the `DEFAULT_MODEL_EMBEDDING`.
        2.  Use `this.vectorizeIndex.upsert()` to store the vector along with the `id` and `metadata`.
- **Implement `query` method:**
    - Signature: `async query(queryText: string, topK: number = 5): Promise<VectorQueryResult[]>`
    - Logic:
        1.  Generate an embedding for the `queryText`.
        2.  Use `this.vectorizeIndex.query()` to find the most similar vectors.
        3.  Return the results, which should include the stored metadata.

### 2. Create a RAG Tool
- Create a new file: `src/tools/rag_tool.ts`.
- Create a `RAGTool` class that takes the `VectorizeService` and the `DataAccessLayer` (from Task 1) in its constructor.
- **Implement `searchKnowledgeBase` method:**
    - Signature: `async searchKnowledgeBase(query: string): Promise<string>`
    - Logic:
        1.  Call the `vectorizeService.query()` method to get a list of matching document IDs.
        2.  Use the returned IDs to fetch the full text of the documents from the `curated_knowledge` table in D1 via the DAL.
        3.  Format the retrieved documents into a single string context.
        4.  Return the formatted context string.

### 3. Integrate RAG into `ChatSessionActor`
- Open `src/actors/ChatSessionActor.ts`.
- Instantiate the `VectorizeService` and `RAGTool`.
- **Modify `handleUserQuery`:**
    - After the clarification phase but **before** the planning phase, use the `RAGTool` to search the knowledge base with the user's query.
    - Prepend the retrieved context to the prompt you send to the LLM for planning. This gives the planner context about what the agent *already knows*.

### Example `ChatSessionActor.ts` RAG Integration:

```typescript
// src/actors/ChatSessionActor.ts
import { RAGTool } from '../tools/rag_tool';
import { VectorizeService } from '../data/vectorize_service';
// ... other imports

export class ChatSessionActor {
  // ... properties
  private ragTool: RAGTool;

  constructor(state: DurableObjectState, env: Bindings) {
    // ... other instantiations
    const dal = new DataAccessLayer(env.DB);
    const vectorizeService = new VectorizeService(env.VECTORIZE_INDEX, env.AI);
    this.ragTool = new RAGTool(vectorizeService, dal);
  }

  async handleUserQuery(sessionId: string, query: string): Promise<object> {
    // ... clarification phase ...

    // === NEW: RAG PHASE ===
    this.sendUpdate('status', { message: 'Searching knowledge base...' });
    const knownContext = await this.ragTool.searchKnowledgeBase(finalQuery);
    this.sendUpdate('rag_result', { context: knownContext });
    // === END: RAG PHASE ===

    // Now, create the plan with the added context
    const planPrompt = `
      Based on the following known information, create a research plan to answer the user's query.
      Only create steps for information that is missing.

      Known Information:
      ---
      ${knownContext}
      ---

      User Query: "${finalQuery}"
    `;

    const planResult = await this.structuredResponseTool.analyzeText(ResearchPlanSchema, planPrompt);

    // ... rest of execution and synthesis logic ...
  }
}
```

### 4. Create a Knowledge Ingestion Mechanism
- The `curated_knowledge` table needs to be populated.
- In `src/index.ts`, create a new authenticated endpoint, `/api/curate`, that accepts a block of text.
- This endpoint should:
    1.  Save the text and any metadata to the `curated_knowledge` table using the DAL.
    2.  Call the `vectorizeService.upsertDocument` method to index the new knowledge.

## Acceptance Criteria
- A `VectorizeService` and `RAGTool` are implemented.
- The `ChatSessionActor` searches the Vectorize index for relevant context before generating a research plan.
- The retrieved context is passed to the planning prompt to prevent the agent from searching for information it already has.
- A `/api/curate` endpoint exists to add new documents to the D1 table and Vectorize index.
