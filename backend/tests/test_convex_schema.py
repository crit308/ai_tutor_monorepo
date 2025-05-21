import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONVEX_DIR = ROOT / "convex"
NODE_MODULES = ROOT / "node_modules"


def compile_schema() -> Path:
    compiled_dir = CONVEX_DIR / "_compiled"
    if compiled_dir.exists():
        subprocess.run(["rm", "-rf", str(compiled_dir)], check=True)
    subprocess.run([
        str(ROOT / "frontend/node_modules/.bin/tsc"),
        "-p",
        str(CONVEX_DIR),
        "--noEmit",
        "false",
        "--outDir",
        str(compiled_dir),
    ], check=True)
    return compiled_dir / "schema.js"


def get_table_names(js_path: Path) -> set[str]:
    result = subprocess.run([
        "node",
        "-e",
        f"const s=require('{js_path}').default; console.log(JSON.stringify(Object.keys(s.tables)))"
    ], capture_output=True, text=True, check=True)
    return set(json.loads(result.stdout))


def test_schema_tables():
    js_file = compile_schema()
    tables = get_table_names(js_file)
    expected = {
        "folders",
        "sessions",
        "session_messages",
        "whiteboard_snapshots",
        "concept_events",
        "actions",
        "action_weights",
        "edge_logs",
        "embeddings_cache",
        "interaction_logs",
        "uploaded_files",
        "concept_graph",
    }
    assert expected == tables
