import logging
import asyncio
from uuid import UUID
from typing import Optional # Added Optional
from ai_tutor.dependencies import get_supabase_client
from ai_tutor.agents.session_analyzer_agent import analyze_session # Import the analysis function
# Import SessionAnalysis model if needed for storage later
from ai_tutor.agents.models import SessionAnalysis

logger = logging.getLogger(__name__)

async def queue_session_analysis(session_id: UUID, user_id: UUID, folder_id: Optional[UUID]):
    """The background task to run analysis, update KB, and manage status with concurrency control."""
    logger.info(f"Background task started: Analyzing session {session_id}")
    supabase = None
    can_proceed = False # Flag to indicate if this worker claimed the session
    try:
        supabase = await get_supabase_client()

        # --- Concurrency Guard & Initial Status Update --- #
        logger.info(f"Attempting to claim session {session_id} for analysis.")
        # Atomically set status to 'processing' ONLY if it's currently NULL
        # Using .is_("analysis_status", "null") for the condition
        # Add .select("id", count="exact") if using Supabase client v2+ for better feedback on rows affected.
        # Since we might be on v1, we use the select-after-update approach recommended in the plan.
        update_resp = supabase.table("sessions") \
            .update({"analysis_status": "processing"}) \
            .eq("id", str(session_id)) \
            .is_("analysis_status", "null") \
            .execute()

        # Check if update was successful (i.e., we claimed the session)
        # Allow a very short time for the DB update to propagate before checking.
        await asyncio.sleep(0.1)
        status_check = supabase.table("sessions").select("analysis_status").eq("id", str(session_id)).single().execute()

        # Verify that the status is indeed 'processing'
        if status_check.data and status_check.data.get("analysis_status") == 'processing':
             logger.info(f"Successfully claimed session {session_id} for analysis (status set to processing).")
             can_proceed = True
        else:
             # This could happen if another worker claimed it between the update and the check,
             # or if the initial status wasn't NULL.
             actual_status = status_check.data.get("analysis_status") if status_check.data else "<unknown>"
             logger.info(f"Session {session_id} analysis already claimed or status is not NULL (current: '{actual_status}'). Worker exiting.")
             return # Exit if claimed by another worker or already processed/failed

        if not can_proceed: # Double check, should be redundant
            logger.warning(f"Exiting task for session {session_id} unexpectedly after status check.")
            return

        # --- Mark Session Ended --- #
        # Now that we've claimed it, mark it as ended.
        logger.info(f"Marking session {session_id} as ended in DB.")
        update_resp_ended = supabase.table("sessions").update({"ended_at": "now()"}).eq("id", str(session_id)).execute()
        # Log potential update issues, but proceed as analysis is the main goal now.

        # --- Call Analyzer --- #
        logger.info(f"Calling analyze_session for session {session_id}")
        text_summary, structured_analysis = await analyze_session(session_id, context=None)
        logger.info(f"Analysis completed for session {session_id}. Text Summary: {'Yes' if text_summary else 'No'}, Structured: {'Yes' if structured_analysis else 'No'}")

        # --- Success Path --- #
        # Append to KB if summary exists and folder_id is known
        if text_summary and folder_id:
            logger.info(f"Attempting to append summary to KB for folder {folder_id}")
            try:
                rpc_params = {'target_folder_id': str(folder_id), 'new_summary_text': text_summary}
                rpc_resp = supabase.rpc('append_to_knowledge_base', rpc_params).execute()
                logger.info(f"Successfully called append_to_knowledge_base RPC for folder {folder_id}. Response: {rpc_resp}")
            except Exception as rpc_err:
                logger.error(f"Failed to call append_to_knowledge_base RPC for folder {folder_id}: {rpc_err}", exc_info=True)
                 # Note: KB append failure does not mark the whole analysis as failed, but could be changed.
        elif not folder_id:
             logger.warning(f"Cannot append KB summary for session {session_id}: folder_id is unknown.")
        elif not text_summary:
             logger.warning(f"Cannot append KB summary for session {session_id}: No text summary generated by analyzer.")

        # --- (Optional) Store Structured Analysis --- #
        if structured_analysis:
            # Example: Store in a separate table or bucket (Placeholder)
            try:
                # Example: Assuming a table 'session_analysis_results' exists
                # analysis_dict = structured_analysis.model_dump(mode='json')
                # insert_resp = await supabase.table("session_analysis_results").insert(analysis_dict).execute()
                # if insert_resp.data:
                #     logger.info(f"Stored structured analysis data for session {session_id} successfully.")
                # else:
                #     logger.error(f"Failed to store structured analysis data for session {session_id}. Response: {insert_resp}")
                logger.info(f"Placeholder: Would store structured analysis data for session {session_id} here.")
            except Exception as store_err:
                logger.error(f"Failed to store structured analysis data for session {session_id}: {store_err}", exc_info=True)

        # --- Final Status Update: Success --- #
        logger.info(f"Setting analysis_status to 'success' for session {session_id}")
        supabase.table("sessions").update({"analysis_status": "success"}).eq("id", str(session_id)).execute()
        logger.info(f"Background task finished successfully for session {session_id}")

    except Exception as e:
        logger.error(f"Error during background analysis task for session {session_id}: {e}", exc_info=True)
        # --- Failure Path --- #
        if supabase and can_proceed: # Only update status if this worker successfully claimed the task
            try:
                logger.error(f"Setting analysis_status to 'failed' for session {session_id}")
                supabase.table("sessions").update({"analysis_status": "failed"}).eq("id", str(session_id)).execute()
            except Exception as update_err:
                 # Log critical failure if we can't even mark the task as failed
                 logger.critical(f"CRITICAL: Failed to update analysis_status to 'failed' for session {session_id} after error: {update_err}", exc_info=True)
        elif not supabase:
             logger.error(f"Cannot set analysis_status to 'failed' for session {session_id}: Supabase client not available.")
        else: # can_proceed is False
             logger.info(f"Error occurred for session {session_id}, but task was not claimed by this worker. Not setting status.")

    # Do not re-raise the exception, allow the background task runner to handle completion/failure based on logs. 