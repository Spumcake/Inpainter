import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CoreError } from "../src/errors.ts";
import { createDocument, openDocument } from "../src/operations/documents.ts";
import { openEditSession } from "../src/operations/edits.ts";
import { SCHEMA_VERSION } from "../src/production/serializer.ts";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/production");

function tempDocument(name = "Editable"): string {
  const dest = mkdtempSync(join(tmpdir(), "inpainter-edits-"));
  createDocument({ path: dest, name });
  return dest;
}

describe("document edit history", () => {
  it("renames, undoes, and redoes without changing the persisted revision", () => {
    const dest = tempDocument("Original");
    const session = openEditSession({ path: dest });
    try {
    expect(session.inspect().snapshot.revision).toBe(1);
    const renamed = session.execute({ type: "project/rename", params: { name: "Renamed" } });
    expect(renamed.snapshot.name).toBe("Renamed");
    expect(renamed.snapshot.revision).toBe(1);
    expect(renamed.canUndo).toBe(true);
    expect(renamed.history).toEqual([
      expect.objectContaining({ type: "project/rename", description: "Rename project" }),
    ]);
    const undone = session.undo();
    expect(undone.snapshot.name).toBe("Original");
    expect(undone.canRedo).toBe(true);
    const redone = session.redo();
    expect(redone.snapshot.name).toBe("Renamed");
    expect(openDocument({ path: dest }).name).toBe("Original");
    const saved = session.save();
    expect(saved.snapshot.revision).toBe(2);
    expect(openDocument({ path: dest }).name).toBe("Renamed");
    } finally {
      session.close();
    }
  });

  it("adds and removes a track through undo and redo with stable ids", () => {
    const dest = tempDocument();
    const session = openEditSession({ path: dest });
    try {
    const added = session.execute({
      type: "track/add",
      params: { trackType: "video", trackId: "track-keep" },
    });
    expect(added.snapshot.project.timeline.tracks).toHaveLength(1);
    expect(added.snapshot.project.timeline.tracks[0].id).toBe("track-keep");
    session.execute({ type: "track/remove", params: { trackId: "track-keep" } });
    expect(session.inspect().snapshot.project.timeline.tracks).toHaveLength(0);
    session.undo();
    expect(session.inspect().snapshot.project.timeline.tracks[0].id).toBe("track-keep");
    session.undo();
    expect(session.inspect().snapshot.project.timeline.tracks).toHaveLength(0);
    session.redo();
    expect(session.inspect().snapshot.project.timeline.tracks[0].id).toBe("track-keep");
    } finally {
      session.close();
    }
  });

  it("rejects a duplicate track id so undo cannot remove two tracks", () => {
    const dest = tempDocument();
    const session = openEditSession({ path: dest });
    try {
      session.execute({ type: "track/add", params: { trackType: "video", trackId: "track-keep" } });
      expect(() =>
        session.execute({ type: "track/add", params: { trackType: "audio", trackId: "track-keep" } }),
      ).toThrow(/Track already exists/);
      expect(session.inspect().snapshot.project.timeline.tracks).toHaveLength(1);
      session.undo();
      expect(session.inspect().snapshot.project.timeline.tracks).toHaveLength(0);
    } finally {
      session.close();
    }
  });

  it("leaves content and history unchanged when an edit is invalid", () => {
    const dest = tempDocument("Keep");
    const session = openEditSession({ path: dest });
    try {
    const before = session.inspect();
    expect(() => session.execute({ type: "project/rename", params: { name: "" } })).toThrow(
      CoreError,
    );
    expect(() => session.execute({ type: "project/rename", params: { name: "   " } })).toThrow(
      /Project name is required/,
    );
    expect(() => session.execute({ type: "track/remove", params: { trackId: "missing" } })).toThrow(
      /Track not found/,
    );
    expect(() => session.execute({ type: "clip/add", params: {} })).toThrow(/Unknown action type/);
    const after = session.inspect();
    expect(after.snapshot.name).toBe("Keep");
    expect(after.snapshot.revision).toBe(before.snapshot.revision);
    expect(after.snapshot.project.timeline.tracks).toEqual([]);
    expect(after.history).toEqual([]);
    expect(after.canUndo).toBe(false);
    } finally {
      session.close();
    }
  });

  it("publishes frozen snapshots that cannot bypass commands", () => {
    const dest = tempDocument("Frozen");
    const session = openEditSession({ path: dest });
    try {
    const snap = session.inspect().snapshot;
    expect(Object.isFrozen(snap.project)).toBe(true);
    expect(snap.version).toBe(SCHEMA_VERSION);
    expect(() => {
      (snap.project as { name: string }).name = "Hacked";
    }).toThrow();
    expect(session.inspect().snapshot.name).toBe("Frozen");
    session.execute({ type: "project/rename", params: { name: "Through Command" } });
    expect(snap.name).toBe("Frozen");
    expect(session.inspect().snapshot.name).toBe("Through Command");
    } finally {
      session.close();
    }
  });

  it("applies executeMany sequentially and does not roll back earlier successes", () => {
    const dest = tempDocument("Batch");
    const session = openEditSession({ path: dest });
    try {
    expect(() =>
      session.executeMany([
        { type: "project/rename", params: { name: "First" } },
        { type: "track/add", params: { trackType: "video", trackId: "track-1" } },
        { type: "track/remove", params: { trackId: "missing" } },
      ]),
    ).toThrow(/Track not found/);
    const state = session.inspect();
    expect(state.snapshot.name).toBe("First");
    expect(state.snapshot.project.timeline.tracks).toHaveLength(1);
    expect(state.snapshot.project.timeline.tracks[0].id).toBe("track-1");
    expect(state.history).toHaveLength(2);
    expect(state.canUndo).toBe(true);
    } finally {
      session.close();
    }
  });

  it("preserves Motion Scene compositions when adding a track", () => {
    const dest = mkdtempSync(join(tmpdir(), "inpainter-edits-motion-"));
    cpSync(join(fixtures, "motion-scene"), dest, { recursive: true });
    const session = openEditSession({ path: dest });
    try {
    const before = session.inspect().snapshot.project.motionCompositions;
    session.execute({ type: "track/add", params: { trackType: "graphics", trackId: "track-extra" } });
    const after = session.inspect().snapshot.project;
    expect(after.motionCompositions).toEqual(before);
    expect(after.timeline.tracks.some((track) => track.id === "track-extra")).toBe(true);
    session.undo();
    expect(session.inspect().snapshot.project.motionCompositions).toEqual(before);
    expect(session.inspect().snapshot.project.timeline.tracks.some((track) => track.id === "track-extra")).toBe(
      false,
    );
    } finally {
      session.close();
    }
  });
});
