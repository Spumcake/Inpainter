import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  cloneData,
  coerceEditedValue,
  collectExpandablePaths,
  complexSummary,
  displayPrimitive,
  getStructIcon,
  getType,
  isComplexType,
  pathKey,
  tableHeaders,
  updateValueAtPath,
  type JsonEditorType,
  type JsonEditorValue,
  type JsonPath,
} from './jsonEditorModel';
import './JsonEditorView.css';

/**
 * Property-grid JSON editor for the Prompt Compiler stub.
 *
 * Layout: flat two-column rows; expanded children are sibling rows.
 * Edit: click a primitive value (or table cell) → inline input;
 * Enter/blur commits with type coerce; Escape cancels.
 */

const ACCENT = '#ff5a1f';

type JsonEditorViewProps = {
  data: JsonEditorValue;
};

type EditApi = {
  editingPath: string | null;
  beginEdit: (path: JsonPath) => void;
  commitEdit: (path: JsonPath, raw: string, original: JsonEditorValue) => void;
  cancelEdit: () => void;
};

/** Orange glyph painted as SVG fill — not CSS text color (WebKitGTK AA). */
function AccentGlyph({
  text,
  fontSize = 10,
  struct,
}: {
  text: string;
  fontSize?: number;
  struct?: boolean;
}) {
  return (
    <span
      className={
        struct ? 'json-editor__mark json-editor__mark--struct' : 'json-editor__mark'
      }
      aria-hidden
    >
      <svg viewBox={struct ? '0 0 12 16' : '0 0 10 15'}>
        <text
          x={struct ? '6' : '5'}
          y={struct ? '8' : '12'}
          textAnchor="middle"
          dominantBaseline={struct ? 'middle' : undefined}
          fill={ACCENT}
          fontSize={fontSize}
          fontWeight={700}
          fontFamily="inherit"
        >
          {text}
        </text>
      </svg>
    </span>
  );
}

function StructMark({ type }: { type: JsonEditorType }) {
  const mark = getStructIcon(type);
  if (!mark) return null;
  return <AccentGlyph text={mark} fontSize={12} struct />;
}

/** Non-functional row actions — visual parity with Workspace panel. */
function RowActions() {
  return (
    <span className="json-editor__actions">
      <button
        type="button"
        className="json-editor__action"
        title="Add"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        className="json-editor__action"
        title="Remove"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <Minus size={14} />
      </button>
    </span>
  );
}

function GridIcon() {
  return (
    <svg
      aria-hidden
      width={10}
      height={10}
      viewBox="0 0 24 24"
      style={{ display: 'block', margin: '0 auto' }}
    >
      <path
        fill={ACCENT}
        d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"
      />
    </svg>
  );
}

function PrimitiveEditor({
  path,
  value,
  edit,
  inTable,
}: {
  path: JsonPath;
  value: JsonEditorValue;
  edit: EditApi;
  inTable?: boolean;
}) {
  const key = pathKey(path);
  const editing = edit.editingPath === key;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="json-editor__input"
        defaultValue={displayPrimitive(value)}
        onBlur={(event) => {
          edit.commitEdit(path, event.currentTarget.value, value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            edit.cancelEdit();
          }
        }}
      />
    );
  }

  return (
    <span
      className={
        inTable
          ? 'json-editor__inline'
          : 'json-editor__inline json-editor__val--editable'
      }
      style={{ width: '100%' }}
      onClick={() => edit.beginEdit(path)}
    >
      {displayPrimitive(value)}
    </span>
  );
}

