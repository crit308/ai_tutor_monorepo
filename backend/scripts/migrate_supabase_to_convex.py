#!/usr/bin/env python3
"""Copy data from Supabase tables into Convex tables."""
import json
import os
import subprocess
import tempfile
from typing import List, Any

from supabase import create_client

# Tables to migrate. Adjust as needed.
TABLES: List[str] = [
    "folders",
    "sessions",
    "session_messages",
    "whiteboard_snapshots",
    "uploaded_files",
    "concept_graph",
    "concept_events",
    "actions",
    "action_weights",
    "edge_logs",
    "embeddings_cache",
    "interaction_logs",
]


def export_table(client, table: str) -> List[Any]:
    """Fetch all rows from a Supabase table."""
    try:
        resp = client.table(table).select("*").execute()
        return resp.data or []
    except Exception as exc:  # pragma: no cover - best effort script
        print(f"Failed to fetch {table}: {exc}")
        return []


def import_table(convex_bin: str, table: str, data: List[Any], convex_url: str, admin_key: str) -> None:
    """Import data into a Convex table using the convex CLI."""
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as tmp:
        json.dump(data, tmp)
        tmp.flush()
        cmd = [
            convex_bin,
            "import",
            "--table",
            table,
            tmp.name,
            "--url",
            convex_url,
            "--admin-key",
            admin_key,
            "--yes",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error importing {table}: {result.stderr}")
        else:
            print(f"Imported {len(data)} rows into {table}.")
    os.unlink(tmp.name)


def main() -> None:
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
    convex_url = os.getenv("CONVEX_URL")
    admin_key = os.getenv("CONVEX_ADMIN_KEY")

    if not all([supabase_url, supabase_key, convex_url, admin_key]):
        print("Error: Missing required environment variables.")
        return

    supabase = create_client(supabase_url, supabase_key)

    convex_bin = os.path.join(
        os.path.dirname(__file__), "..", "..", "frontend", "node_modules", ".bin", "convex"
    )

    for table in TABLES:
        print(f"Migrating table: {table}")
        records = export_table(supabase, table)
        if not records:
            print(f"No records found for {table}, skipping.")
            continue
        import_table(convex_bin, table, records, convex_url, admin_key)


if __name__ == "__main__":
    main()
