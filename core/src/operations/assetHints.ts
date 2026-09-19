export type AssetKind = "image" | "audio" | "video";

export function inferAssetType(name: string): AssetKind {
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) {
    return "image";
  }
  if (/\.(wav|mp3|aac|flac|m4a|ogg)$/i.test(name)) {
    return "audio";
  }
  return "video";
}
