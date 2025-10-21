# Task 9: Add Comprehensive Tests

## Objective
Implement a suite of tests covering unit, integration, and end-to-end (E2E) scenarios to ensure the reliability, correctness, and stability of the application.

## Context
The project currently has a placeholder test file. To ensure quality and prevent regressions, we need to build out a proper testing strategy using `vitest`.

## Requirements

### 1. Unit Tests for Tools
- For each tool in `src/tools/`, create a corresponding `.test.ts` file (e.g., `src/tools/github.test.ts`).
- **Mock Dependencies:** Use `vitest`'s mocking capabilities (`vi.mock`) to mock external dependencies like `octokit`, `cloudflare`, and `fetch`.
- **Test Each Method:** Write a unit test for each public method in the tool class.
- **Example (`github.test.ts`):**
    - Test that `searchRepositories` correctly formats the query and maps the response.
    - Test that `getFileContent` correctly decodes the Base64 content.
    - Test error handling (e.g., what happens if the GitHub API returns a 404).

### 2. Unit Tests for the Data Access Layer (DAL)
- Create `src/data/dal.test.ts`.
- **Mock the D1 Binding:** Create a mock D1 database object that simulates the `.prepare()`, `.bind()`, and `.run()`/.all()` methods.
- **Test Each DAL Method:**
    - Test that `createFeasibilityJob` calls the correct SQL query with the correct parameters.
    - Test that `getFeasibilityJob` correctly returns a job or `null`.
    - Test that the data returned from the DAL methods correctly conforms to the TypeScript interfaces.

### 3. Integration Tests for Actors
- Testing Durable Objects requires a slightly different approach. You can test the actor's methods in isolation.
- Create `src/actors/ChatSessionActor.test.ts`.
- **Mock Actor State and Env:** Instantiate the actor with mocked `state` and `env` objects.
- **Test `handleUserQuery` Logic:**
    - Provide a sample query and mock the responses from the tools (e.g., `RAGTool`, `StructuredResponseTool`).
    - Assert that the actor calls the correct tools in the correct order.
    - Assert that the actor sends the correct streaming messages over a mocked WebSocket.
    - Test the clarification loop: provide a vague query, assert the actor asks a question, provide a response, and assert the actor continues correctly.

### 4. End-to-End (E2E) Tests
- E2E tests will simulate a real user interacting with the deployed worker. These are often run in a separate test runner or script.
- Create a new directory `e2e/`.
- Create a file `e2e/chat.test.ts`.
- **Use `fetch` (or a library like `axios`) to:**
    1.  Call the `/api/health/status` endpoint to ensure the worker is live.
    2.  Send a POST request to `/api/chat` with a complex query that requires multiple tools.
    3.  Assert that the final response is well-formed and contains the expected information.
- **WebSocket E2E Test:**
    1.  Establish a WebSocket connection to `/api/chat/ws`.
    2.  Send a query.
    3.  Listen for the stream of messages (`plan_created`, `tool_start`, `tool_end`, `final_response`).
    4.  Assert that the messages arrive in the correct order and have the expected structure.

## Acceptance Criteria
- Unit tests exist for all methods in `src/tools/*` and `src/data/dal.ts`.
- Integration tests for `ChatSessionActor` validate its core logic, including the clarification loop and tool orchestration.
- E2E tests in the `e2e/` directory validate the primary user flows for both the HTTP and WebSocket chat endpoints.
- All tests pass when run with `npm test`.
- The project has a test coverage of at least 70% for the core logic (tools, DAL, actors).
