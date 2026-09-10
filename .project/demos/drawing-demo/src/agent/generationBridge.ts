import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import {
  frameResultImageRect,
  landFrameResultImage,
  readImageNaturalSizeFromSrc,
} from '../authoring';
import { strokeBelongsToSketch } from '../authoring/nodes';
import type { Node, SketchData, SketchNode } from '../authoring/types';
import type { NodeId } from '../authoring/ids';
import { putDocumentMedia } from '../settings/documentMediaBridge';
import { getDocumentIdentity } from '../settings/documentSettingsBridge';
import { isTauri } from '../tauri-env';
import { setAgentActivityPhase } from './agentActivity';
import { getGenerationWorkspace } from './generationContext';
import { upsertGenerationJob } from './generationJobs';
import type { PromptHandoff } from './promptHandoff';

const DEFAULT_T2I_PARAMS = {
  size: 'auto',
  quality: 'auto',
  n: 1,
} as const;

type RunPipeJobResult = {
  jobId?: string | null;
  status: string;
  files?: string[];
  imageUrls?: string[];
  error?: string;
};

function sketchHasStrokes(
  sketchData: SketchData | undefined,
  sketchNode: SketchNode,
  soleSketchId: NodeId | null,
): boolean {
  if (!sketchData) return false;
  for (const layer of sketchData.layers) {
    for (const sub of layer.sublayers) {
      for (const path of sub.paths) {
        if (strokeBelongsToSketch(path, sketchNode.id, soleSketchId)) {
          return true;
        }
      }
    }
  }
  return false;
}

function failJob(handoff: PromptHandoff, error: string): void {
  upsertGenerationJob({
    handoffId: handoff.id,
    nodeId: handoff.nodeRef.id,
    phase: 'failed',
    error,
  });
  setAgentActivityPhase('idle');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchImageForDocumentMedia(imageUrl: string): Promise<{
  bytesBase64: string;
  mime: string;
}> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch generated image (${response.status})`);
  }
  const blob = await response.blob();
  const mime = blob.type.trim() || 'image/png';
  const buffer = await blob.arrayBuffer();
  return {
    bytesBase64: bytesToBase64(new Uint8Array(buffer)),
    mime,
  };
}

export async function startGenerationFromHandoff(
  handoff: PromptHandoff,
): Promise<void> {
  const nodeId = handoff.nodeRef.id;

  upsertGenerationJob({
    handoffId: handoff.id,
    nodeId,
    phase: 'queued',
  });

  const prompt = handoff.prompt.trim();
  if (!prompt) {
    failJob(handoff, 'Prompt is empty');
    return;
  }

  const workspace = getGenerationWorkspace();
  if (!workspace) {
    failJob(handoff, 'Authoring workspace is not ready');
    return;
  }

  const doc = workspace.documentStore.getState();
  const node: Node | undefined = doc.nodes[handoff.nodeRef.id];
  if (!node || node.type !== handoff.nodeRef.type) {
    failJob(handoff, 'Node is no longer available');
    return;
  }

  if (node.type === 'sketch') {
    const sketchData = doc.sketches[node.canvasId];
    const peers = Object.values(doc.nodes).filter(
      (n): n is SketchNode =>
        n.type === 'sketch' && n.canvasId === node.canvasId,
    );
    const soleSketchId = peers.length === 1 ? peers[0]!.id : null;
    if (!sketchHasStrokes(sketchData, node, soleSketchId)) {
      failJob(
        handoff,
        'Sketch has no brush strokes — Canvas rendering requires ink; text-to-image is not used for empty Sketches',
      );
      return;
    }
    failJob(
      handoff,
      'Canvas rendering is not available yet — use a Frame for text-to-image',
    );
    return;
  }

  if (node.type !== 'frame') {
    failJob(handoff, 'Only Frames support text-to-image in this build');
    return;
  }

  if (!handoff.providerId) {
    failJob(handoff, 'No provider selected');
    return;
  }

  if (!isTauri()) {
    failJob(
      handoff,
      'Text-to-image requires the Tauri tray app (Pipe jobs are invoked from Rust)',
    );
    return;
  }

  setAgentActivityPhase('busy');
  upsertGenerationJob({
    handoffId: handoff.id,
    nodeId,
    phase: 'running',
  });

  const { indexerUrl, documentId } = getDocumentIdentity();
  const slugHint = handoff.name.trim() || prompt.slice(0, 48);

  try {
    const result = await invoke<RunPipeJobResult>('run_pipe_job', {
      args: {
        provider: handoff.providerId,
        request: 'text-to-image',
        params: {
          prompt,
          ...DEFAULT_T2I_PARAMS,
        },
        slugHint,
        indexerUrl: indexerUrl ?? undefined,
      },
    });

    if (result.status !== 'completed' || result.error) {
      upsertGenerationJob({
        handoffId: handoff.id,
        nodeId,
        phase: 'failed',
        error: result.error ?? `Job ended with status ${result.status}`,
        jobId: result.jobId ?? undefined,
      });
      setAgentActivityPhase('idle');
      return;
    }

    const imageUrl = result.imageUrls?.[0];
    if (!imageUrl) {
      failJob(handoff, 'Job completed but returned no image URL');
      return;
    }

    if (!indexerUrl) {
      failJob(handoff, 'Document has no indexer URL — cannot store result media');
      return;
    }

    const { bytesBase64, mime } = await fetchImageForDocumentMedia(imageUrl);
    const record = await putDocumentMedia({
      indexerUrl,
      documentId,
      bytesBase64,
      mime,
      filename: `${slugHint || 'frame-result'}.png`,
    });

    const natural = await readImageNaturalSizeFromSrc(
      convertFileSrc(record.path),
    );
    const frameNow = workspace.documentStore.getState().nodes[node.id];
    if (!frameNow || frameNow.type !== 'frame') {
      failJob(handoff, 'Frame is no longer available');
      return;
    }

    const canvasRect = frameResultImageRect(
      frameNow.crop,
      natural.width,
      natural.height,
    );

    workspace.runner.dispatch(
      landFrameResultImage({
        frameId: node.id,
        mediaId: record.mediaId,
        canvasRect,
      }),
    );

    upsertGenerationJob({
      handoffId: handoff.id,
      nodeId,
      phase: 'completed',
      imageUrl,
      jobId: result.jobId ?? undefined,
    });
    setAgentActivityPhase('finished');
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to run Pipe job';
    failJob(handoff, message);
  }
}
