/** Structural 2D canvas surface used by the settled compositor. */
export type SettledCanvas2D = {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  roundRect(x: number, y: number, w: number, h: number, radii: number): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void;
  measureText(text: string): { width: number };
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  fillStyle: string;
  globalAlpha: number;
  textBaseline: string;
  textAlign: string;
  font: string;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
};
