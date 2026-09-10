import type { Draft } from 'immer';
import type { DocumentState } from '../types';

export type Command = {
  label: string;
  apply: (draft: Draft<DocumentState>) => void;
};

export type DispatchOptions = {
  undoable?: boolean;
};

export type ActivityEvent = {
  type: 'command' | 'undo' | 'redo';
  label: string;
  /** Forward patches applied to DocumentStore for this activity. */
  patches: import('immer').Patch[];
  /** Inverse patches (for shared History log). */
  inversePatches: import('immer').Patch[];
  /** Local History entry id when this activity appended/moved an entry. */
  entryId?: string;
};
