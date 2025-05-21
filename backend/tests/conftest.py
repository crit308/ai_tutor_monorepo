import sys, types

# Stub supabase package if missing
if 'supabase' not in sys.modules:
    supabase = types.ModuleType('supabase')
    supabase.Client = object
    def _create_client(*_a, **_k):
        return types.SimpleNamespace(table=lambda name: None)
    supabase.create_client = _create_client
    supabase.PostgrestAPIResponse = object
    sys.modules['supabase'] = supabase

# Provide minimal openai stub so dependencies can import without API key
if 'openai' not in sys.modules:
    openai = types.ModuleType('openai')
    class _DummyAsyncClient:
        def __init__(self, *a, **k):
            pass
        async def close(self):
            pass
        @property
        def is_closed(self):
            return False
    openai.AsyncOpenAI = _DummyAsyncClient  # type: ignore[attr-defined]
    base_client = types.ModuleType('openai._base_client')
    class _DummyWrapper:
        def __del__(self):
            pass
    base_client.AsyncHttpxClientWrapper = _DummyWrapper  # type: ignore[attr-defined]
    openai.NOT_GIVEN = object()
    # minimal types subpackage
    types_pkg = types.ModuleType('openai.types')
    responses_pkg = types.ModuleType('openai.types.responses')
    responses_pkg.Response = type('Response', (), {})
    responses_pkg.ResponseComputerToolCall = type('ResponseComputerToolCall', (), {})
    types_pkg.CompletionUsage = type('CompletionUsage', (), {})
    types_pkg.responses = responses_pkg
    openai.types = types_pkg
    openai._base_client = base_client
    sys.modules['openai'] = openai
    sys.modules['openai._base_client'] = base_client
    sys.modules['openai.types'] = types_pkg
    sys.modules['openai.types.responses'] = responses_pkg

# Stub pytest_asyncio if missing (used only in skipped tests)
if 'pytest_asyncio' not in sys.modules:
    sys.modules['pytest_asyncio'] = types.ModuleType('pytest_asyncio')

# Stub agent_t package for metadata tests
if 'agent_t' not in sys.modules:
    agent_t = types.ModuleType('agent_t')
    services = types.ModuleType('agent_t.services')
    wb_meta = types.ModuleType('agent_t.services.whiteboard_metadata')
    wb_meta.Metadata = type('Metadata', (), {})
    services.whiteboard_metadata = wb_meta
    agent_t.services = services
    sys.modules['agent_t'] = agent_t
    sys.modules['agent_t.services'] = services
    sys.modules['agent_t.services.whiteboard_metadata'] = wb_meta

# Stub 'agents' package used by analyzer_agent
if 'agents' not in sys.modules:
    agents_mod = types.ModuleType('agents')
    agents_mod.Runner = object
    agents_mod.RunConfig = object
    agents_mod.Agent = object
    agents_mod.ModelProvider = object
    agents_mod.FileSearchTool = object
    def _function_tool(*args, **kwargs):
        def decorator(fn):
            return fn
        return decorator
    agents_mod.function_tool = _function_tool
    tool_mod = types.ModuleType('agents.tool')
    tool_mod.FunctionTool = _function_tool
    agents_mod.tool = tool_mod
    models_mod = types.ModuleType('agents.models.openai_provider')
    models_mod.OpenAIProvider = object
    agents_mod.models = types.SimpleNamespace(openai_provider=models_mod)
    run_context_mod = types.ModuleType('agents.run_context')
    run_context_mod.RunContextWrapper = object
    sys.modules['agents'] = agents_mod
    sys.modules['agents.models.openai_provider'] = models_mod
    sys.modules['agents.tool'] = tool_mod
    sys.modules['agents.run_context'] = run_context_mod

# Stub postgrest package used for APIError
if 'postgrest.exceptions' not in sys.modules:
    postgrest_pkg = types.ModuleType('postgrest')
    exc_mod = types.ModuleType('postgrest.exceptions')
    class APIError(Exception):
        pass
    exc_mod.APIError = APIError
    postgrest_pkg.exceptions = exc_mod
    sys.modules['postgrest'] = postgrest_pkg
    sys.modules['postgrest.exceptions'] = exc_mod

# Minimal gotrue.types.User stub
if 'gotrue.types' not in sys.modules:
    gotrue = types.ModuleType('gotrue')
    types_mod = types.ModuleType('gotrue.types')
    class User: ...
    types_mod.User = User
    gotrue.types = types_mod
    sys.modules['gotrue'] = gotrue
    sys.modules['gotrue.types'] = types_mod
