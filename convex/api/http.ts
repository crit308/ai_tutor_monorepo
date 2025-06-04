import { httpRouter } from "convex/server";
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

// Import authentication utilities from new auth modules
import { requireAuth } from "../auth/middleware";
import { auth } from "../auth";

const http = httpRouter();

// Add Convex Auth HTTP routes for authentication endpoints
auth.addHttpRoutes(http);

http.route({
  path: "/createFolder",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    const folder = await runMutation("functions:createFolder" as any, { name: body.name });
    return new Response(JSON.stringify(folder), { status: 201 });
  }),
});

http.route({
  path: "/listFolders",
  method: "GET",
  handler: httpAction(async ({ runQuery }) => {
    const folders = await runQuery("functions:listFolders" as any, {});
    return new Response(JSON.stringify({ folders }), { status: 200 });
  }),
});

http.route({
  path: "/renameFolder",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const { folderId, name } = await request.json();
    await runMutation("functions:renameFolder" as any, {
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
    await runMutation("functions:deleteFolder" as any, {
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
    const folder = await runQuery("functions:getFolder" as any, {
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
    const result = await runMutation("functions:createSession" as any, {
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
    const rows = await runQuery("functions:getSessionMessages" as any, {
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
    await runMutation("functions:updateSessionContext" as any, {
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
    const data = await runQuery("functions:getSessionContext" as any, {
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
    const summary = await runQuery("functions:getBoardSummary" as any, {
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
    await runMutation("functions:insertSnapshot" as any, {
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
    const rows = await runQuery("functions:getWhiteboardSnapshots" as any, {
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
    const result = await runMutation("functions:uploadSessionDocuments" as any, {
      sessionId: body.sessionId as Id<'sessions'>,
      files: body.files ?? [],
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
    const result = await runQuery("functions:getSessionAnalysisResults" as any, {
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
    const result = await runMutation("functions:deleteSession" as any, {
      sessionId: body.sessionId as Id<'sessions'>,
    });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/listUserSessions",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const limit = url.searchParams.get("limit");
    const result = await runQuery("functions:listUserSessions" as any, {
      limit: limit ? Number(limit) : undefined,
    });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/cleanupExpiredSessions",
  method: "POST",
  handler: httpAction(async ({ runMutation }) => {
    const result = await runMutation("functions:cleanupExpiredSessions" as any, {});
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/getFolderData",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const folderId = url.searchParams.get("folderId");
    if (!folderId) return new Response("Missing folderId", { status: 400 });
    const result = await runQuery("functions:getFolderData" as any, {
      folderId: folderId as Id<'folders'>,
    });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/validateSessionContext",
  method: "GET",
  handler: httpAction(async ({ runQuery }, request) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400 });
    const result = await runQuery("functions:validateSessionContext" as any, {
      sessionId: sessionId as Id<'sessions'>,
    });
    return new Response(JSON.stringify(result), { status: 200 });
  }),
});

http.route({
  path: "/logMiniQuizAttempt",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    await runMutation("functions:logMiniQuizAttempt" as any, body);
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/logUserSummary",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const body = await request.json();
    await runMutation("functions:logUserSummary" as any, body);
    return new Response(null, { status: 200 });
  }),
});

// Enhanced authentication endpoints

http.route({
  path: "/auth/status",
  method: "GET",
  handler: httpAction(async ({ runQuery }) => {
    try {
      const status = await runQuery("functions:checkAuthStatus" as any, {});
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
      const user = await runQuery("functions:getCurrentUserInfo" as any, {});
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
      const sessions = await runQuery("functions:getUserSessions" as any, {
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
      const folders = await runQuery("functions:getUserFolders" as any, {
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

// Legacy HTTP streaming endpoint removed - now using Convex agent streaming

export default http;
