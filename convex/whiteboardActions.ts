"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { createClient } from './redis';
import * as Y from '../frontend/node_modules/yjs';

const REDIS_KEY_PREFIX = 'yjs:snapshot:';

export const getBoardSummary = action({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    // Verify session access through query
    const session = await ctx.runQuery(api.functions.getSession, { sessionId });
    if (!session) {
      throw new Error("Session not found");
    }

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const client = createClient({ url: redisUrl });
    await client.connect();
    const redisKey = `${REDIS_KEY_PREFIX}${sessionId}`;
    const snapshot = (await client.getBuffer(redisKey)) as Buffer | null;
    await client.quit();

    if (!snapshot) {
      return {
        counts: { by_kind: {}, by_owner: {} },
        learner_question_tags: [],
        concept_clusters: [],
        ephemeralSummary: {
          activeHighlights: 0,
          activeQuestionTags: [],
          recentPointer: null,
        },
      };
    }

    const ydoc = new Y.Doc();
    try {
      Y.applyUpdate(ydoc, new Uint8Array(snapshot));
    } catch (err) {
      return { error: 'failed_to_decode_snapshot', detail: String(err) };
    }

    const objMap = ydoc.getMap<any>('objects');
    const objects = Array.from(objMap.values()) as any[];
    const byKind: Record<string, number> = {};
    const byOwner: Record<string, number> = {};
    const learnerTags: any[] = [];
    const conceptBoxes: Record<string, Array<[number, number, number, number]>> = {};

    for (const spec of objects) {
      const kind = spec?.kind ?? 'unknown';
      const owner = spec?.metadata?.source ?? 'unknown';
      byKind[kind] = (byKind[kind] || 0) + 1;
      byOwner[owner] = (byOwner[owner] || 0) + 1;

      const md = spec?.metadata ?? {};
      if (md.role === 'question_tag') {
        learnerTags.push({ id: spec.id, x: spec.x, y: spec.y, meta: md });
      }
      const concept = md.concept;
      if (concept) {
        const x = Number(spec.x ?? 0);
        const y = Number(spec.y ?? 0);
        const w = Number(spec.width ?? 0);
        const h = Number(spec.height ?? 0);
        (conceptBoxes[concept] ||= []).push([x, y, x + w, y + h]);
      }
    }

    const conceptClusters = Object.entries(conceptBoxes).map(([concept, boxes]) => {
      const minX = Math.min(...boxes.map((b) => b[0]));
      const minY = Math.min(...boxes.map((b) => b[1]));
      const maxX = Math.max(...boxes.map((b) => b[2]));
      const maxY = Math.max(...boxes.map((b) => b[3]));
      return { concept, bbox: [minX, minY, maxX, maxY], count: boxes.length };
    });

    const ephMap = ydoc.getMap<any>('ephemeral');
    const ephObjs = Array.from(ephMap.values()) as any[];
    const activeHighlights = ephObjs.filter((s) => s.kind === 'highlight_stroke').length;
    const activeQuestionTags = ephObjs
      .filter((s) => s.kind === 'question_tag')
      .map((s) => ({ id: s.id, linkedObjectId: s.metadata?.linkedObjectId }));
    let recentPointer: any = null;
    const pings = ephObjs.filter((s) => s.kind === 'pointer_ping');
    if (pings.length > 0) {
      const latest = pings.reduce((a, b) =>
        (a.metadata?.expiresAt || 0) > (b.metadata?.expiresAt || 0) ? a : b
      );
      recentPointer = { x: latest.x, y: latest.y, meta: latest.metadata };
    }

    return {
      counts: { by_kind: byKind, by_owner: byOwner },
      learner_question_tags: learnerTags,
      concept_clusters: conceptClusters,
      ephemeralSummary: {
        activeHighlights,
        activeQuestionTags,
        recentPointer,
      },
    };
  },
}); 