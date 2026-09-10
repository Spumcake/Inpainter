declare const brand: unique symbol;

type Brand<T extends string> = string & { readonly [brand]: T };

export type DocumentId = Brand<'DocumentId'>;
export type GraphId = Brand<'GraphId'>;
export type CanvasId = Brand<'CanvasId'>;
export type NodeId = Brand<'NodeId'>;
export type LayerId = Brand<'LayerId'>;
export type SublayerId = Brand<'SublayerId'>;
export type StrokeId = Brand<'StrokeId'>;

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function asDocumentId(value: string): DocumentId {
  return value as DocumentId;
}

export function asGraphId(value: string): GraphId {
  return value as GraphId;
}

export function asCanvasId(value: string): CanvasId {
  return value as CanvasId;
}

export function asNodeId(value: string): NodeId {
  return value as NodeId;
}

export function asLayerId(value: string): LayerId {
  return value as LayerId;
}

export function asSublayerId(value: string): SublayerId {
  return value as SublayerId;
}

export function asStrokeId(value: string): StrokeId {
  return value as StrokeId;
}
