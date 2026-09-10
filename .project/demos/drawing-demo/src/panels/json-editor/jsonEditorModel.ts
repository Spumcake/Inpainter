export type JsonEditorValue =
  | null
  | boolean
  | number
  | string
  | JsonEditorValue[]
  | { [key: string]: JsonEditorValue };

export type JsonEditorType =
  | 'null'
  | 'boolean'
  | 'number'
  | 'string'
  | 'array'
  | 'object'
  | 'table';

export type JsonPath = readonly (string | number)[];

export function getType(value: unknown): JsonEditorType {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (
      value.length > 0 &&
      value.every(
        (item) =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      )
    ) {
      return 'table';
    }
    return 'array';
  }
  if (typeof value === 'object') return 'object';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'string';
}

/** Glyph shown in the value column (dtype mark). */
export function getTypeIcon(type: JsonEditorType): string {
  switch (type) {
    case 'object':
      return '{}';
    case 'array':
    case 'table':
      return '[]';
    case 'string':
      return 'A';
    case 'number':
      return '#';
    case 'boolean':
      return 'B';
    case 'null':
      return 'Ø';
    default:
      return '?';
  }
}

/** Glyph shown in the property column for complex nodes. */
export function getStructIcon(type: JsonEditorType): string {
  if (type === 'object') return '{';
  if (type === 'array' || type === 'table') return '[';
  return '';
}

export function isComplexType(type: JsonEditorType): boolean {
  return type === 'object' || type === 'array' || type === 'table';
}

export function pathKey(path: JsonPath): string {
  return path.map(String).join('.');
}

export function displayPrimitive(value: unknown): string {
  if (value === null) return 'null';
  return String(value);
}

export function tableHeaders(
  rows: ReadonlyArray<Record<string, unknown>>,
): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      keys.add(key);
    }
  }
  return Array.from(keys);
}

/** Every expandable path under `value` (tables stop at themselves). */
export function collectExpandablePaths(
  value: JsonEditorValue,
  path: JsonPath = [],
): string[] {
  const type = getType(value);
  if (!isComplexType(type)) return [];

  const self = path.length > 0 ? [pathKey(path)] : [];
  if (type === 'table') return self;

  const record = value as Record<string, JsonEditorValue> | JsonEditorValue[];
  for (const childKey of Object.keys(record)) {
    const childPath: JsonPath = [
      ...path,
      Array.isArray(record) ? Number(childKey) : childKey,
    ];
    self.push(
      ...collectExpandablePaths(
        (record as Record<string, JsonEditorValue>)[childKey]!,
        childPath,
      ),
    );
  }
  return self;
}

export function complexSummary(
  type: JsonEditorType,
  value: JsonEditorValue,
  expanded: boolean,
): string {
  if (!expanded) {
    return type === 'object' ? '{...}' : '[...]';
  }
  if (type === 'object') {
    const n = Object.keys(value as object).length;
    return `Object (${n} ${n === 1 ? 'property' : 'properties'})`;
  }
  if (type === 'table') {
    const n = (value as unknown[]).length;
    return `Table (${n} ${n === 1 ? 'row' : 'rows'})`;
  }
  const n = (value as unknown[]).length;
  return `Collection (${n} ${n === 1 ? 'item' : 'items'})`;
}

export function cloneData(data: JsonEditorValue): JsonEditorValue {
  return JSON.parse(JSON.stringify(data)) as JsonEditorValue;
}

/** Coerce an edited string back toward the original primitive type. */
export function coerceEditedValue(
  raw: string,
  original: JsonEditorValue,
): JsonEditorValue {
  if (raw === 'null') return null;

  if (typeof original === 'number') {
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? original : parsed;
  }

  if (typeof original === 'boolean') {
    const lower = raw.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    return original;
  }

  if (original === null) return raw;

  return raw;
}

export function updateValueAtPath(
  root: JsonEditorValue,
  path: JsonPath,
  newValue: JsonEditorValue,
): JsonEditorValue {
  if (path.length === 0) return newValue;

  const next = cloneData(root);
  let cursor: JsonEditorValue = next;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    if (Array.isArray(cursor)) {
      cursor = cursor[key as number]!;
    } else if (cursor !== null && typeof cursor === 'object') {
      cursor = (cursor as Record<string, JsonEditorValue>)[key as string]!;
    } else {
      return root;
    }
  }

  const last = path[path.length - 1]!;
  if (Array.isArray(cursor)) {
    cursor[last as number] = newValue;
  } else if (cursor !== null && typeof cursor === 'object') {
    (cursor as Record<string, JsonEditorValue>)[last as string] = newValue;
  }

  return next;
}
