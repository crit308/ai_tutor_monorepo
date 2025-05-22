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

Edit `CONVEX_URL` to point at your Convex deployment. Then run the server with your preferred TypeScript runner:

```
node convex/server.ts
```

The server listens on the port specified in the `PORT` variable (default `4000`).
