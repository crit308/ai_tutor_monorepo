/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as agents_actions from "../agents/actions.js";
import type * as agents_analyzerAgent from "../agents/analyzerAgent.js";
import type * as agents_base from "../agents/base.js";
import type * as agents_index from "../agents/index.js";
import type * as agents_plannerAgent from "../agents/plannerAgent.js";
import type * as agents_registry from "../agents/registry.js";
import type * as agents_sessionAnalyzerAgent from "../agents/sessionAnalyzerAgent.js";
import type * as agents_tests from "../agents/tests.js";
import type * as agents_types from "../agents/types.js";
import type * as api_endpoints from "../api/endpoints.js";
import type * as api_http from "../api/http.js";
import type * as auth_config from "../auth/config.js";
import type * as auth_index from "../auth/index.js";
import type * as auth_middleware from "../auth/middleware.js";
import type * as auth_websocket from "../auth/websocket.js";
import type * as core_config from "../core/config.js";
import type * as core_documentProcessor from "../core/documentProcessor.js";
import type * as core_fileUploadActions from "../core/fileUploadActions.js";
import type * as core_fileUploadManager from "../core/fileUploadManager.js";
import type * as core_index from "../core/index.js";
import type * as core_migration from "../core/migration.js";
import type * as core_serviceUtils from "../core/serviceUtils.js";
import type * as core_sessionManager from "../core/sessionManager.js";
import type * as core_utils from "../core/utils.js";
import type * as database_analytics from "../database/analytics.js";
import type * as database_concepts from "../database/concepts.js";
import type * as database_folders from "../database/folders.js";
import type * as database_index from "../database/index.js";
import type * as database_optimization from "../database/optimization.js";
import type * as database_sessions from "../database/sessions.js";
import type * as database_whiteboard from "../database/whiteboard.js";
import type * as functions from "../functions.js";
import type * as http from "../http.js";
import type * as jobs_background from "../jobs/background.js";
import type * as jobs_crons from "../jobs/crons.js";
import type * as jobs_index from "../jobs/index.js";
import type * as websocket_auth from "../websocket/auth.js";
import type * as websocket_index from "../websocket/index.js";
import type * as websocket_tutor from "../websocket/tutor.js";
import type * as websocket_tutorWs from "../websocket/tutorWs.js";
import type * as websocket_wsAuth from "../websocket/wsAuth.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "agents/actions": typeof agents_actions;
  "agents/analyzerAgent": typeof agents_analyzerAgent;
  "agents/base": typeof agents_base;
  "agents/index": typeof agents_index;
  "agents/plannerAgent": typeof agents_plannerAgent;
  "agents/registry": typeof agents_registry;
  "agents/sessionAnalyzerAgent": typeof agents_sessionAnalyzerAgent;
  "agents/tests": typeof agents_tests;
  "agents/types": typeof agents_types;
  "api/endpoints": typeof api_endpoints;
  "api/http": typeof api_http;
  "auth/config": typeof auth_config;
  "auth/index": typeof auth_index;
  "auth/middleware": typeof auth_middleware;
  "auth/websocket": typeof auth_websocket;
  "core/config": typeof core_config;
  "core/documentProcessor": typeof core_documentProcessor;
  "core/fileUploadActions": typeof core_fileUploadActions;
  "core/fileUploadManager": typeof core_fileUploadManager;
  "core/index": typeof core_index;
  "core/migration": typeof core_migration;
  "core/serviceUtils": typeof core_serviceUtils;
  "core/sessionManager": typeof core_sessionManager;
  "core/utils": typeof core_utils;
  "database/analytics": typeof database_analytics;
  "database/concepts": typeof database_concepts;
  "database/folders": typeof database_folders;
  "database/index": typeof database_index;
  "database/optimization": typeof database_optimization;
  "database/sessions": typeof database_sessions;
  "database/whiteboard": typeof database_whiteboard;
  functions: typeof functions;
  http: typeof http;
  "jobs/background": typeof jobs_background;
  "jobs/crons": typeof jobs_crons;
  "jobs/index": typeof jobs_index;
  "websocket/auth": typeof websocket_auth;
  "websocket/index": typeof websocket_index;
  "websocket/tutor": typeof websocket_tutor;
  "websocket/tutorWs": typeof websocket_tutorWs;
  "websocket/wsAuth": typeof websocket_wsAuth;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
