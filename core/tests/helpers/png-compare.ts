import { PNG } from "pngjs";

export type DecodedPng = {
  width: number;
  height: number;
  data: Buffer;
};

export type PngCompareResult = {
  width: number;
  height: number;
  maxAbs: number;
  meanAbs: number;
  opaqueFromZero: number;
};

export function pngSize(bytes: Buffer | Uint8Array): { width: number; height: number } {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (
    buf.length < 24 ||
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47
  ) {
    throw new Error("Not a PNG");
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function decodePng(bytes: Buffer | Uint8Array): DecodedPng {
  const png = PNG.sync.read(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
  return { width: png.width, height: png.height, data: png.data };
}

export function compareRgba(
  actual: DecodedPng,
  expected: DecodedPng,
): PngCompareResult {
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(
      `PNG size mismatch: actual ${actual.width}x${actual.height}, expected ${expected.width}x${expected.height}`,
    );
  }
  const pixels = actual.width * actual.height;
  let maxAbs = 0;
  let sumAbs = 0;
  let opaqueFromZero = 0;
  for (let i = 0; i < pixels * 4; i += 4) {
    for (let c = 0; c < 4; c += 1) {
      const delta = Math.abs(actual.data[i + c] - expected.data[i + c]);
      if (delta > maxAbs) maxAbs = delta;
      sumAbs += delta;
    }
    if (expected.data[i + 3] === 0 && actual.data[i + 3] > 0) {
      opaqueFromZero += 1;
    }
  }
  return {
    width: actual.width,
    height: actual.height,
    maxAbs,
    meanAbs: sumAbs / (pixels * 4),
    opaqueFromZero,
  };
}

export function cornerAlpha(decoded: DecodedPng): [number, number, number, number] {
  const { width, height, data } = decoded;
  const at = (x: number, y: number): number => data[(y * width + x) * 4 + 3];
  return [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
}
