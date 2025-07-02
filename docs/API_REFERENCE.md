# API Reference - Agent Streaming Functions

## 📚 Overview

This document provides complete API reference for the AI Tutor's agent streaming system, including all functions, hooks, and components.

## 🔧 Backend Functions

All functions are located in `convex/agents/streaming.ts` and require authentication.

### Mutations

#### `createSessionThread`

Creates a new agent thread and links it to a learning session.

**Signature:**
```typescript
export const createSessionThread = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => string
});
```

**Parameters:**
- `sessionId` - ID of the session to create thread for

**Returns:**
- `string` - The created thread ID

**Throws:**
- `"Access denied: Session not owned by user"` - User doesn't own the session
- `"Session not found"` - Session doesn't exist

**Example:**
```typescript
const threadId = await ctx.runMutation(api.agents.streaming.createSessionThread, {
  sessionId: "session123"
});
```

#### `sendStreamingMessage`

Sends a user message to an agent thread with optimistic updates.

**Signature:**
```typescript
export const sendStreamingMessage = mutation({
  args: { 
    threadId: v.string(), 
    content: v.string() 
  },
  handler: async (ctx, args) => MessageDoc
});
```

**Parameters:**
- `threadId` - Agent thread ID
- `content` - Message content to send

**Returns:**
- `MessageDoc` - The created message document

**Side Effects:**
- Saves message to `session_messages` table for compatibility
- Schedules AI response generation
- Triggers real-time UI updates

**Example:**
```typescript
const message = await ctx.runMutation(api.agents.streaming.sendStreamingMessage, {
  threadId: "thread123",
  content: "Help me learn calculus"
});
```

#### `getOrCreateSessionThread`

Gets existing thread for session or creates new one if needed.

**Signature:**
```typescript
export const getOrCreateSessionThread = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => string
});
```

**Parameters:**
- `sessionId` - ID of the session

**Returns:**
- `string` - Thread ID (existing or newly created)

**Example:**
```typescript
const threadId = await ctx.runMutation(api.agents.streaming.getOrCreateSessionThread, {
  sessionId: "session123"
});
```

### Queries

#### `listThreadMessages`

Retrieves messages from an agent thread with streaming support and pagination.

**Signature:**
```typescript
export const listThreadMessages = query({
  args: { 
    threadId: v.string(),
    paginationOpts: paginationOptsValidator 
  },
  handler: async (ctx, args) => PaginationResult<MessageDoc>
});
```

**Parameters:**
- `threadId` - Agent thread ID
- `paginationOpts` - Pagination options
  - `numItems?: number` - Number of items per page (default: 50)
  - `cursor?: string` - Pagination cursor

**Returns:**
- `PaginationResult<MessageDoc>` - Paginated messages with streaming support
  - `page: MessageDoc[]` - Array of messages
  - `hasMore: boolean` - Whether more messages exist
  - `cursor?: string` - Next page cursor

**Example:**
```typescript
const result = useQuery(api.agents.streaming.listThreadMessages, {
  threadId: "thread123",
  paginationOpts: { numItems: 50 }
});
```

### Internal Actions

#### `generateStreamingResponse`

Generates AI response using OpenAI with streaming deltas.

**Signature:**
```typescript
export const generateStreamingResponse = internalAction({
  args: { 
    threadId: v.string(), 
    sessionId: v.optional(v.id("sessions"))
  },
  handler: async (ctx, args) => void
});
```

**Parameters:**
- `threadId` - Agent thread ID
- `sessionId` - Optional session ID for context

**Side Effects:**
- Calls OpenAI API with streaming
- Sends real-time message deltas
- Saves final response to database

**Example:**
```typescript
await ctx.scheduler.runAfter(0, internal.agents.streaming.generateStreamingResponse, {
  threadId: "thread123",
  sessionId: "session123"
});
```

## 🎣 Frontend Hooks

### `useAgentStreaming`

Main hook for agent streaming functionality.

**Signature:**
```typescript
function useAgentStreaming(sessionId: string): {
  messages: UIMessage[];
  sendMessage: (content: string) => Promise<void>;
  isLoading: boolean;
  hasMoreMessages: boolean;
  loadMoreMessages: () => void;
  threadId: string | null;
  error?: string;
}
```

**Parameters:**
- `sessionId` - Session ID to initialize streaming for

**Returns:**
- `messages` - Array of UI-formatted messages
- `sendMessage` - Function to send new messages
- `isLoading` - Whether initial loading is in progress
- `hasMoreMessages` - Whether pagination has more messages
- `loadMoreMessages` - Function to load previous messages
- `threadId` - Current agent thread ID
- `error` - Error message if initialization failed

**Example:**
```typescript
function ChatComponent({ sessionId }: { sessionId: string }) {
  const {
    messages,
    sendMessage,
    isLoading,
    hasMoreMessages,
    loadMoreMessages,
    threadId,
  } = useAgentStreaming(sessionId);

  if (isLoading) return <LoadingSpinner />;
  
  return (
    <div>
      {hasMoreMessages && (
        <button onClick={loadMoreMessages}>Load More</button>
      )}
      {messages.map(message => (
        <MessageBubble key={message.key} message={message} />
      ))}
      <ChatInput onSend={sendMessage} />
    </div>
  );
}
```

### `useStreamingText`

Hook for smooth text animation during streaming.

**Signature:**
```typescript
function useStreamingText(
  targetText: string,
  speed?: number
): string
```

**Parameters:**
- `targetText` - Full text to animate to
- `speed` - Animation speed in milliseconds (default: 30)

