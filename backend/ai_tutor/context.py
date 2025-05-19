from __future__ import annotations

import json
from uuid import UUID
from typing import Optional, List, Any, Dict, Literal, TYPE_CHECKING, Union
from dataclasses import is_dataclass, asdict
import asyncio

# Simplified JSONEncoder default: always return serializable types
def _custom_json_encoder_default(self, obj):
    """Custom default method for JSONEncoder to handle various non-serializable types."""
    # Handle UUIDs
    if isinstance(obj, UUID):
        return str(obj)
    # Handle Pydantic models
    if hasattr(obj, "model_dump"):
        try:
            return obj.model_dump()
        except Exception:
            pass
    # Handle dataclasses
    if is_dataclass(obj):
        try:
            return asdict(obj)
        except Exception:
            pass
    # Fallback: use string representation for anything else
    return str(obj)

# Monkey-patch the default method of json.JSONEncoder
# Now, any part of the application using standard json.dumps
# (including libraries like httpx used by the tracer) will use this logic.
json.JSONEncoder.default = _custom_json_encoder_default

from pydantic import BaseModel, ConfigDict
from pydantic import Field

# Import the moved models
from ai_tutor.core_models import UserModelState, UserConceptMastery # <--- IMPORT FROM core_models
import ai_tutor.core_models as _cm

# Use TYPE_CHECKING to prevent runtime circular imports for type hints
if TYPE_CHECKING:
    from ai_tutor.agents.models import LessonPlan, QuizQuestion, LearningObjective, FocusObjective
    from ai_tutor.agents.analyzer_agent import AnalysisResult

# --- Runtime-safe import for AnalysisResult to avoid forward-ref errors ---
try:
    from ai_tutor.agents.analyzer_agent import AnalysisResult  # noqa: F401  # Provided if module already imported
except Exception:  # Module not yet available during early imports
    class AnalysisResult(BaseModel):
        """Placeholder stub so TutorContext forward refs resolve during early imports."""
        analysis_text: str | None = None

# --- Runtime-safe imports for forward-ref models used in TutorContext ---
try:
    from ai_tutor.agents.models import LessonPlan, QuizQuestion, LearningObjective, FocusObjective  # noqa: F401
except Exception:
    class LessonPlan(BaseModel):
        pass
    class QuizQuestion(BaseModel):
        pass
    class LearningObjective(BaseModel):
        pass
    class FocusObjective(BaseModel):
        pass

class TutorContext(BaseModel):
    """Context object for an AI Tutor session."""
    # FSM state persistence for orchestrator
    state: Optional[str] = None
    # Add model_config to specify custom JSON encoders
    model_config = ConfigDict(
        json_encoders={
            UUID: str  # Tell Pydantic to serialize UUID objects as strings
        }
    )
    # user_id: User ID from Supabase Auth, can be string or UUID
    user_id: Union[str, UUID]
    session_id: UUID # Use UUID
    folder_id: Optional[UUID] = None # Link to the folder ID
    vector_store_id: Optional[str] = None
    session_goal: Optional[str] = None  # Add session_goal to store high-level session objective
    interaction_mode: Literal['chat_only', 'chat_and_whiteboard'] = 'chat_and_whiteboard' # Added interaction_mode
    uploaded_file_paths: List[str] = Field(default_factory=list)
    analysis_result: Optional['AnalysisResult'] = None # Use forward reference
    knowledge_base_path: Optional[str] = None # Add path to KB file
    lesson_plan: Optional['LessonPlan'] = None # Use forward reference
    current_quiz_question: Optional['QuizQuestion'] = None # Use forward reference
    current_focus_objective: Optional['FocusObjective'] = None # NEW: Store the current focus from Planner
    user_model_state: UserModelState = Field(default_factory=UserModelState)
    last_interaction_summary: Optional[str] = None # What did the tutor just do? What did user respond?
    current_teaching_topic: Optional[str] = None # Which topic is the Teacher actively explaining?
    whiteboard_history: List[List[Dict[str, Any]]] = Field(default_factory=list, description="History of whiteboard action lists sent to FE.")
    # Conversation history exchanged with the lean executor LLM
    history: List[Dict[str, Any]] = Field(default_factory=list, description="Conversation history for the LLM (list of {'role', 'content'} dicts)")
    # Track the last major pedagogical action taken by the tutor (for preventing loops)
    last_pedagogical_action: Optional[Literal["explained", "asked", "evaluated", "remediated"]] = Field(
        None,
        description="Tracks the last major pedagogical action taken by the tutor. Used by the executor to pick the next appropriate action."
    )
    # Add for session resume:
    last_event: Optional[dict] = None # Store the last event for session resume
    pending_interaction_type: Optional[str] = None # Store pending interaction type for resume
    # Track resource-intensive skill usage budget
    high_cost_calls: int = Field(0, description="Number of high-cost (e.g. GPT-4) skill calls in this session")
    max_high_cost_calls: int = Field(3, description="Max allowed high-cost skill calls per session")
    # Add other relevant session state as needed
    # e.g., current_lesson_progress: Optional[str] = None 
    latest_turn_no: int = Field(0, description="Monotonically increasing chat turn number for persistence layer")
    latest_snapshot_index: int = Field(0, description="Monotonically increasing whiteboard snapshot index for persistence layer")

    # -------------------------
    # Helper Utilities
    # -------------------------
    def lean_dict(self) -> Dict[str, Any]:
        """Return a representation suitable for persistence in sessions.context_data.

        Large, rapidly-growing runtime fields (chat history & whiteboard history) are
        omitted to avoid bloating the row and slowing fetches.  All other fields are
        preserved so the tutor can resume cleanly on reconnect.
        """
        data = self.model_dump(mode="json")
        # Remove high-volume fields – they are now stored in dedicated tables.
        data.pop("history", None)
        data.pop("whiteboard_history", None)
        return data

# Utility helper to check if a concept is mastered
def is_mastered(c: UserConceptMastery) -> bool:
    """Return true if mastery probability > 0.8 and confidence (observations) >= 5."""
    return c.mastery > 0.8 and c.confidence >= 5 

# --- Ensure forward references are resolved at import time ---

# --- Resolve forward references after stubs are defined ---
TutorContext.model_rebuild()

# Ensure core_models has references to stubbed classes for forward resolution
_cm.__dict__.setdefault('LearningObjective', LearningObjective)
_cm.__dict__.setdefault('LessonPlan', LessonPlan)
_cm.__dict__.setdefault('QuizQuestion', QuizQuestion)
_cm.__dict__.setdefault('FocusObjective', FocusObjective)
_cm.__dict__.setdefault('AnalysisResult', AnalysisResult)

# Rebuild UserModelState after injecting stubs
_cm.UserModelState.model_rebuild() 