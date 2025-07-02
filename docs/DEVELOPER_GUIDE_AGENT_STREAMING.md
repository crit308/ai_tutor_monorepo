# Developer Guide - AI Tutor Agent Streaming

## 🎯 Overview

This guide covers how to develop, extend, and maintain the AI Tutor's agent streaming system. It provides practical examples, best practices, and troubleshooting tips for developers working with Convex Agent Components.

## 🏗️ System Architecture

### High-Level Flow

```
Frontend Session → useAgentStreaming Hook → Convex Agent Functions → Agent Thread → OpenAI Streaming → Message Deltas → Real-time UI Updates
                                ↑
                       Authentication & Session Ownership
```

### Component Hierarchy

```
AgentTutorChat
├── useAgentStreaming (hook)
│   ├── useThreadMessages (agent hook)
│   ├── optimisticallySendMessage (agent hook)
│   └── useMutation (convex hook)
├── MessageBubble
│   └── useStreamingText (animation hook)
└── ChatInput
```

## 🔧 Core Functions Reference

### Backend Functions (`convex/agents/streaming.ts`)

#### `createSessionThread`
Creates a new agent thread linked to a learning session.

```typescript
export const createSessionThread = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    
    // Verify session ownership
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Access denied: Session not owned by user");
    }
    
    // Create agent thread
    const threadResult = await ctx.runMutation(
      components.agent.threads.createThread, {
        userId,
        title: `Session ${args.sessionId}`,
      }
    );
    
    // Link thread to session
    await ctx.db.patch(args.sessionId, {
      context_data: {
        ...session.context_data,
        agent_thread_id: threadResult._id,
      }
    });
    
    return threadResult._id;
  }
});
```

**Usage:**
```typescript
const threadId = await createSessionThread({ sessionId });
```

#### `listThreadMessages`
Retrieves messages with streaming support and pagination.

```typescript
export const listThreadMessages = query({
  args: { 
    threadId: v.string(),
    paginationOpts: paginationOptsValidator 
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    
    // Verify thread ownership
    await verifyThreadOwnership(ctx, args.threadId, userId);
    
    // Get messages with streaming
    return await ctx.runQuery(
      components.agent.threads.listMessages,
      {
        threadId: args.threadId,
        ...args.paginationOpts,
      },
      { streamArgs: { threadId: args.threadId } }
    );
  }
});
```

**Usage:**
```typescript
const { messages, hasMore } = useQuery(api.agents.streaming.listThreadMessages, {
  threadId,
  paginationOpts: { numItems: 50 }
});
```

#### `sendStreamingMessage`
Sends a message with optimistic updates and real-time streaming.

```typescript
export const sendStreamingMessage = mutation({
  args: { 
    threadId: v.string(), 
    content: v.string() 
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    
    // Verify ownership
    await verifyThreadOwnership(ctx, args.threadId, userId);
    
    // Send message to agent
    const messageResult = await ctx.runMutation(
      components.agent.threads.sendMessage,
      {
        threadId: args.threadId,
        content: args.content,
        role: "user" as const,
      }
    );
    
    // Also save to legacy session_messages for compatibility
    const session = await getSessionByThreadId(ctx, args.threadId);
    if (session) {
      await ctx.db.insert("session_messages", {
        session_id: session._id,
        user_id: userId,
        content: args.content,
        role: "user",
        timestamp: Date.now(),
      });
    }
    
    // Trigger AI response
    await ctx.scheduler.runAfter(0, internal.agents.streaming.generateStreamingResponse, {
      threadId: args.threadId,
      sessionId: session?._id,
    });
    
    return messageResult;
  }
});
```

**Usage:**
```typescript
const sendMessage = useMutation(api.agents.streaming.sendStreamingMessage)
  .withOptimisticUpdate(
    optimisticallySendMessage(api.agents.streaming.listThreadMessages)
  );

await sendMessage({ threadId, content: "Hello!" });
```

### Frontend Hooks

#### `useAgentStreaming`
Main hook for agent streaming functionality.

```typescript
export function useAgentStreaming(sessionId: string) {
  const [threadId, setThreadId] = useState<string | null>(null);
  
  // Initialize thread for session
  const getOrCreateThread = useMutation(api.agents.streaming.getOrCreateSessionThread);
  
  // Get messages with streaming
  const messagesData = useQuery(
    api.agents.streaming.listThreadMessages,
    threadId ? { threadId, paginationOpts: { numItems: 50 } } : "skip"
  );
  
  // Send messages with optimistic updates
  const sendMessageMutation = useMutation(api.agents.streaming.sendStreamingMessage)
    .withOptimisticUpdate(
      optimisticallySendMessage(api.agents.streaming.listThreadMessages)
    );
  
  // Convert to UI format
  const messages = useMemo(() => {
    if (!messagesData?.page) return [];
    return toUIMessages(messagesData.page);
  }, [messagesData]);
  
  const sendMessage = useCallback(async (content: string) => {
    if (!threadId) return;
    
    await sendMessageMutation({ threadId, content });
  }, [threadId, sendMessageMutation]);
  
  return {
    messages,
    sendMessage,
    isLoading: messagesData === undefined,
    hasMoreMessages: messagesData?.hasMore ?? false,
    threadId,
  };
}
```

