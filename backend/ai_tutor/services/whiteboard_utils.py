"""ai_tutor/services/whiteboard_utils.py

Utility functions for whiteboard operations, such as summarizing board content.
"""

from typing import List, Dict, Any, Union
import json
import logging

log = logging.getLogger(__name__)

# Assuming CanvasObjectSpec-like structure for objects:
# obj = {
#     "id": str,
#     "metadata": {
#         "semantic_tags": List[str],
#         "bbox": Tuple[float, float, float, float] # (x,y,width,height)
#         # ... other metadata fields
#     }
#     # ... other object fields
# }

SUPPORTED_COMPRESSION_STRATEGIES = ["ids+tags+bbox"]

def compress_board_objects(
    objects: List[Dict[str, Any]], 
    strategy: str = "ids+tags+bbox"
) -> str:
    """
    Compresses a list of canvas objects into a summarized JSON string based on the strategy.

    Args:
        objects: A list of canvas objects (dicts, expected to have at least 'id' and 'metadata').
        strategy: The compression strategy to use. Currently supports "ids+tags+bbox".

    Returns:
        A JSON string representing the compressed summary of the board objects.
        Returns an empty JSON list "[]" if an unsupported strategy is given or input is empty.
    """
    if not objects:
        return json.dumps([])

    if strategy not in SUPPORTED_COMPRESSION_STRATEGIES:
        log.warning(f"Unsupported compression strategy: {strategy}. Returning empty list.")
        return json.dumps([])

    compressed_list = []
    if strategy == "ids+tags+bbox":
        for obj in objects:
            obj_id = obj.get("id")
            if not obj_id:
                log.debug("Skipping object without an ID in compression.")
                continue

            metadata = obj.get("metadata", {})
            semantic_tags = metadata.get("semantic_tags", [])
            # bbox is expected to be (x,y,width,height) as per Phase 0 Metadata schema
            bbox = metadata.get("bbox") 

            summary_obj = {"id": obj_id}
            if semantic_tags:
                summary_obj["tags"] = semantic_tags
            if bbox and isinstance(bbox, (list, tuple)) and len(bbox) == 4:
                summary_obj["bbox"] = list(bbox) # Ensure it's a list for JSON
            elif bbox:
                log.debug(f"Object {obj_id} has malformed bbox: {bbox}. Skipping bbox in summary.")
            
            compressed_list.append(summary_obj)
    
    return json.dumps(compressed_list)

# Public alias preferred in docs/plan
def board_summary(objects: List[Dict[str, Any]]) -> str:
    """Convenience wrapper using the default "ids+tags+bbox" strategy."""
    return compress_board_objects(objects, strategy="ids+tags+bbox")

# Example Usage (for testing or demonstration):
# if __name__ == "__main__":
#     example_objects = [
#         {
#             "id": "obj1", 
#             "kind": "rectangle", 
#             "x": 10, "y": 10, "width": 50, "height": 30,
#             "metadata": {
#                 "source": "assistant",
#                 "role": "diagram_component",
#                 "semantic_tags": ["math", "geometry"],
#                 "bbox": [10, 10, 50, 30]
#             }
#         },
#         {
#             "id": "obj2", 
#             "kind": "text", 
#             "x": 100, "y": 100, "width": 150, "height": 20,
#             "text": "Hello World",
#             "metadata": {
#                 "source": "user",
#                 "role": "annotation",
#                 "semantic_tags": ["greeting"],
#                 "bbox": [100, 100, 150, 20]
#             }
#         },
#         {
#             "id": "obj3",
#             "metadata": { # Missing tags and bbox
#                 "source": "assistant"
#             }
#         }
#     ]
#     summary = compress_board_objects(example_objects)
#     print("Board Summary:")
#     print(json.dumps(json.loads(summary), indent=2)) # Pretty print

#     summary_unsupported = compress_board_objects(example_objects, strategy="unknown")
#     print("\nUnsupported Strategy Summary:")
#     print(json.dumps(json.loads(summary_unsupported), indent=2))

#     summary_empty = compress_board_objects([])
#     print("\nEmpty Input Summary:")
#     print(json.dumps(json.loads(summary_empty), indent=2)) 