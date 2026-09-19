import { access } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const FONT_FILES: ReadonlyArray<{ weight: string; file: string }> = [
  { weight: "400", file: "inter-latin-400-normal.woff2" },
  { weight: "500", file: "inter-latin-500-normal.woff2" },
  { weight: "600", file: "inter-latin-600-normal.woff2" },
  { weight: "700", file: "inter-latin-700-normal.woff2" },
  { weight: "800", file: "inter-latin-800-normal.woff2" },
];

export const REQUIRED_INTER_FILE = "inter-latin-800-normal.woff2";
const REQUIRED_SPEC = '800 112px "Inter"';

interface MotionFontFaceLike {
  load(): Promise<unknown>;
}

interface MotionFontFaceSet {
  add?(font: MotionFontFaceLike): void;
  load?(spec: string): Promise<unknown>;
  check?(spec: string): boolean;
}

interface MotionFontFaceConstructor {
  new (
    family: string,
    source: string,
    descriptors?: { weight?: string; style?: string },
  ): MotionFontFaceLike;
}

function fontUrl(fontRoot: string, file: string): string {
  const base = fontRoot.startsWith("file:") ? fontRoot : pathToFileURL(fontRoot).href;
  return new URL(file, base.endsWith("/") ? base : `${base}/`).href;
}

export async function assertInterFontFile(fontRoot: string): Promise<void> {
  try {
    await access(join(fontRoot, REQUIRED_INTER_FILE));
  } catch {
    throw new Error(`Required Inter 800 font is missing: ${REQUIRED_INTER_FILE}`);
  }
}

export async function registerPackagedFonts(fontRoot: string): Promise<void> {
  await assertInterFontFile(fontRoot);
  const FontFaceCtor = (globalThis as { FontFace?: MotionFontFaceConstructor }).FontFace;
  const fonts = (globalThis as { document?: { fonts?: MotionFontFaceSet } }).document?.fonts;
  if (!FontFaceCtor || !fonts?.add) {
    throw new Error("FontFace is unavailable; refusing fallback-font render");
  }
  for (const { weight, file } of FONT_FILES) {
    try {
      await access(join(fontRoot, file));
    } catch {
      if (file === REQUIRED_INTER_FILE) {
        throw new Error(`Required Inter 800 font is missing: ${REQUIRED_INTER_FILE}`);
      }
      continue;
    }
    const face = new FontFaceCtor("Inter", `url(${JSON.stringify(fontUrl(fontRoot, file))})`, {
      weight,
      style: "normal",
    });
    try {
      await face.load();
    } catch (error) {
      if (file === REQUIRED_INTER_FILE) {
        throw new Error(
          `Inter 800 failed to load: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      continue;
    }
    fonts.add(face);
  }
  await assertInterLoaded(fonts);
}

export async function assertInterLoaded(fonts?: MotionFontFaceSet): Promise<void> {
  const faceSet =
    fonts ?? (globalThis as { document?: { fonts?: MotionFontFaceSet } }).document?.fonts;
  if (!faceSet?.load || !faceSet.check) {
    throw new Error("FontFaceSet is unavailable; refusing fallback-font render");
  }
  try {
    await faceSet.load(REQUIRED_SPEC);
  } catch (error) {
    throw new Error(
      `Inter 800 failed to load: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!faceSet.check(REQUIRED_SPEC)) {
    throw new Error("Inter 800 failed to load; refusing fallback-font render");
  }
}