function NestedTable({
  rows,
  tablePath,
  edit,
}: {
  rows: ReadonlyArray<Record<string, unknown>>;
  tablePath: JsonPath;
  edit: EditApi;
}) {
  const headers = useMemo(() => tableHeaders(rows), [rows]);

  if (rows.length === 0) {
    return <div className="json-editor__empty">Empty Table</div>;
  }

  return (
    <table className="json-editor__table">
      <tbody>
        <tr className="json-editor__table-head">
          <td className="json-editor__table-index json-editor__table-index--head">
            <GridIcon />
          </td>
          {headers.map((header) => (
            <td key={header}>{header}</td>
          ))}
        </tr>
        {rows.map((row, index) => (
          <tr key={String(index)}>
            <td className="json-editor__table-index">{index}</td>
            {headers.map((header) => {
              const cellPath: JsonPath = [...tablePath, index, header];
              const cellKey = pathKey(cellPath);
              const val = row[header] as JsonEditorValue;
              const valType = getType(val);
              if (isComplexType(valType)) {
                return <td key={header}>[Complex]</td>;
              }
              const editing = edit.editingPath === cellKey;
              return (
                <td
                  key={header}
                  className={
                    editing
                      ? 'json-editor__cell--editable json-editor__cell--editing'
                      : 'json-editor__cell--editable'
                  }
                  onClick={() => {
                    if (!editing) edit.beginEdit(cellPath);
                  }}
                >
                  <PrimitiveEditor
                    path={cellPath}
                    value={val}
                    edit={edit}
                    inTable
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type GridRowProps = {
  path: string;
  label: string;
  level: number;
  type: JsonEditorType;
  complex: boolean;
  expanded: boolean;
  onToggle: (path: string) => void;
  valueContent: ReactNode;
  valueFlush?: boolean;
  valueEditing?: boolean;
  onValueClick?: () => void;
};

function GridRow({
  path,
  label,
  level,
  type,
  complex,
  expanded,
  onToggle,
  valueContent,
  valueFlush,
  valueEditing,
  onValueClick,
}: GridRowProps) {
  const propPad: CSSProperties = { paddingLeft: level * 16 + 6 };

  let valClass = 'json-editor__val';
  if (valueFlush) valClass += ' json-editor__val--flush';
  if (!complex && !valueFlush) valClass += ' json-editor__val--editable';
  if (valueEditing) valClass += ' json-editor__val--editing';

  return (
    <div className="json-editor__row" data-path={path}>
      <div className="json-editor__prop" style={propPad}>
        {complex ? (
          <button
            type="button"
            className="json-editor__expander"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(path);
            }}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="json-editor__expander-spacer" aria-hidden />
        )}
        {complex ? <StructMark type={type} /> : null}
        <span className="json-editor__label">{label}</span>
      </div>
      <div className={valClass} onClick={onValueClick}>
        {valueContent}
      </div>
      <RowActions />
    </div>
  );
}

function buildRows(
  key: string,
  value: JsonEditorValue,
  path: JsonPath,
  level: number,
  expanded: ReadonlySet<string>,
  onToggle: (path: string) => void,
  edit: EditApi,
): ReactNode[] {
  const type = getType(value);
  const complex = isComplexType(type);
  const keyStr = pathKey(path);
  const isOpen = complex && expanded.has(keyStr);
  const rows: ReactNode[] = [];

  let valueContent: ReactNode;
  let valueFlush = false;
  let valueEditing = false;
  let onValueClick: (() => void) | undefined;

  if (complex) {
    if (isOpen && type === 'table') {
      valueFlush = true;
      valueContent = (
        <NestedTable
          rows={value as unknown as ReadonlyArray<Record<string, unknown>>}
          tablePath={path}
          edit={edit}
        />
      );
    } else {
      valueContent = (
        <span className="json-editor__accent">
          {complexSummary(type, value, isOpen)}
        </span>
      );
    }
  } else {
    valueEditing = edit.editingPath === keyStr;
    onValueClick = () => {
      if (!valueEditing) edit.beginEdit(path);
    };
    valueContent = <PrimitiveEditor path={path} value={value} edit={edit} />;
  }

  rows.push(
    <GridRow
      key={keyStr}
      path={keyStr}
      label={key}
      level={level}
      type={type}
      complex={complex}
      expanded={isOpen}
      onToggle={onToggle}
      valueContent={valueContent}
      valueFlush={valueFlush}
      valueEditing={valueEditing}
      onValueClick={onValueClick}
    />,
  );

  if (complex && isOpen && type !== 'table') {
    const record = value as Record<string, JsonEditorValue> | JsonEditorValue[];
    for (const childKey of Object.keys(record)) {
      const childPath: JsonPath = [
        ...path,
        Array.isArray(record) ? Number(childKey) : childKey,
      ];
      rows.push(
        ...buildRows(
          childKey,
          (record as Record<string, JsonEditorValue>)[childKey]!,
          childPath,
          level + 1,
          expanded,
          onToggle,
          edit,
        ),
      );
    }
  }

  return rows;
}

export function JsonEditorView({ data }: JsonEditorViewProps) {
  const [draft, setDraft] = useState(() => cloneData(data));
  const [editingPath, setEditingPath] = useState<string | null>(null);

  const initialExpanded = useMemo(() => {
    const rootType = getType(data);
    if (!isComplexType(rootType)) return new Set<string>();
    const paths = collectExpandablePaths(data);
    // Root array/table is rendered as its own row at path [].
    if (rootType === 'array' || rootType === 'table') {
      paths.push('');
    }
    return new Set(paths);
  }, [data]);

  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded);

  const onToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const edit = useMemo<EditApi>(
    () => ({
      editingPath,
      beginEdit: (path) => setEditingPath(pathKey(path)),
      cancelEdit: () => setEditingPath(null),
      commitEdit: (path, raw, original) => {
        const nextValue = coerceEditedValue(raw, original);
        setDraft((prev) => updateValueAtPath(prev, path, nextValue));
        setEditingPath(null);
      },
    }),
    [editingPath],
  );

  const rootType = getType(draft);
  const rows: ReactNode[] = [];

  if (rootType === 'object') {
    const record = draft as Record<string, JsonEditorValue>;
    for (const key of Object.keys(record)) {
      rows.push(
        ...buildRows(key, record[key]!, [key], 0, expanded, onToggle, edit),
      );
    }
  } else if (rootType === 'array' || rootType === 'table') {
    rows.push(
      ...buildRows('root', draft, [], 0, expanded, onToggle, edit),
    );
  } else {
    const rootEditing = editingPath === '';
    rows.push(
      <div
        key="primitive"
        className={
          rootEditing
            ? 'json-editor__val json-editor__val--editable json-editor__val--editing'
            : 'json-editor__val json-editor__val--editable'
        }
        onClick={() => {
          if (!rootEditing) edit.beginEdit([]);
        }}
      >
        <PrimitiveEditor path={[]} value={draft} edit={edit} />
      </div>,
    );
  }

  return <div className="json-editor">{rows}</div>;
}
