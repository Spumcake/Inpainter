export const PROJECT_FILENAME = "project.oreel";
export const ASSET_INDEX_FILENAME = "assets.json";

export function resolveProjectFile(projectPath: string): string {
  return projectPath.endsWith(".oreel") || projectPath.endsWith(".json")
    ? projectPath
    : joinPath(projectPath, PROJECT_FILENAME);
}

export function projectDirectory(projectPath: string): string {
  return dirnamePath(resolveProjectFile(projectPath));
}

export function projectFileBase(projectPath: string): string {
  const file = resolveProjectFile(projectPath).replace(/\\/g, "/");
  const name = file.split("/").pop() ?? PROJECT_FILENAME;
  return name.replace(/\.(oreel|json)$/i, "") || "project";
}

export function assetIndexFile(projectPath: string): string {
  return joinPath(projectDirectory(projectPath), `${projectFileBase(projectPath)}.assets.json`);
}

export function commitFile(projectPath: string): string {
  return joinPath(projectDirectory(projectPath), `${projectFileBase(projectPath)}.commit.json`);
}

export function lockFile(projectPath: string): string {
  return joinPath(projectDirectory(projectPath), `${projectFileBase(projectPath)}.lock.json`);
}

export function documentStageFile(projectPath: string): string {
  return `${resolveProjectFile(projectPath)}.stage`;
}

export function assetIndexStageFile(projectPath: string): string {
  return `${assetIndexFile(projectPath)}.stage`;
}

export function legacyAssetIndexFile(projectPath: string): string {
  return joinPath(projectDirectory(projectPath), ASSET_INDEX_FILENAME);
}

export function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");
}

function dirnamePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : ".";
}