**Usage:**
```typescript
function ChatComponent({ sessionId }: { sessionId: string }) {
  const { messages, sendMessage, isLoading } = useAgentStreaming(sessionId);
  
  return (
    <div>
      {messages.map(message => (
        <MessageBubble key={message.key} message={message} />
      ))}
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}
```

#### `useStreamingText`
Hook for smooth text animation during streaming.

```typescript
export function useStreamingText(
  targetText: string,
  speed: number = 30
): string {
  const [displayText, setDisplayText] = useState("");
  
  useEffect(() => {
    if (targetText.length <= displayText.length) {
      setDisplayText(targetText);
      return;
    }
    
    const timer = setTimeout(() => {
      setDisplayText(targetText.slice(0, displayText.length + 1));
    }, speed);
    
    return () => clearTimeout(timer);
  }, [targetText, displayText, speed]);
  
  return displayText;
}
```

**Usage:**
```typescript
function MessageBubble({ message }: { message: UIMessage }) {
  const streamingText = useStreamingText(message.content);
  const displayText = message.isStreaming ? streamingText : message.content;
  
  return (
    <div className="message-bubble">
      {displayText}
      {message.isStreaming && <TypingIndicator />}
    </div>
  );
}
```

## 🔒 Security Implementation

### Authentication Patterns

Every backend function must verify user authentication:

```typescript
// Standard auth check
const userId = await requireAuth(ctx);

// With error handling
const userId = await requireAuth(ctx).catch(() => {
  throw new Error("Authentication required");
});
```

### Session Ownership Verification

```typescript
async function verifySessionOwnership(
  ctx: any, 
  sessionId: string, 
  userId: string
) {
  const session = await ctx.db.get(sessionId);
  
  if (!session) {
    throw new Error("Session not found");
  }
  
  if (session.user_id !== userId) {
    throw new Error("Access denied: Session belongs to different user");
  }
  
  return session;
}
```

### Thread Ownership Verification

```typescript
async function verifyThreadOwnership(
  ctx: any,
  threadId: string,
  userId: string
) {
  const sessionWithThread = await ctx.db
    .query("sessions")
    .filter(q => q.and(
      q.eq(q.field("user_id"), userId),
      q.eq(q.field("context_data.agent_thread_id"), threadId)
    ))
    .first();
    
  if (!sessionWithThread) {
    throw new Error("Access denied: Thread not found or not owned by user");
  }
  
  return sessionWithThread;
}
```

## 🧪 Testing Strategies

### Unit Testing

Test individual functions with mock contexts:

```typescript
// Example test for createSessionThread
describe("createSessionThread", () => {
  it("should create thread and link to session", async () => {
    const mockCtx = {
      auth: { getUserIdentity: () => ({ subject: "user123" }) },
      db: {
        get: jest.fn().mockResolvedValue({
          _id: "session123",
          user_id: "user123",
          context_data: {}
        }),
        patch: jest.fn(),
      },
      runMutation: jest.fn().mockResolvedValue({ _id: "thread123" }),
    };
    
    const result = await createSessionThread(mockCtx, { sessionId: "session123" });
    
    expect(result).toBe("thread123");
    expect(mockCtx.db.patch).toHaveBeenCalledWith("session123", {
      context_data: {
        agent_thread_id: "thread123",
      }
    });
  });
});
```

### Integration Testing

Test the full flow using the test page:

```typescript
// Visit /agent-chat-test for manual testing
// Or create automated tests:
describe("Agent Streaming Integration", () => {
  it("should send and receive messages", async () => {
    // 1. Create session
    const session = await api.sessions.create({ ... });
    
    // 2. Initialize streaming
    const { sendMessage, messages } = useAgentStreaming(session._id);
    
    // 3. Send message
    await sendMessage("Hello AI");
    
    // 4. Verify response
    await waitFor(() => {
      expect(messages).toHaveLength(2); // user + AI response
      expect(messages[1].role).toBe("assistant");
    });
  });
});
```

## 🚀 Performance Optimization

### Message Pagination

Implement efficient pagination for large chat histories:

