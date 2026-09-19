/**
 * Folder-owned conversation/workflow history. Distinct from document session
 * (writer lease / in-memory undo) and from application session policy.
 * Runs reference production mediaId values; they do not own a second catalog.
 */
import { randomUUID } from "node:crypto";

import { CoreError } from "../errors.ts";
import { openFolderDocument, requireAttachedFolder } from "./folders.ts";
import {
  ensureSessionIndex,
  readSessionIndex,
  sessionIndexPath,
  writeSessionIndex,
  type SessionIndex,
  type SessionRecord,
} from "./sessionIndex.ts";

export type {
  SessionIndex,
  SessionRecord,
  SessionRunRecord,
} from "./sessionIndex.ts";
export { sessionIndexPath } from "./sessionIndex.ts";

export function createSession(input: {
  workspaceId: string;
  folderId: string;
  title: string;
  parentId?: string;
}): SessionRecord {
  const folder = requireAttachedFolder(input);
  const title = input.title.trim();
  if (!title) {
    throw new CoreError("Session title is required.");
  }
  const index = loadIndex(folder.path);
  const parentId = input.parentId?.trim() || null;
  if (parentId && !index.sessions.some((session) => session.id === parentId)) {
    throw new CoreError(`Parent session not found: ${parentId}`);
  }
  const session: SessionRecord = {
    id: randomUUID(),
    parentId,
    title,
    createdAt: new Date().toISOString(),
    runs: [],
  };
  writeSessionIndex(folder.path, { ...index, sessions: [...index.sessions, session] });
  return session;
}

export function listSessions(input: {
  workspaceId: string;
  folderId: string;
}): { sessions: SessionRecord[] } {
  const folder = requireAttachedFolder(input);
  return { sessions: loadIndex(folder.path).sessions };
}

export function showSession(input: {
  workspaceId: string;
  folderId: string;
  id: string;
}): SessionRecord {
  const folder = requireAttachedFolder(input);
  return requireSession(loadIndex(folder.path), input.id, sessionIndexPath(folder.path));
}

export function recordSessionOutput(input: {
  workspaceId: string;
  folderId: string;
  id: string;
  mediaId: string;
}): SessionRecord {
  const folder = requireAttachedFolder(input);
  const mediaId = input.mediaId.trim();
  if (!mediaId) {
    throw new CoreError("Asset id is required.");
  }
  const snapshot = openFolderDocument(input);
  if (!snapshot.assets.items[mediaId]) {
    throw new CoreError(`Asset not found: ${mediaId}`);
  }
  const index = loadIndex(folder.path);
  const current = requireSession(index, input.id, sessionIndexPath(folder.path));
  const updated: SessionRecord = {
    ...current,
    runs: [
      ...current.runs,
      {
        id: randomUUID(),
        status: "completed",
        outputMediaId: mediaId,
        createdAt: new Date().toISOString(),
      },
    ],
  };
  writeSessionIndex(folder.path, {
    ...index,
    sessions: index.sessions.map((session) => (session.id === updated.id ? updated : session)),
  });
  return updated;
}

function loadIndex(folderPath: string): SessionIndex {
  return readSessionIndex(folderPath) ?? ensureSessionIndex(folderPath);
}

function requireSession(index: SessionIndex, id: string, path: string): SessionRecord {
  const sessionId = id.trim();
  if (!sessionId) {
    throw new CoreError("Session id is required.");
  }
  const session = index.sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    throw new CoreError(`Session not found: ${sessionId} (${path})`);
  }
  return session;
}
