import time
import asyncio
from ai_tutor.dependencies import SUPABASE_CLIENT
from openai.types import CompletionUsage
from ai_tutor.context import TutorContext
from functools import wraps
from ai_tutor.metrics import TOKENS_TOTAL, TOOL_LATENCY

# --- Background queue for Supabase writes ---
def enqueue(table: str, data: dict):
    if SUPABASE_CLIENT:
        async def write():
            SUPABASE_CLIENT.table(table).insert(data).execute()
        # Fire and forget
        asyncio.create_task(write())

def log_tool(fn):
    """
    Decorator that measures latency and writes an edge_logs row,
    *without* destroying the function_tool metadata.
    """
    @wraps(fn)
    async def wrapper(*args, **kwargs):
        start = time.perf_counter()
        res   = await fn(*args, **kwargs)
        ms    = int((time.perf_counter()-start)*1000)
        ctx   = args[0]               # every tool receives ctx first
        duration = time.perf_counter() - start
        # --- Prometheus metrics ---
        tool_name = fn.__name__
        TOOL_LATENCY.labels(tool_name=tool_name).observe(duration)
        # Assume ctx holds last token info from Agents‑SDK callbacks
        TOKENS_TOTAL.labels(model=getattr(ctx, "last_model", "n/a"), phase="tool").inc(
            getattr(ctx, "last_token_count", 0)
        )
        if SUPABASE_CLIENT:
            usage = getattr(res, "usage", None)
            # Determine session and user IDs from context
            sess_id = None
            user_id = None
            if hasattr(ctx, "context") and hasattr(ctx.context, "session_id"):
                sess_id = ctx.context.session_id
                user_id = ctx.context.user_id
            else:
                sess_id = getattr(ctx, "session_id", None)
                user_id = getattr(ctx, "user_id", None)
            
            # --- NEW: Get agent version (placeholder) ---
            # TODO: Find a better way to get the agent version dynamically
            agent_version = "Tutor" # Hardcoded based on tutor_agent_factory.py
            # --- END NEW ---

            enqueue("edge_logs", {
                "session_id": str(sess_id) if sess_id is not None else None,
                "user_id": str(user_id) if user_id is not None else None,
                "tool": fn.__name__,
                "latency_ms": ms, # Original tool latency
                "turn_latency_ms": ms, # Using tool latency as turn_latency_ms for now <--- NEW
                "prompt_tokens": getattr(usage, "prompt_tokens", None),
                "completion_tokens": getattr(usage, "completion_tokens", None),
                # Optional trace ID
                "trace_id": getattr(ctx, "trace_id", None),
                "agent_version": agent_version # <--- NEW
            })
            # Persist context after every successful tool (still sync)
            if hasattr(ctx, "context") and isinstance(ctx.context, TutorContext):
                # Store updated context in the 'context_data' JSONB column
                SUPABASE_CLIENT.table("sessions").update({
                    "context_data": ctx.context.model_dump(mode='json')
                }).eq("id", str(ctx.context.session_id)).eq("user_id", str(ctx.context.user_id)).execute()
        return res
    # ✨ copy the JSON schema generated by @function_tool
    if hasattr(fn, "__ai_function_spec__"):
        wrapper.__ai_function_spec__ = fn.__ai_function_spec__
    return wrapper 