```typescript
const MESSAGES_PER_PAGE = 50;

export const listThreadMessages = query({
  args: { 
    threadId: v.string(),
    paginationOpts: paginationOptsValidator 
  },
  handler: async (ctx, args) => {
    // Use cursor-based pagination
    return await ctx.runQuery(
      components.agent.threads.listMessages,
      {
        threadId: args.threadId,
        numItems: args.paginationOpts.numItems || MESSAGES_PER_PAGE,
        cursor: args.paginationOpts.cursor,
      },
      { 
        streamArgs: { threadId: args.threadId },
        // Cache for performance
        cache: { ttl: 60000 } // 1 minute cache
      }
    );
  }
});
```

### Optimistic Updates

Reduce perceived latency with optimistic updates:

```typescript
const sendMessage = useMutation(api.agents.streaming.sendStreamingMessage)
  .withOptimisticUpdate(
    optimisticallySendMessage(api.agents.streaming.listThreadMessages),
    // Optimistic update function
    (currentValue, args) => {
      if (!currentValue?.page) return currentValue;
      
      const optimisticMessage = {
        _id: `temp-${Date.now()}`,
        content: args.content,
        role: "user" as const,
        _creationTime: Date.now(),
      };
      
      return {
        ...currentValue,
        page: [optimisticMessage, ...currentValue.page],
      };
    }
  );
```

## 🐛 Common Issues & Solutions

### 1. Authentication Errors

**Problem:** "Access denied: Session belongs to different user"

**Solution:**
```typescript
// Check user authentication state
const { isAuthenticated, isLoading } = useConvexAuth();

if (isLoading) return <LoadingSpinner />;
if (!isAuthenticated) return <LoginForm />;

// Proceed with authenticated component
return <AgentTutorChat sessionId={sessionId} />;
```

### 2. Thread Not Found

**Problem:** "Access denied: Thread not found or not owned by user"

**Solution:**
```typescript
// Always use getOrCreateSessionThread
const { threadId, error } = useAgentStreaming(sessionId);

if (error) {
  console.error("Thread creation failed:", error);
  return <ErrorMessage message="Failed to initialize chat" />;
}

if (!threadId) {
  return <LoadingSpinner message="Initializing chat..." />;
}
```

### 3. Messages Not Streaming

**Problem:** Messages appear all at once instead of streaming

**Solution:**
```typescript
// Ensure streamArgs is configured
export const listThreadMessages = query({
  handler: async (ctx, args) => {
    return await ctx.runQuery(
      components.agent.threads.listMessages,
      { threadId: args.threadId },
      { 
        streamArgs: { threadId: args.threadId } // Required for streaming
      }
    );
  }
});
```

## 🔮 Extension Points

### Custom Message Types

Extend the system to support different message types:

```typescript
// Define custom message interface
interface CustomMessage extends MessageDoc {
  messageType: "text" | "image" | "code" | "quiz";
  metadata?: {
    language?: string;
    difficulty?: number;
    attachments?: string[];
  };
}

// Custom message renderer
function MessageBubble({ message }: { message: CustomMessage }) {
  switch (message.messageType) {
    case "code":
      return <CodeMessage message={message} />;
    case "image":
      return <ImageMessage message={message} />;
    case "quiz":
      return <QuizMessage message={message} />;
    default:
      return <TextMessage message={message} />;
  }
}
```

### Custom AI Behaviors

Create specialized AI response handlers:

```typescript
export const generateSpecializedResponse = internalAction({
  args: { 
    threadId: v.string(), 
    sessionId: v.optional(v.id("sessions")),
    responseType: v.union(v.literal("tutor"), v.literal("quiz"), v.literal("code"))
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    
    // Get specialized system prompt
    const systemPrompt = getSystemPrompt(args.responseType, session?.subject);
    
    // Call OpenAI with specialized behavior
    const stream = openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory
      ],
      stream: true,
    });
    
    // Process streaming response
    for await (const chunk of stream) {
      // Handle specialized streaming logic
    }
  }
});
```

## 📚 Resources

### Convex Agent Documentation
- [Agent Component Overview](https://docs.convex.dev/agent)
- [Streaming Messages](https://docs.convex.dev/agent/streaming)
- [Authentication](https://docs.convex.dev/auth)

### Code Examples
- [Basic Chat Implementation](./frontend/src/components/AgentTutorChat.tsx)
- [Advanced Hooks](./frontend/src/hooks/useAgentStreaming.ts)
- [Backend Functions](./convex/agents/streaming.ts)

### Best Practices
- Always verify authentication and ownership
- Use optimistic updates for better UX
- Implement proper error handling
- Cache frequently accessed data
- Use pagination for large datasets

---

This developer guide provides the foundation for working with the AI Tutor's agent streaming system. For questions or contributions, please refer to the project's issue tracker or documentation. 