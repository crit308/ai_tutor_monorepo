from ai_tutor.skills import skill
from ai_tutor.api_models import ExplanationResponse
from ai_tutor.skills.explain_concept import explain_concept
from agents.run_context import RunContextWrapper
from ai_tutor.context import TutorContext

@skill(name_override="present_concepts")
async def present_concepts(
    ctx: RunContextWrapper[TutorContext],
    topic: str | None = None,
    details: str | None = None,
    concept: str | None = None,
    **unused_kwargs,
) -> ExplanationResponse:
    """Alias skill to present concepts, delegates to explain_concept."""
    # Use explain_concept under the hood
    return await explain_concept(
        ctx,
        topic=topic,
        details=details,
        concept=concept,
        **unused_kwargs
    ) 