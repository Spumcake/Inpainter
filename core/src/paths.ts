import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function coreRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

export function inpainterHome(): string {
  const override = process.env.INPAINTER_HOME;
  if (override) {
    return resolve(override);
  }
  return join(homedir(), ".inpainter");
}

export function schemaDir(): string {
  return join(coreRoot(), "schema");
}

export function configHome(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) {
    return xdg;
  }
  return join(homedir(), ".config");
}

export function authDir(): string {
  return join(configHome(), "spumcake", "inpainter", "auth");
}

export function coreStateDir(): string {
  return join(configHome(), "spumcake", "inpainter", "core");
}

export function bootstrapDir(): string {
  return join(inpainterHome(), "bootstrap");
}

export function configDir(): string {
  return join(inpainterHome(), "config");
}

export function installsDir(): string {
  return join(inpainterHome(), "installs");
}

export function installsIncludedDir(): string {
  return join(installsDir(), "included");
}

export function installsCustomDir(): string {
  return join(installsDir(), "custom");
}

export function providersDir(): string {
  return join(inpainterHome(), "providers");
}

export function workspacesDir(): string {
  return join(inpainterHome(), "workspaces");
}

export function localWorkspaceDir(): string {
  return join(workspacesDir(), "Local");
}

export function defaultsDir(): string {
  return join(bootstrapDir(), "defaults");
}

export function cacheDir(): string {
  return join(inpainterHome(), "cache");
}

export function downloadsDir(): string {
  return join(cacheDir(), "downloads");
}

export function logsDir(): string {
  return join(inpainterHome(), "logs");
}

export function binDir(): string {
  return join(inpainterHome(), "bin");
}

export function runtimeDir(): string {
  return join(inpainterHome(), "runtime");
}

export function settingsPath(): string {
  return join(configDir(), "settings.json");
}

export function launcherRegistryPath(): string {
  return join(configDir(), "launcher.json");
}

export function skillRoots(): string[] {
  if (process.env.INPAINTER_SKILLS_DIR) {
    return [resolve(process.env.INPAINTER_SKILLS_DIR)];
  }
  return [installsIncludedDir(), installsCustomDir()];
}

export function skillRoot(): string {
  const roots = skillRoots();
  for (const root of roots) {
    if (existsSync(root)) {
      return root;
    }
  }
  return roots[0] ?? installsIncludedDir();
}
