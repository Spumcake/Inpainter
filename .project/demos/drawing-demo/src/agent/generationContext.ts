import type { AuthoringWorkspace } from '../authoring/workspace';

let workspace: AuthoringWorkspace | null = null;

export function bindGenerationWorkspace(next: AuthoringWorkspace | null): void {
  workspace = next;
}

export function getGenerationWorkspace(): AuthoringWorkspace | null {
  return workspace;
}
