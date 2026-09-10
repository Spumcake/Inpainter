import { useEffect, useState } from 'react';
import { ControlRenderer, SETTINGS_CONTROL_INPUT_CLASS } from '../controls/ControlRenderer';
import { SettingsPaneScroll } from '../pane/SettingsPaneScroll';
import { SettingsRow } from '../shell/SettingsRow';
import { SettingsSection } from '../shell/SettingsSection';
import type { CustomPaneContext, SettingValue } from '../types';

const MIN = 64;
const MAX = 8192;

type RatioParts = { w: number; h: number };

function clamp(n: number): number {
  if (!Number.isFinite(n)) return MIN;
  return Math.min(MAX, Math.max(MIN, Math.round(n)));
}

function formatPart(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '1';
  return Number.isInteger(n) ? String(n) : String(n);
}

const DEFAULT_RATIO: RatioParts = { w: 1, h: 1 };
const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;

function parseRatio(raw: SettingValue): RatioParts {
  const value = typeof raw === 'string' ? raw.trim() : '1:1';
  const match = /^(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)$/i.exec(value);
  if (!match) return { ...DEFAULT_RATIO };
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!(w > 0) || !(h > 0)) return { ...DEFAULT_RATIO };
  return { w, h };
}

function serializeRatio({ w, h }: RatioParts): string {
  return `${formatPart(w)}:${formatPart(h)}`;
}

function heightFromWidth(width: number, ratio: RatioParts): number {
  return clamp((width * ratio.h) / ratio.w);
}

function widthFromHeight(height: number, ratio: RatioParts): number {
  return clamp((height * ratio.w) / ratio.h);
}

const widthField = {
  key: 'output.defaultWidth',
  label: 'Width',
  control: 'number' as const,
  default: DEFAULT_WIDTH,
  min: MIN,
  max: MAX,
  step: 1,
};

const heightField = {
  key: 'output.defaultHeight',
  label: 'Height',
  control: 'number' as const,
  default: DEFAULT_HEIGHT,
  min: MIN,
  max: MAX,
  step: 1,
};

const ratioInputClass = `${SETTINGS_CONTROL_INPUT_CLASS} w-14 text-right`;

export function OutputPreferencesPane({ values, patch }: CustomPaneContext) {
  const ratio = parseRatio(values['output.ratio']);
  const width =
    typeof values['output.defaultWidth'] === 'number'
      ? values['output.defaultWidth']
      : DEFAULT_WIDTH;
  const height =
    typeof values['output.defaultHeight'] === 'number'
      ? values['output.defaultHeight']
      : DEFAULT_HEIGHT;

  const [ratioW, setRatioW] = useState(() => formatPart(ratio.w));
  const [ratioH, setRatioH] = useState(() => formatPart(ratio.h));

  useEffect(() => {
    setRatioW(formatPart(ratio.w));
    setRatioH(formatPart(ratio.h));
  }, [ratio.w, ratio.h]);

  const commitRatio = (nextW: string, nextH: string, opts?: { revertInvalid?: boolean }) => {
    const w = Number(nextW);
    const h = Number(nextH);
    if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) {
      if (opts?.revertInvalid) {
        setRatioW(formatPart(ratio.w));
        setRatioH(formatPart(ratio.h));
      }
      return;
    }
    const next = { w, h };
    const serialized = serializeRatio(next);
    if (
      serialized === serializeRatio(ratio) &&
      values['output.defaultHeight'] === heightFromWidth(width, next)
    ) {
      return;
    }
    patch({
      'output.ratio': serialized,
      'output.defaultHeight': heightFromWidth(width, next),
    });
  };

  const setWidth = (nextWidth: SettingValue) => {
    const w = clamp(typeof nextWidth === 'number' ? nextWidth : Number(nextWidth));
    patch({
      'output.defaultWidth': w,
      'output.defaultHeight': heightFromWidth(w, ratio),
    });
  };

  const setHeight = (nextHeight: SettingValue) => {
    const h = clamp(typeof nextHeight === 'number' ? nextHeight : Number(nextHeight));
    patch({
      'output.defaultHeight': h,
      'output.defaultWidth': widthFromHeight(h, ratio),
    });
  };

  return (
    <SettingsPaneScroll>
      <SettingsSection>
        <SettingsRow label="Ratio">
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0.01}
              step="any"
              value={ratioW}
              onChange={(event) => {
                const next = event.target.value;
                setRatioW(next);
                commitRatio(next, ratioH);
              }}
              onBlur={() => commitRatio(ratioW, ratioH, { revertInvalid: true })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
              className={ratioInputClass}
              aria-label="Ratio width"
            />
            <span className="text-sm text-gray-500">:</span>
            <input
              type="number"
              min={0.01}
              step="any"
              value={ratioH}
              onChange={(event) => {
                const next = event.target.value;
                setRatioH(next);
                commitRatio(ratioW, next);
              }}
              onBlur={() => commitRatio(ratioW, ratioH, { revertInvalid: true })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
              className={ratioInputClass}
              aria-label="Ratio height"
            />
          </div>
        </SettingsRow>
        <SettingsRow label={widthField.label}>
          <ControlRenderer field={widthField} value={width} onChange={setWidth} />
        </SettingsRow>
        <SettingsRow label={heightField.label}>
          <ControlRenderer field={heightField} value={height} onChange={setHeight} />
        </SettingsRow>
      </SettingsSection>
    </SettingsPaneScroll>
  );
}
