from fastapi import APIRouter, Depends, HTTPException, Request
from gotrue.types import User
from typing import List
from uuid import UUID

from ai_tutor.dependencies import get_convex_client
from ai_tutor.services.convex_client import ConvexClient
from ai_tutor.auth import verify_token
from ai_tutor.api_models import FolderCreateRequest, FolderResponse, FolderListResponse

router = APIRouter(
    prefix="/folders",
    tags=["Folder Management"],
    dependencies=[Depends(verify_token)] # Secure all folder endpoints
)

@router.post("/", response_model=None, status_code=201)
async def create_folder(
    folder_data: FolderCreateRequest,
    request: Request,
    convex: ConvexClient = Depends(get_convex_client)
):
    """Creates a new folder for the authenticated user."""
    user: User = request.state.user
    try:
        data = await convex.mutation("createFolder", {"name": folder_data.name})
        return {
            "id": str(data.get("id")),
            "name": data.get("name"),
            "created_at": str(data.get("created_at")),
        }
    except Exception as e:
        print(f"Exception creating folder: {e}")
        raise HTTPException(status_code=500, detail=f"Database error during folder creation: {str(e)}")

@router.get("/", response_model=None)
async def list_folders(
    request: Request,
    convex: ConvexClient = Depends(get_convex_client)
):
    """Lists all folders belonging to the authenticated user."""
    user: User = request.state.user
    try:
        data = await convex.query("listFolders", {})
        folders = [
            {"id": str(item.get("id")), "name": item.get("name"), "created_at": str(item.get("created_at"))}
            for item in (data or [])
        ]
        return {"folders": folders}
    except Exception as e:
        print(f"Exception listing folders: {e}")
        raise HTTPException(status_code=500, detail=f"Database error listing folders: {str(e)}")

# Add DELETE /folders/{folder_id} and PUT /folders/{folder_id} (for renaming) endpoints as needed 