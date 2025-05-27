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

## Local Node Service

A simple proxy server is provided to forward requests to your Convex deployment. Configure it by creating a `.env` file:

```
cp convex/.env.example convex/.env
```

Edit `CONVEX_URL` to point at your Convex deployment. Two helpers are provided:

* `server.ts` – HTTP proxy to Convex
* `wsServer.ts` – simple WebSocket broadcast server

Run them with a TypeScript runner:

```bash
node convex/server.ts   # listens on `PORT` (default 4000)
node convex/wsServer.ts # listens on `WS_PORT` (default 8080)
```

Ports can be overridden via environment variables.

## Document Upload Pipeline

`uploadSessionDocuments` now processes files using OpenAI vector stores.
Place uploaded documents in the directory specified by `UPLOAD_DIR` (defaults to `/tmp`).
Set `OPENAI_API_KEY` in `.env` so the backend can create vector stores and embed
the files. The mutation reads the filenames from the request, looks for the
files in `UPLOAD_DIR`, uploads them to OpenAI and records the resulting
`vector_store_id` on the associated folder.
