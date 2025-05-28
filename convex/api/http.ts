import { httpRouter } from "convex/server";
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { auth } from "../auth";
import { 
  requireAuth, 
  authenticateWebSocket,
  getUserIdFromPayload,
  verifyJWT 
} from "../auth";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/createFolder",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    const folder = await runMutation(internal.functions.createFolder, { name: body.name });
    return new Response(JSON.stringify(folder), { status: 201 });
  }),
});

http.route({
  path: "/listFolders",
  method: "GET",
  handler: httpAction(async ({ runQuery }) => {
    const folders = await runQuery(internal.functions.listFolders, {});
    return new Response(JSON.stringify({ folders }), { status: 200 });
  }),
});

http.route({
  path: "/renameFolder",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const { folderId, name } = await request.json();
    await runMutation(internal.functions.renameFolder, {
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
    await runMutation(internal.functions.deleteFolder, {
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
    const folder = await runQuery(internal.functions.getFolder, {
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
    const result = await runMutation(internal.functions.createSession, {
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
    const rows = await runQuery(internal.functions.getSessionMessages, {
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
    await runMutation(internal.functions.updateSessionContext, {
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
    const data = await runQuery(internal.functions.getSessionContext, {
      sessionId: sessionId as Id<'sessions'>,
    });
    if (!data) return new Response("Not found", { status: 404 });
    return new Response(JSON.stringify(data), { status: 200 });
  }),
});

http.route({
  path: "/getBoardSummary",
  method: "GET",
  handler: httpAction(async ({ runAction }, request) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400 });
    const summary = await runAction(internal.functions.getBoardSummary, {
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
    await runMutation(internal.functions.insertSnapshot, {
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
    const rows = await runQuery(internal.functions.getWhiteboardSnapshots, {
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
    const result = await runMutation(internal.functions.uploadSessionDocuments, {
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
    const result = await runQuery(internal.functions.getSessionAnalysis, {
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
    const result = await runMutation(internal.functions.deleteSession, {
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
    const result = await runQuery(internal.functions.listUserSessions, {
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
    const result = await runMutation(internal.functions.cleanupExpiredSessions, {
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
    const result = await runQuery(internal.functions.getFolderData, {
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
    const result = await runQuery(internal.functions.validateSessionContext, {
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
    await runMutation(internal.functions.logMiniQuizAttempt, body);
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/logUserSummary",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    await runMutation(internal.functions.logUserSummary, body);
    return new Response(null, { status: 200 });
  }),
});

// Enhanced authentication endpoints

http.route({
  path: "/auth/status",
  method: "GET",
  handler: httpAction(async ({ runQuery }) => {
    try {
      const status = await runQuery(internal.functions.checkAuthStatus, {});
      return new Response(JSON.stringify(status), { status: 200 });
    } catch (error) {
      return new Response(JSON.stringify({ 
        authenticated: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }), { status: 200 });
    }
  }),
});

http.route({
  path: "/auth/user",
  method: "GET",
  handler: httpAction(async ({ runQuery }) => {
    try {
      const user = await runQuery(internal.functions.getCurrentUserInfo, {});
      if (!user) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
      }
      return new Response(JSON.stringify(user), { status: 200 });
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Authentication failed' 
      }), { status: 401 });
    }
  }),
});

http.route({
  path: "/user/sessions",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    try {
      const url = new URL(request.url);
      const limit = url.searchParams.get("limit");
      const sessions = await runQuery(internal.functions.getUserSessions, {
        limit: limit ? parseInt(limit) : undefined,
      });
      return new Response(JSON.stringify({ sessions }), { status: 200 });
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to fetch sessions' 
      }), { status: 401 });
    }
  }),
});

http.route({
  path: "/user/folders",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    try {
      const url = new URL(request.url);
      const limit = url.searchParams.get("limit");
      const folders = await runQuery(internal.functions.getUserFolders, {
        limit: limit ? parseInt(limit) : undefined,
      });
      return new Response(JSON.stringify({ folders }), { status: 200 });
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to fetch folders' 
      }), { status: 401 });
    }
  }),
});

export default http;
