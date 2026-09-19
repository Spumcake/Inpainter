import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { CoreError } from "../errors.ts";
import {
  binDir,
  bootstrapDir,
  cacheDir,
  configDir,
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
import { readJsonObject, validateLauncher, validateSettings } from "./validation.ts";
import { ensureLocalWorkspace, type WorkspaceRecord } from "./workspaces.ts";

export type SeedResult = "created" | "existing" | "migrated";
export type LocalWorkspaceRecord = WorkspaceRecord;

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

  const settings = seedConfigFile(
    settingsPath(),
    join(home, "settings.json"),
    join(bootstrap, "settings.json"),
    validateSettings,
    rewriteSeededSettings,
  );
  const launcher = seedConfigFile(
    launcherRegistryPath(),
    join(home, "launcher.json"),
    join(bootstrap, "launcher.json"),
    validateLauncher,
  );
  seedMissingTree(join(bootstrap, "installs"), installsDir());
  mkdirSync(installsIncludedDir(), { recursive: true });
  mkdirSync(installsCustomDir(), { recursive: true });
  const local = ensureLocalWorkspace();

  return {
    home,
    initialized: true,
    seeded: {
      settings,
      launcher,
    },
    localWorkspace: local,
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

function seedConfigFile(
  destination: string,
  legacy: string,
  bootstrapSource: string,
  validate: (value: Record<string, unknown>, path: string) => void,
  decorate?: (value: Record<string, unknown>) => Record<string, unknown>,
): SeedResult {
  if (existsSync(destination)) {
    validate(readJsonObject(destination), destination);
    return "existing";
  }
  if (existsSync(legacy)) {
    const migrated = readJsonObject(legacy);
    validate(migrated, legacy);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, `${JSON.stringify(migrated, null, 2)}\n`);
    return "migrated";
  }
  if (!existsSync(bootstrapSource)) {
    throw new CoreError(`bootstrap file is missing: ${bootstrapSource}`);
  }
  const seeded = decorate
    ? decorate(readJsonObject(bootstrapSource))
    : readJsonObject(bootstrapSource);
  validate(seeded, bootstrapSource);
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
