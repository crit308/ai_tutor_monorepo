# from agents import function_tool # No longer used
from ai_tutor.skills import skill # Import correct decorator
# from ai_tutor.utils.agent_callers import call_quiz_teacher_evaluate # No longer used
from ai_tutor.context import TutorContext
from agents.run_context import RunContextWrapper
from ai_tutor.agents.models import QuizQuestion, QuizFeedbackItem # Import models
from ai_tutor.api_models import FeedbackResponse # Import FeedbackResponse
# from ai_tutor.errors import ToolExecutionError # Using exceptions module now
import logging
from typing import Any, Dict, List, Optional, Tuple # Added Tuple
from pydantic import BaseModel, Field, ValidationError # Added BaseModel, Field, ValidationError
from ai_tutor.exceptions import ToolInputError, ExecutorError # Added ToolInputError, ExecutorError
from ai_tutor.skills.draw_mcq_feedback import draw_mcq_feedback as draw_mcq_feedback_action  # Alias for clarity
from ai_tutor.utils.tool_helpers import invoke  # To call other skills safely
from ai_tutor.skills.update_user_model import update_user_model  # For mastery updates

logger = logging.getLogger(__name__)

class EvaluateQuizArgs(BaseModel):
    user_answer_index: int = Field(..., ge=0, description="The 0-based index of the user's selected answer.")
    question_id: Optional[str] = Field(None, description="The drawing question_id (from MCQ objects) to verify / use for feedback drawing.")

@skill
async def evaluate_quiz(ctx: RunContextWrapper[TutorContext], **kwargs) -> Tuple[FeedbackResponse, Optional[List[Dict[str, Any]]]]:
    """Evaluates the user's answer against the current QuizQuestion stored in context and generates whiteboard actions for feedback."""
    try:
        args = EvaluateQuizArgs(**kwargs)
    except ValidationError as e:
        raise ToolInputError(f"Invalid arguments for evaluate_quiz: {e}")

    user_answer_idx = args.user_answer_index
    provided_question_id = args.question_id
    logger.info(f"Evaluating quiz answer. User selected index: {user_answer_idx}. Provided question_id: {provided_question_id}")
    
    question = ctx.context.current_quiz_question
    
    if not question or not isinstance(question, QuizQuestion):
        logger.error("evaluate_quiz skill called but no valid QuizQuestion found in context.")
        # This is more of an execution state error than a tool input error
        raise ExecutorError("No valid quiz question found in context to evaluate.") 

    try:
        if not (0 <= user_answer_idx < len(question.options)):
            error_msg = f"Selected answer index ({user_answer_idx}) is out of bounds for question options (count={len(question.options)})."
            logger.error(error_msg)
            # Raise ToolInputError as it relates to the validity of the input index against the context
            raise ToolInputError(error_msg)
            
        is_correct = (user_answer_idx == question.correct_answer_index)
        selected_option = question.options[user_answer_idx]
        correct_option = question.options[question.correct_answer_index]
        
        # Prepare explanation and suggestion texts
        explanation_text = question.explanation
        improvement_text = "Consider reviewing the explanation and related concepts." if not is_correct else "Great work!"
        
        # ---- Determine drawing question_id ---- #
        context_question_id = None
        if hasattr(question, "metadata") and isinstance(question.metadata, dict):
            context_question_id = question.metadata.get("question_id")
        drawing_qid = provided_question_id or context_question_id or "q1"  # Fallback to q1 if unknown

        # --- Generate feedback drawing specs via draw_mcq_feedback --- #
        whiteboard_actions: List[Dict[str, Any]] = []
        try:
            specs: List[Dict[str, Any]] = await invoke(
                draw_mcq_feedback_action,
                ctx=ctx,
                question_id=drawing_qid,
                option_id=user_answer_idx,
                is_correct=is_correct,
                num_options=len(question.options)
            )
            
            # Add combined feedback text (explanation + suggestion) below question for better readability
            OPTION_SPACING = 40
            V_PADDING = 20
            QUESTION_WIDTH = 700
            block_height = 100 + len(question.options) * OPTION_SPACING + V_PADDING
            FEEDBACK_MARGIN_TOP = 20
            feedback_y = block_height + FEEDBACK_MARGIN_TOP
            feedback_text = f"Explanation: {explanation_text}\n\nSuggestion: {improvement_text}"
            feedback_spec = {
                "id": f"mcq-{drawing_qid}-feedback-text",
                "kind": "text",
                "x": 0,
                "y": feedback_y,
                "text": feedback_text,
                "fontSize": 16,
                "fill": "#333333",
                "width": QUESTION_WIDTH,
                "metadata": {
                    "source": "assistant",
                    "role": "mcq_feedback_text",
                    "question_id": drawing_qid,
                    "groupId": drawing_qid,
                },
            }
            specs.append(feedback_spec)
            
            # Partition specs into ADD vs UPDATE buckets
            add_specs: List[Dict[str, Any]] = []
            update_specs: List[Dict[str, Any]] = []
            for spec in specs:
                if spec.get("kind") == "text" or spec.get("kind") in ["circle", "rect", "line"]:
                    add_specs.append(spec)
                else:
                    # Convert to partial update dict (remove 'kind' key)
                    upd = {k: v for k, v in spec.items() if k != "kind"}
                    update_specs.append(upd)
            if add_specs:
                whiteboard_actions.append({"type": "ADD_OBJECTS", "objects": add_specs})
            if update_specs:
                whiteboard_actions.append({"type": "UPDATE_OBJECTS", "objects": update_specs})
            logger.info(f"draw_mcq_feedback produced {len(specs)} specs → {len(whiteboard_actions)} action(s).")
        except Exception as fb_err:
            logger.error(f"draw_mcq_feedback invoke failed: {fb_err}", exc_info=True)

        # --- Update user model via separate skill --- #
        try:
            await invoke(
                update_user_model,
                ctx=ctx,
                topic=question.related_section or "general",
                outcome="correct" if is_correct else "incorrect",
                details=f"Answered MCQ '{question.question[:50]}...' with option '{selected_option}'."
            )
        except Exception as um_err:
            logger.error(f"update_user_model failed inside evaluate_quiz: {um_err}", exc_info=True)

        # Build feedback item & response
        feedback_item = QuizFeedbackItem(
            question_index=0,
            question_text=question.question,
            user_selected_option=selected_option,
            is_correct=is_correct,
            correct_option=correct_option,
            explanation=explanation_text,
            improvement_suggestion=improvement_text
        )

        # Clear current question from context
        if ctx.context.user_model_state:
            ctx.context.user_model_state.pending_interaction_type = None
        ctx.context.current_quiz_question = None
        logger.info("Cleared current_quiz_question from context after evaluation.")

        payload = FeedbackResponse(
            feedback_items=[feedback_item],
            overall_assessment=None,
            suggested_next_step=None
        )
        return payload, (whiteboard_actions if whiteboard_actions else None)

    except ToolInputError: # Re-raise ToolInputError specifically
        raise
    except Exception as e:
        logger.error(f"Error during quiz evaluation logic: {e}", exc_info=True)
        # Wrap other internal errors in ExecutorError
        raise ExecutorError(f"Failed during quiz evaluation logic: {e}") from e 