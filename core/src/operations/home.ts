import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { CoreError } from "../errors.ts";
import {
  binDir,
  bootstrapDir,
  cacheDir,
  configDir,
  defaultsDir,
  downloadsDir,
  inpainterHome,
  installsCustomDir,
  installsDir,
  installsIncludedDir,
  launcherRegistryPath,
  localWorkspaceDir,
  logsDir,
  providersDir,
  runtimeDir,
  settingsPath,
  workspacesDir,
} from "../paths.ts";

const WORKSPACE_INPAINTER = "pre-alpha";
const LOCAL_WORKSPACE_ID = "local";

export type HomeStatus = {
  home: string;
  bootstrap: boolean;
  settings: boolean;
  launcher: boolean;
  installs: boolean;
  providers: boolean;
  workspaces: boolean;
  localWorkspace: boolean;
  runtime: boolean;
  bin: boolean;
};

export function homeStatus(): HomeStatus {
  const home = inpainterHome();
  return {
    home,
    bootstrap: existsSync(bootstrapDir()),
    settings: existsSync(settingsPath()),
    launcher: existsSync(launcherRegistryPath()),
    installs: existsSync(installsDir()),
    providers: existsSync(providersDir()),
    workspaces: existsSync(workspacesDir()),
    localWorkspace: existsSync(join(localWorkspaceDir(), ".inpainter", "workspace.json")),
    runtime: existsSync(join(runtimeDir(), "core", "package.json")),
    bin: existsSync(join(binDir(), "inpainter-core")),
  };
}

export function homeInit(): Record<string, unknown> {
  const home = inpainterHome();
  ensureDirectories();
  const bootstrap = bootstrapDir();
  if (!existsSync(bootstrap) || !statSync(bootstrap).isDirectory()) {
    throw new CoreError(
      `bootstrap is missing at ${bootstrap}. Run the Inpainter installer before home init.`,
    );
  }

  const settings = seedJsonFile(join(bootstrap, "settings.json"), settingsPath(), rewriteSeededSettings);
  const launcher = seedJsonFile(join(bootstrap, "launcher.json"), launcherRegistryPath());
  seedMissingTree(join(bootstrap, "installs"), installsDir());
  mkdirSync(installsIncludedDir(), { recursive: true });
  mkdirSync(installsCustomDir(), { recursive: true });
  ensureLocalWorkspace();

  return {
    home,
    initialized: true,
    seeded: {
      settings,
      launcher,
    },
    localWorkspace: localWorkspaceDir(),
    status: homeStatus(),
  };
}

function ensureDirectories(): void {
  for (const directory of [
    inpainterHome(),
    binDir(),
    runtimeDir(),
    configDir(),
    bootstrapDir(),
    installsDir(),
    installsIncludedDir(),
    installsCustomDir(),
    providersDir(),
    workspacesDir(),
    cacheDir(),
    downloadsDir(),
    logsDir(),
  ]) {
    mkdirSync(directory, { recursive: true });
  }
}

function seedJsonFile(
  source: string,
  destination: string,
  decorate?: (value: Record<string, unknown>) => Record<string, unknown>,
): "created" | "existing" {
  if (existsSync(destination)) {
    readJsonObject(destination);
    return "existing";
  }
  if (!existsSync(source)) {
    throw new CoreError(`bootstrap file is missing: ${source}`);
  }
  const seeded = decorate ? decorate(readJsonObject(source)) : readJsonObject(source);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(seeded, null, 2)}\n`);
  return "created";
}

function rewriteSeededSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const panels = settings.panels;
  if (!Array.isArray(panels)) {
    return settings;
  }
  for (const panel of panels) {
    if (panel === null || typeof panel !== "object" || Array.isArray(panel)) {
      continue;
    }
    const fields = (panel as Record<string, unknown>).fields;
    if (!Array.isArray(fields)) {
      continue;
    }
    for (const field of fields) {
      if (field === null || typeof field !== "object" || Array.isArray(field)) {
        continue;
      }
      const record = field as Record<string, unknown>;
      if (record.kind !== "path") {
        continue;
      }
      if (record.id === "installsLocation") {
        record.value = installsDir();
      }
      if (record.id === "downloadsLocation") {
        record.value = downloadsDir();
      }
    }
  }
  return settings;
}

function readJsonObject(path: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new CoreError(`${path} is not valid JSON`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CoreError(`${path} is not a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function seedMissingTree(source: string, destination: string): void {
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    return;
  }
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) {
      seedMissingTree(from, to);
      continue;
    }
    if (entry.isFile() && !existsSync(to)) {
      copyFileSync(from, to);
    }
  }
}

function ensureLocalWorkspace(): void {
  const workspace = localWorkspaceDir();
  mkdirSync(workspace, { recursive: true });
  const metaDir = join(workspace, ".inpainter");
  mkdirSync(metaDir, { recursive: true });
  const manifestPath = join(metaDir, "workspace.json");
  if (existsSync(manifestPath)) {
    readJsonObject(manifestPath);
  } else {
    const now = new Date().toISOString();
    writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          id: LOCAL_WORKSPACE_ID,
          name: "Local",
          slug: "local",
          created: now,
          modified: now,
          inpainter: WORKSPACE_INPAINTER,
        },
        null,
        2,
      )}\n`,
    );
  }
  seedWorkspaceDefaults(workspace);
}

function seedWorkspaceDefaults(workspace: string): void {
  const defaults = defaultsDir();
  if (!existsSync(defaults) || !statSync(defaults).isDirectory()) {
    throw new CoreError(`Workspace defaults folder is missing: ${defaults}`);
  }
  copyDefaults(defaults, join(workspace, ".inpainter"));
}

function copyDefaults(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const name = entry.name;
    if (name === "structure.json" || name === "workspace.json") {
      continue;
    }
    const from = join(source, name);
    const to = join(destination, name);
    if (entry.isDirectory()) {
      copyDefaults(from, to);
      continue;
    }
    if (entry.isFile() && !existsSync(to)) {
      copyFileSync(from, to);
    }
  }
}
