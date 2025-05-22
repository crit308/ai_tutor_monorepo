from __future__ import annotations
from typing import Dict, Any, Optional, TYPE_CHECKING
import json
import re # Import re for parsing KB
import uuid
from fastapi import HTTPException  # For raising errors
from uuid import UUID
import structlog

from ai_tutor.context import TutorContext, UserModelState # Import UserModelState
from pydantic import ValidationError # Import ValidationError

# Models might still be needed if SessionManager directly interacts with them.
from ai_tutor.agents.models import LessonPlan, LessonContent, Quiz, QuizFeedback, SessionAnalysis
from ai_tutor.agents.analyzer_agent import AnalysisResult # Import AnalysisResult from its correct location

# use TutorFSM directly
# from ai_tutor.fsm import TutorFSM

if TYPE_CHECKING:
    from ai_tutor.convex_client import ConvexClient

# In-memory storage for session data.
# WARNING: This will lose state on server restart and doesn't scale horizontally.
# Consider using Redis or a database for production.
_sessions: Dict[str, Dict[str, Any]] = {}

log = structlog.get_logger(__name__) # Add logger

class SessionManager:
    """Manages session state for AI Tutor sessions."""

    def __init__(self):
        """Initialize the session manager."""
        pass

    async def create_session(self, convex: "ConvexClient", user_id: UUID, folder_id: Optional[UUID] = None) -> UUID:
        """Creates a new session in Convex DB and returns its ID.

        If folder_id is provided, attempts to load initial context from the folder.
        """
        session_id = uuid.uuid4()
        print(f"Creating new session {session_id} for user {user_id}. Linked folder: {folder_id if folder_id else 'None'}")

        # --- Fetch Folder Data (Only if folder_id is provided) ---
        folder_data = None
        initial_vector_store_id = None
        initial_analysis_result = None
        folder_name = "Untitled Session" # Default name if no folder

        if folder_id:
            try:
                folder_response = await convex.get_folder(folder_id, user_id)
                if folder_response:
                    folder_data = folder_response
                    initial_vector_store_id = folder_data.get("vector_store_id")
                    kb_text = folder_data.get("knowledge_base")
                    folder_name = folder_data.get("name", folder_name) # Use folder name if available
                    print(f"Found existing folder data for folder {folder_id}. VS_ID: {initial_vector_store_id}, KB Length: {len(kb_text) if kb_text else 0}")

                    # Attempt to parse knowledge_base text into AnalysisResult
                    if kb_text:
                        try:
                            # Basic parsing logic - needs to match analyzer_agent output format
                            concepts = re.findall(r"KEY CONCEPTS:\n(.*?)\nCONCEPT DETAILS:", kb_text, re.DOTALL)
                            terms_match = re.findall(r"KEY TERMS GLOSSARY:\n(.*)", kb_text, re.DOTALL) # Assume rest is terms
                            files_match = re.findall(r"FILES:\n(.*?)\nFILE METADATA:", kb_text, re.DOTALL)

                            key_concepts = [c.strip() for c in concepts[0].strip().split('\n')] if concepts else []
                            key_terms = dict(re.findall(r"^\s*([^:]+):\s*(.+)$", terms_match[0].strip(), re.MULTILINE)) if terms_match else {}
                            file_names = [f.strip() for f in files_match[0].strip().split('\n')] if files_match else []

                            initial_analysis_result = AnalysisResult(analysis_text=kb_text, key_concepts=key_concepts, key_terms=key_terms, file_names=file_names, vector_store_id=initial_vector_store_id or "")
                            print("Successfully parsed Knowledge Base into AnalysisResult object.")
                        except Exception as parse_error:
                            print(f"Warning: Failed to parse Knowledge Base text for folder {folder_id}: {parse_error}. Proceeding without parsed analysis.")
                            initial_analysis_result = None # Ensure it's None if parsing fails

                else:
                    # This case should ideally be handled by the ownership check in the router
                    # If we reach here, it means the folder_id exists but doesn't belong to the user or doesn't exist
                    # Raising an error might be more appropriate than creating a default context silently.
                    print(f"Warning: Folder {folder_id} not found or not owned by user {user_id}. Creating session without folder context.")
                    # Consider raising HTTPException(status_code=404, detail="Folder not found or access denied") here
                    folder_id = None # Treat as if no folder_id was provided

            except Exception as folder_exc:
                print(f"Error fetching folder data for {folder_id}: {folder_exc}")
                # Decide whether to proceed with empty context or raise error
                # Proceeding with empty context for now, but clearing folder_id
                folder_id = None

        # --- Initialize TutorContext ---
        context = TutorContext(
            session_id=session_id,
            user_id=user_id,
            folder_id=folder_id, # This will be None if not provided or fetch failed
            vector_store_id=initial_vector_store_id,
            analysis_result=initial_analysis_result,
            user_model_state=UserModelState()
        )
        context_dict = context.lean_dict()

        # --- Insert into Convex ---
        try:
            created_id = await convex.create_session(user_id, context_dict, folder_id)
            print(f"Created session {created_id} for user {user_id} in Convex.")
            return created_id
        except Exception as e:
            print(f"Exception creating session {session_id}: {e}")
            raise HTTPException(status_code=500, detail=f"Database error during session creation: {e}")

    async def get_session_context(self, convex: "ConvexClient", session_id: UUID, user_id: UUID) -> Optional[TutorContext]:
        """Retrieves and validates the TutorContext from Convex."""
        log.debug("Attempting to fetch session context from DB", session_id=str(session_id), user_id=str(user_id))
        try:
            context_data = await convex.get_session_context(session_id, user_id)

            if not context_data:
                log.info("No session found or context_data is null", session_id=str(session_id), user_id=str(user_id))
                return None  # No session found for this user/id
            if not context_data:
                log.warning(
                    "Session found but context_data field is null or empty.",
                    session_id=str(session_id),
                )
                return None

            # --- Parse and Validate --- #
            try:
                if isinstance(context_data, str):
                    try:
                        context_dict = json.loads(context_data)
                    except json.JSONDecodeError as json_err:
                        log.error("Failed to decode JSON from context_data", session_id=str(session_id), error=str(json_err))
                        # Raise a specific exception or return None, depending on desired handling
                        # Raising HTTPException might be too much here, maybe a custom error or None
                        raise ValueError("Invalid JSON in context_data") from json_err
                elif isinstance(context_data, dict):
                    context_dict = context_data
                else:
                    log.error("context_data is neither string nor dict", session_id=str(session_id), type=type(context_data).__name__)
                    raise ValueError("Invalid type for context_data")

                # Ensure core IDs are present before Pydantic validation (Supabase might not guarantee this)
                context_dict.setdefault('session_id', str(session_id))
                context_dict.setdefault('user_id', str(user_id))

                # Validate with Pydantic
                ctx = TutorContext.model_validate(context_dict)
                log.info("Session context successfully fetched and validated", session_id=str(session_id))
                return ctx

            except (ValidationError, ValueError, TypeError) as validation_err:
                 log.error("Failed to validate context_data against TutorContext model", session_id=str(session_id), error=str(validation_err), exc_info=True)
                 # Return None or raise a specific error? Returning None for now.
                 # This indicates corrupted data in the DB.
                 return None # Treat validation failure as if context doesn't exist or is unusable

        except Exception as e:
            log.error(
                "Unexpected error fetching session context from Convex",
                session_id=str(session_id),
                error=str(e),
                exc_info=True,
            )
            # Propagate a generic error upwards
            raise HTTPException(status_code=500, detail=f"Internal error fetching session context")

    async def update_session_context(self, convex: "ConvexClient", session_id: UUID, user_id: UUID, context: TutorContext) -> bool:
        """Updates the TutorContext for a given session ID in Convex."""
        log.debug("Attempting to update session context in DB", session_id=str(session_id), user_id=str(user_id))
        try:
            # Serialize the *lean* TutorContext (drops bulky histories)
            context_dict = context.lean_dict()

        except (ValidationError, TypeError) as serialization_err:
             log.error("Failed to serialize TutorContext before update", session_id=str(session_id), error=str(serialization_err), exc_info=True)
             # Don't raise HTTPException here, return False or raise a specific internal error?
             # Returning False indicates update failure without stopping WebSocket potentially.
             return False

        try:
            success = await convex.update_session_context(session_id, user_id, context_dict)
            log.info("Session context updated successfully in DB", session_id=str(session_id))
            return success
        except Exception as e:
            log.error(
                "Unexpected error updating session context in Convex",
                session_id=str(session_id),
                error=str(e),
                exc_info=True,
            )
            raise HTTPException(status_code=500, detail="Internal error updating session context")

    async def update_session_context_convex(
        self,
        convex: "ConvexClient",
        session_id: UUID,
        user_id: UUID,
        context: TutorContext,
    ) -> bool:
        """Update TutorContext using Convex."""
        log.debug(
            "Attempting to update session context in Convex",
            session_id=str(session_id),
            user_id=str(user_id),
        )
        try:
            context_dict = context.lean_dict()
        except (ValidationError, TypeError) as serialization_err:
            log.error(
                "Failed to serialize TutorContext before update",
                session_id=str(session_id),
                error=str(serialization_err),
                exc_info=True,
            )
            return False

        try:
            success = await convex.update_session_context(session_id, user_id, context_dict)
            log.info("Session context updated successfully in DB", session_id=str(session_id))
            return success
        except Exception as e:
            log.error(
                "Unexpected error updating session context in Convex",
                session_id=str(session_id),
                error=str(e),
                exc_info=True,
            )
            raise HTTPException(status_code=500, detail="Internal error updating session context")

    # session_exists might not be needed if get_session handles the lookup failure

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves the state for a given session ID."""
        # Returns the raw dict. The API layer will parse this back into TutorContext.
        return _sessions.get(session_id)

    def update_session(self, session_id: str, data: Dict[str, Any]) -> bool:
        """Updates the state for a given session ID.
           Expects `data` to contain fields matching TutorContext or internal fields.
        """
        if session_id in _sessions:
            _sessions[session_id].update(data)
            return True
        return False

    def session_exists(self, session_id: str) -> bool:
        """Checks if a session exists."""
        return session_id in _sessions 