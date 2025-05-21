import pytest
from fastapi.testclient import TestClient
from uuid import uuid4

# Fixture to provide TestClient with Convex dependency overrides
@pytest.fixture
def client_with_dummy_convex(monkeypatch):
    import types, sys

    # Patch openai to avoid loading real client
    fake_openai = types.ModuleType("openai")
    class _DummyAsyncClient:
        def __init__(self, *args, **kwargs):
            pass
        async def close(self):
            pass
        @property
        def is_closed(self):
            return False
    fake_openai.AsyncOpenAI = _DummyAsyncClient
    fake_openai.NOT_GIVEN = object()
    types_pkg = types.ModuleType("openai.types")
    responses_pkg = types.ModuleType("openai.types.responses")
    # Add placeholder classes expected by `agents` package
    class _Dummy:
        pass
    for name in [
        "Response",
        "ResponseComputerToolCall",
        "ResponseFileSearchToolCall",
        "ResponseFunctionToolCall",
        "ResponseFunctionWebSearch",
        "ResponseInputItemParam",
        "ResponseOutputItem",
        "ResponseOutputMessage",
        "ResponseOutputRefusal",
        "ResponseOutputText",
        "ResponseStreamEvent",
    ]:
        setattr(responses_pkg, name, _Dummy)
    types_pkg.responses = responses_pkg
    fake_openai.types = types_pkg
    sys.modules.setdefault("openai.types", types_pkg)
    sys.modules.setdefault("openai.types.responses", responses_pkg)
    base_client = types.ModuleType("openai._base_client")
    class _DummyWrapper:
        def __del__(self):
            pass
    base_client.AsyncHttpxClientWrapper = _DummyWrapper
    fake_openai._base_client = base_client
    sys.modules.setdefault("openai", fake_openai)
    sys.modules.setdefault("openai._base_client", base_client)

    # Provide stub supabase module so dependencies import succeeds
    fake_supabase = types.ModuleType("supabase")
    class _DummyClient:
        pass
    def _create_client(*args, **kwargs):
        return _DummyClient()
    fake_supabase.Client = _DummyClient
    fake_supabase.create_client = _create_client
    sys.modules.setdefault("supabase", fake_supabase)

    fake_gotrue = types.ModuleType("gotrue")
    types_module = types.ModuleType("gotrue.types")
    class _DummyUser:
        pass
    types_module.User = _DummyUser
    fake_gotrue.types = types_module
    sys.modules.setdefault("gotrue", fake_gotrue)
    sys.modules.setdefault("gotrue.types", types_module)

    # Provide minimal api_models used by router
    from pydantic import BaseModel

    class FolderCreateRequest(BaseModel):
        name: str

    class FolderResponse(BaseModel):
        id: str
        name: str
        created_at: str

    class FolderListResponse(BaseModel):
        folders: list[FolderResponse]

    api_models_stub = types.ModuleType("ai_tutor.api_models")
    api_models_stub.FolderCreateRequest = FolderCreateRequest
    api_models_stub.FolderResponse = FolderResponse
    api_models_stub.FolderListResponse = FolderListResponse
    sys.modules.setdefault("ai_tutor.api_models", api_models_stub)


    from fastapi import FastAPI, Request
    from ai_tutor.dependencies import get_convex_client
    from ai_tutor.auth import verify_token
    import importlib.util, pathlib
    spec = importlib.util.spec_from_file_location(
        "folders_router_module",
        pathlib.Path(__file__).resolve().parents[1] / "ai_tutor" / "routers" / "folders.py",
    )
    folders_module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(folders_module)
    folders_router = folders_module.router

    app = FastAPI()
    app.include_router(folders_router, prefix="/api/v1")

    class DummyConvex:
        def __init__(self):
            self.folders = []
        async def mutation(self, name, args):
            if name == "createFolder":
                folder = {
                    "id": str(uuid4()),
                    "name": args["name"],
                    "created_at": "2024-01-01T00:00:00Z",
                }
                self.folders.append(folder)
                return folder
            raise NotImplementedError
        async def query(self, name, args):
            if name == "listFolders":
                return self.folders
            raise NotImplementedError

    dummy = DummyConvex()

    async def _override_convex(request: Request):
        return dummy
    app.dependency_overrides[get_convex_client] = _override_convex

    async def _fake_verify_token(request: Request):
        class _User:
            id = uuid4()
        request.state.user = _User()
        return _User()
    app.dependency_overrides[verify_token] = _fake_verify_token

    yield TestClient(app), dummy
    app.dependency_overrides.clear()


def test_create_and_list_folders(client_with_dummy_convex):
    client, dummy = client_with_dummy_convex

    resp = client.post(
        "/api/v1/folders/",
        json={"name": "My Folder"},
        headers={"Authorization": "Bearer faketoken"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["name"] == "My Folder"
    folder_id = data["id"]

    resp = client.get(
        "/api/v1/folders/",
        headers={"Authorization": "Bearer faketoken"},
    )
    assert resp.status_code == 200
    folders = resp.json()["folders"]
    assert any(f["id"] == folder_id for f in folders)
