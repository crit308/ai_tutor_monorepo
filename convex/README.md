# Convex Backend Schema

This directory defines the Convex schema for the backend.

The tables mirror the previous Supabase schema and include:

- `folders`
- `sessions`
- `session_messages`
- `whiteboard_snapshots`
- `concept_events`
- `actions`
- `action_weights`
- `edge_logs`
- `embeddings_cache`
- `interaction_logs`
- `uploaded_files`
- `concept_graph`

Indexes approximate the ones previously defined in Postgres.

## WebSocket Server

`wsServer.ts` provides a lightweight WebSocket implementation using the `ws`
library. It exposes two paths that mirror the old FastAPI endpoints:

* `/api/v1/ws/session/{sessionId}` – tutor interaction stream.
* `/ws/v2/session/{sessionId}/whiteboard` – Yjs based whiteboard channel.

Authentication tokens are validated using `@convex-dev/auth/server` and message
shapes match the previous Python implementation.
