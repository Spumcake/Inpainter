import { TOOLBAR_BOTTOM_GAP } from '../timeline/layout';
import type { ResolvedToolbarStrip } from './types';
import { presentationForTool } from './toolPresentation';
import { ToolButton } from './ToolButton';
import { stripHasActiveChip, toolIconLook } from './toolIconLook';

type ToolbarShellProps = {
  strip: ResolvedToolbarStrip;
  toolbarLive: boolean;
  /** When false, strip shows idle look (no latched-tool chip) even if Session has a tool. */
  showActiveTool?: boolean;
  stack?: 'authoring' | 'aboveListScrim';
  onActivateTool?: (toolId: string) => void;
};

export function ToolbarShell({
  strip,
  toolbarLive,
  showActiveTool = toolbarLive,
  stack = 'authoring',
  onActivateTool,
}: ToolbarShellProps) {
  const hasTools = strip.tools.length > 0;
  const showDot = !hasTools && !strip.slot;
  const zClass = stack === 'aboveListScrim' ? 'z-[45]' : 'z-30';
  // Prompt Editor transform keeps create + slot with no active tool chip — don't mute +.
  const hasActiveChip = stripHasActiveChip(
    strip.tools,
    showActiveTool,
    strip.transformed,
  );

  const peLight = Boolean(strip.transformed);

  const stripPill = (
    <div
      className={`flex items-center rounded-full ${
        peLight
          ? 'h-auto min-h-[35px] w-[28.6rem] gap-1.5 bg-chrome-surface py-1 pl-1 pr-1.5'
          : hasTools
            ? 'h-[35px] gap-0.5 bg-black p-[2px] shadow-lg'
            : 'h-[35px] bg-black px-3 shadow-lg'
      }`}
    >
      {showDot ? (
        <span
          className="h-1.5 w-1.5 rounded-full bg-[#7C3AED]"
          aria-hidden
        />
      ) : null}
      {strip.tools.map((tool) => {
        const { Icon, label } = presentationForTool(tool.id);
        const { active, muted, disabled } = toolIconLook({
          visibility: tool.visibility,
          toolbarLive,
          showActiveTool,
          stripHasActiveChip: hasActiveChip,
        });

        return (
          <ToolButton
            key={tool.id}
            label={label}
            active={active}
            muted={muted}
            disabled={disabled}
            tone={peLight ? 'onLight' : 'onDark'}
            onClick={() => {
              if (disabled) {
                return;
              }
              onActivateTool?.(tool.id);
            }}
          >
            <Icon size={15} strokeWidth={2} />
          </ToolButton>
        );
      })}
      {strip.slot}
    </div>
  );

  return (
    <div
      data-selection-chrome="tools"
      className={`pointer-events-none absolute left-1/2 ${zClass} -translate-x-1/2`}
      style={{ bottom: TOOLBAR_BOTTOM_GAP }}
    >
      <div
        className={`flex items-center gap-2 ${
          toolbarLive ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        {stripPill}
      </div>
    </div>
  );
}
