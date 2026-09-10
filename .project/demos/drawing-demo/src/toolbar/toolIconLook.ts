import type { ToolVisibility } from './types';

export type ToolIconLookInput = {
  visibility: Exclude<ToolVisibility, 'hidden'>;
  toolbarLive: boolean;
  showActiveTool: boolean;
  /**
   * True when the strip advertises an active chip (or Prompt Editor transform),
   * so idle peers stay unmuted. Chrome idle-look clears this.
   */
  stripHasActiveChip: boolean;
};

export type ToolIconLook = {
  active: boolean;
  muted: boolean;
  disabled: boolean;
};

/**
 * Pure presentation for one strip tool icon.
 * Policy (ChromeMode vs selectionAllowsTool) stays elsewhere; this only maps
 * resolved visibility + chrome strip flags → button props.
 */
export function toolIconLook(input: ToolIconLookInput): ToolIconLook {
  const { visibility, toolbarLive, showActiveTool, stripHasActiveChip } =
    input;
  const active = showActiveTool && visibility === 'active';
  const disabled = visibility === 'disabled' || !toolbarLive;
  // Mute: chrome idle-look (no active chip) or Node-incompatible disabled.
  // Never mute the advertised active chip.
  const muted =
    !active && (visibility === 'disabled' || !stripHasActiveChip);
  return { active, muted, disabled };
}

/** Whether the strip is advertising any active tool chip (or Prompt transform). */
export function stripHasActiveChip(
  tools: readonly { visibility: Exclude<ToolVisibility, 'hidden'> }[],
  showActiveTool: boolean,
  transformed: boolean,
): boolean {
  return (
    transformed ||
    tools.some((tool) => showActiveTool && tool.visibility === 'active')
  );
}
