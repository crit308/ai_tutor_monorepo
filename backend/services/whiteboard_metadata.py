from pydantic import BaseModel
from typing import Literal, List, Tuple, Optional

class Metadata(BaseModel):
    source: Literal["assistant", "user"]
    role: str  # e.g. "interactive_concept"
    semantic_tags: List[str] = []
    bbox: Tuple[float, float, float, float]  # x,y,width,height (canvas units)
    group_id: Optional[str] = None 