**Returns:**
- `string` - Current display text (animated)

**Example:**
```typescript
function MessageBubble({ message }: { message: UIMessage }) {
  const streamingText = useStreamingText(message.content, 25);
  const displayText = message.isStreaming ? streamingText : message.content;
  
  return (
    <div className="message-bubble">
      {displayText}
      {message.isStreaming && <TypingIndicator />}
    </div>
  );
}
```

## 🎨 Components

### `AgentTutorChat`

Main chat component with agent streaming support.

**Props:**
```typescript
interface AgentTutorChatProps {
  sessionId: string;
  placeholder?: string;
  className?: string;
  onMessageSent?: (message: string) => void;
  onError?: (error: string) => void;
}
```

**Example:**
```typescript
<AgentTutorChat 
  sessionId={sessionId}
  placeholder="Ask me anything about your learning..."
  className="h-full"
  onMessageSent={(msg) => console.log("Sent:", msg)}
  onError={(err) => console.error("Chat error:", err)}
/>
```

## 📝 Data Types

### `UIMessage`

UI-formatted message interface used by frontend components.

```typescript
interface UIMessage {
  key: string;
  _id: string;
  content: string;
  role: "user" | "assistant";
  _creationTime: number;
  isStreaming?: boolean;
  metadata?: {
    attachments?: Array<{
      type: string;
      url: string;
      name: string;
    }>;
    [key: string]: any;
  };
}
```

### `MessageDoc`

Database message document interface.

```typescript
interface MessageDoc {
  _id: string;
  threadId: string;
  content: string;
  role: "user" | "assistant";
  _creationTime: number;
  metadata?: Record<string, any>;
}
```

### `PaginationResult`

Pagination result structure.

```typescript
interface PaginationResult<T> {
  page: T[];
  hasMore: boolean;
  cursor?: string;
}
```

## 🔒 Authentication

All backend functions require authentication and implement ownership verification.

### Required Headers

When calling functions directly via HTTP:
```
Authorization: Bearer <convex-jwt-token>
```

### Authentication Check Pattern

```typescript
// Standard pattern used in all functions
const userId = await requireAuth(ctx);

// Verify ownership
const session = await ctx.db.get(sessionId);
if (!session || session.user_id !== userId) {
  throw new Error("Access denied: Session not owned by user");
}
```

## 🔄 Real-time Streaming

The system uses Convex's real-time capabilities for message streaming.

### Stream Configuration

Queries that support streaming must include `streamArgs`:

```typescript
return await ctx.runQuery(
  components.agent.threads.listMessages,
  { threadId: args.threadId },
  { streamArgs: { threadId: args.threadId } }
);
```

### Message Deltas

Real-time updates are delivered as message deltas, allowing for:
- Character-by-character streaming
- Smooth text animations
- Optimistic UI updates
- Real-time collaboration

## 🚨 Error Handling

### Common Error Types

| Error | Description | Solution |
|-------|-------------|----------|
| `"Authentication required"` | User not logged in | Redirect to login |
| `"Access denied: Session not owned by user"` | Ownership violation | Verify session access |
| `"Thread not found or not owned by user"` | Invalid thread access | Check thread ownership |
| `"OpenAI API error"` | AI service failure | Retry or show error message |

### Error Response Format

```typescript
interface ConvexError {
  message: string;
  code?: string;
  data?: any;
}
```

### Frontend Error Handling

```typescript
const { messages, sendMessage, error } = useAgentStreaming(sessionId);

if (error) {
  return <ErrorDisplay message={error} />;
}

try {
  await sendMessage("Hello");
} catch (err) {
  console.error("Send failed:", err.message);
  showToast("Failed to send message");
}
```

## 📊 Performance Considerations

### Pagination

- Default page size: 50 messages
- Maximum page size: 100 messages
- Use cursor-based pagination for efficiency

### Caching

- Messages are cached for 1 minute
- Streaming updates bypass cache
- Use invalidation for real-time consistency

### Rate Limiting

- 100 messages per minute per user
- 10 threads per user per hour
- OpenAI rate limits apply to AI responses

## 🔧 Configuration

### Environment Variables

Required in Convex deployment:

```
OPENAI_API_KEY=sk-...
JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...
JWKS={"keys":[...]}
SITE_URL=https://your-app.com
```

### Agent Component Setup

In `convex.config.ts`:

```typescript
import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";

const app = defineApp();
app.use(agent);

export default app;
```

## 📚 Example Implementations

### Complete Chat Implementation

```typescript
// Backend function
export const sendMessage = mutation({
  args: { threadId: v.string(), content: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await verifyThreadOwnership(ctx, args.threadId, userId);
    
    const message = await ctx.runMutation(
      components.agent.threads.sendMessage,
      { threadId: args.threadId, content: args.content, role: "user" }
    );
    
    await ctx.scheduler.runAfter(0, internal.generateResponse, {
      threadId: args.threadId
    });
    
    return message;
  }
});

// Frontend component
function ChatInterface({ sessionId }: { sessionId: string }) {
  const { messages, sendMessage, isLoading } = useAgentStreaming(sessionId);
  
  return (
    <div className="chat-container">
      <MessageList messages={messages} />
      <ChatInput 
        onSend={sendMessage} 
        disabled={isLoading}
        placeholder="Type your message..."
      />
    </div>
  );
}
```

---

This API reference provides complete documentation for developing with the AI Tutor's agent streaming system. For additional examples and guides, see the Developer Guide and implementation files. 