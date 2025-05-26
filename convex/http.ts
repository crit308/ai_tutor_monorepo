import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/createFolder",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    const folder = await runMutation(api.functions.createFolder, { name: body.name });
    return new Response(JSON.stringify(folder), { status: 201 });
  }),
});

http.route({
  path: "/listFolders",
  method: "GET",
  handler: httpAction(async ({ runQuery }) => {
    const folders = await runQuery(api.functions.listFolders, {});
    return new Response(JSON.stringify({ folders }), { status: 200 });
  }),
});

http.route({
  path: "/renameFolder",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const { folderId, name } = await request.json();
    await runMutation(api.functions.renameFolder, {
      folderId: folderId as Id<'folders'>,
      name,
    });
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/deleteFolder",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const { folderId } = await request.json();
    await runMutation(api.functions.deleteFolder, {
      folderId: folderId as Id<'folders'>,
    });
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/getFolder",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const folderId = url.searchParams.get("folderId");
    if (!folderId) return new Response("Missing folderId", { status: 400 });
    const folder = await runQuery(api.functions.getFolder, {
      folderId: folderId as Id<'folders'>,
    });
    if (!folder) return new Response("Not found", { status: 404 });
    return new Response(JSON.stringify(folder), { status: 200 });
  }),
});

http.route({
  path: "/createSession",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    const result = await runMutation(api.functions.createSession, {
      folderId: body.folderId as Id<'folders'> | undefined,
    });
    return new Response(JSON.stringify(result), { status: 201 });
  }),
});

http.route({
  path: "/getSessionMessages",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400 });
    const beforeTurnNo = url.searchParams.get("beforeTurnNo");
    const limit = url.searchParams.get("limit");
    const rows = await runQuery(api.functions.getSessionMessages, {
      sessionId: sessionId as Id<'sessions'>,
      beforeTurnNo: beforeTurnNo ? Number(beforeTurnNo) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return new Response(JSON.stringify(rows), { status: 200 });
  }),
});

http.route({
  path: "/updateSessionContext",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    await runMutation(api.functions.updateSessionContext, {
      sessionId: body.sessionId as Id<'sessions'>,
      context: body.context,
    });
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/getSessionContext",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400 });
    const data = await runQuery(api.functions.getSessionContext, {
      sessionId: sessionId as Id<'sessions'>,
    });
    if (!data) return new Response("Not found", { status: 404 });
    return new Response(JSON.stringify(data), { status: 200 });
  }),
});

http.route({
  path: "/getBoardSummary",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400 });
    const summary = await runQuery(api.functions.getBoardSummary, {
      sessionId: sessionId as Id<'sessions'>,
    });
    return new Response(JSON.stringify(summary), { status: 200 });
  }),
});

http.route({
  path: "/insertSnapshot",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    await runMutation(api.functions.insertSnapshot, {
      sessionId: body.sessionId as Id<'sessions'>,
      snapshotIndex: body.snapshotIndex,
      actionsJson: body.actionsJson,
    });
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/getWhiteboardSnapshots",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400 });
    const maxIndex = url.searchParams.get("maxIndex");
    const rows = await runQuery(api.functions.getWhiteboardSnapshots, {
      sessionId: sessionId as Id<'sessions'>,
      maxIndex: maxIndex ? Number(maxIndex) : undefined,
    });
    return new Response(JSON.stringify(rows), { status: 200 });
  }),
});

http.route({
  path: "/uploadSessionDocuments",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    const result = await runMutation(api.functions.uploadSessionDocuments, {
      sessionId: body.sessionId as Id<'sessions'>,
      filenames: body.filenames ?? [],
    });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/getSessionAnalysis",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400 });
    const result = await runQuery(api.functions.getSessionAnalysis, {
      sessionId: sessionId as Id<'sessions'>,
    });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

// Enhanced session management endpoints

http.route({
  path: "/deleteSession",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    const result = await runMutation(api.functions.deleteSession, {
      sessionId: body.sessionId as Id<'sessions'>,
      userId: body.userId,
    });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/listUserSessions",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    if (!userId) return new Response("Missing userId", { status: 400 });
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");
    const result = await runQuery(api.functions.listUserSessions, {
      userId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/cleanupExpiredSessions",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    const result = await runMutation(api.functions.cleanupExpiredSessions, {
      maxAgeMs: body.maxAgeMs,
    });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/getFolderData",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const folderId = url.searchParams.get("folderId");
    const userId = url.searchParams.get("userId");
    if (!folderId) return new Response("Missing folderId", { status: 400 });
    if (!userId) return new Response("Missing userId", { status: 400 });
    const result = await runQuery(api.functions.getFolderData, {
      folderId: folderId as Id<'folders'>,
      userId,
    });
    if (!result) return new Response("Not found", { status: 404 });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/validateSessionContext",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    const userId = url.searchParams.get("userId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400 });
    if (!userId) return new Response("Missing userId", { status: 400 });
    const result = await runQuery(api.functions.validateSessionContext, {
      sessionId: sessionId as Id<'sessions'>,
      userId,
    });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/logMiniQuizAttempt",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    await runMutation(api.functions.logMiniQuizAttempt, body);
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/logUserSummary",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    await runMutation(api.functions.logUserSummary, body);
    return new Response(null, { status: 200 });
  }),
});

export default http;
