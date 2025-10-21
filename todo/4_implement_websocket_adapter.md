# Task 4: Implement WebSocket Adapter for Chat

## Objective
Implement a WebSocket endpoint for the chat functionality to provide real-time, streaming responses from the agent.

## Context
Currently, the `/api/chat` endpoint is a standard HTTP POST request that waits for the entire agent process to complete before returning a response. This can lead to long wait times. A WebSocket connection will allow the agent to stream back its progress, including the plan, tool calls, and final synthesis, as they happen.

## Requirements

### 1. Create a WebSocket Route
- In `src/index.ts`, create a new route to handle WebSocket upgrades. A common path is `/api/chat/ws`.
- This route will be responsible for creating a `WebSocketPair` and passing one end to a Durable Object while returning the other to the client.

### Example WebSocket Upgrade Handler (`src/index.ts`):

```typescript
// src/index.ts

// ... inside the Hono app setup
app.get('/api/chat/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  // Generate a new session ID for this WebSocket connection
  const sessionId = crypto.randomUUID();
  const actor = c.env.CHAT_SESSION_ACTOR.get(c.env.CHAT_SESSION_ACTOR.idFromName(sessionId));

  // The `handleWebSocket` method will be a new method on the actor
  return actor.fetch('https://actor.local/ws', {
    headers: {
      'Upgrade': 'websocket',
    },
  });
});
```

### 2. Add WebSocket Handling to `ChatSessionActor`
- Open `src/actors/ChatSessionActor.ts`.
- The actor needs to be able to handle the WebSocket upgrade request. Hono v4's `upgradeWebSocket` is ideal, but within a DO `fetch` handler, you'll manage the `WebSocketPair` manually.
- Create a new method `handleWebSocket(serverSocket: WebSocket)` that will manage the connection.
- The actor's `fetch` method needs to detect the WebSocket upgrade path (`/ws`).

### Example `ChatSessionActor.ts` WebSocket Logic:

```typescript
// src/actors/ChatSessionActor.ts

export class ChatSessionActor {
  // ... properties
  private webSocket?: WebSocket;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      const { 0: client, 1: server } = new WebSocketPair();
      this.handleWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    // ... existing POST handler
  }

  private handleWebSocket(socket: WebSocket) {
    this.webSocket = socket;
    socket.accept();

    socket.addEventListener('message', async (event) => {
      try {
        const { query } = JSON.parse(event.data as string);
        if (query) {
          // Don't `await` this. Let it run in the background while sending updates.
          this.handleUserQuery(this.state.id.toString(), query);
        }
      } catch (e) {
        socket.send(JSON.stringify({ error: 'Invalid message format' }));
      }
    });

    socket.addEventListener('close', () => { this.webSocket = undefined; });
    socket.addEventListener('error', () => { this.webSocket = undefined; });
  }

  // Helper to send updates over the WebSocket
  private sendUpdate(type: string, payload: any) {
    if (this.webSocket) {
      this.webSocket.send(JSON.stringify({ type, payload }));
    }
  }

  async handleUserQuery(sessionId: string, query: string): Promise<object> {
    // ... existing logic ...

    // **Modify this method to send streaming updates**
    this.sendUpdate('status', { message: 'Creating research plan...' });
    const plan = /* ... generate plan ... */;
    this.sendUpdate('plan_created', { plan });

    for (const call of plan.tool_calls) {
      this.sendUpdate('tool_start', { tool: call.tool, args: call.args });
      const result = await this.executeTool(call.tool, call.args);
      this.sendUpdate('tool_end', { tool: call.tool, result });
    }

    this.sendUpdate('status', { message: 'Synthesizing final answer...' });
    const finalResponse = /* ... synthesize response ... */;
    this.sendUpdate('final_response', { response: finalResponse });

    // The final return value is less critical for WebSockets, but can be used for logging.
    return { sessionId, response: finalResponse };
  }
}
```

### 3. Update `handleUserQuery` for Streaming
- Refactor the `handleUserQuery` method in `ChatSessionActor.ts`.
- Instead of waiting for the entire process to finish, use the `sendUpdate` helper method to push messages to the client at each stage:
    - After the plan is created.
    - Before and after each tool is executed.
    - When synthesis begins.
    - When the final response is ready.

## Acceptance Criteria
- A new `/api/chat/ws` endpoint is available that successfully upgrades HTTP connections to WebSockets.
- The `ChatSessionActor` accepts and manages WebSocket connections.
- When a user sends a query over the WebSocket, the actor streams back status updates, the research plan, tool results, and the final answer as distinct messages.
- The existing `/api/chat` (HTTP POST) endpoint should still function for non-streaming clients.
