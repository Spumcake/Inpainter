export type ContentKind = 'image' | 'lora' | 'other';

export type ContentItem = {
  id: string;
  name: string;
  kind: ContentKind;
  /** Plain values shown when the row is expanded — no field labels in UI. */
  elements: string[];
};

export type LibraryAsset = {
  id: string;
  name: string;
  contents: ContentItem[];
};

export const NEW_ASSET_ID = '__new_asset__';
