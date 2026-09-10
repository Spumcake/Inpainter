import { useEffect, useRef, useState } from 'react';

export const PRESET_STRIP_SLOT = 28;
export const PRESET_STRIP_DRAG_THRESHOLD = 4;

type UseHorizontalSlotDragArgs = {
  itemCount: number;
  onReorder: (fromIndex: number, toIndex: number) => void;
};

export function useHorizontalSlotDrag({ itemCount, onReorder }: UseHorizontalSlotDragArgs) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [dragDeltaX, setDragDeltaX] = useState(0);

  const dragIdRef = useRef<string | null>(null);
  const originIndexRef = useRef(-1);
  const overIndexRef = useRef<number | null>(null);
  const pointerStartXRef = useRef(0);
  const activeRef = useRef(false);
  const itemCountRef = useRef(itemCount);
  itemCountRef.current = itemCount;

  useEffect(() => {
    const clearDrag = () => {
      dragIdRef.current = null;
      originIndexRef.current = -1;
      overIndexRef.current = null;
      activeRef.current = false;
      setDragId(null);
      setOverIndex(null);
      setDragDeltaX(0);
    };

    const onPointerMove = (event: PointerEvent) => {
      const id = dragIdRef.current;
      if (id == null) return;

      const deltaX = event.clientX - pointerStartXRef.current;

      if (!activeRef.current) {
        if (Math.abs(deltaX) < PRESET_STRIP_DRAG_THRESHOLD) return;
        activeRef.current = true;
        setDragId(id);
        setOverIndex(originIndexRef.current);
        overIndexRef.current = originIndexRef.current;
      }

      setDragDeltaX(deltaX);

      const origin = originIndexRef.current;
      const nextOver = Math.max(
        0,
        Math.min(
          itemCountRef.current - 1,
          origin + Math.round(deltaX / PRESET_STRIP_SLOT),
        ),
      );
      if (nextOver !== overIndexRef.current) {
        overIndexRef.current = nextOver;
        setOverIndex(nextOver);
      }
    };

    const onPointerUp = () => {
      const id = dragIdRef.current;
      if (id == null) return;

      if (activeRef.current) {
        const from = originIndexRef.current;
        const to = overIndexRef.current ?? from;
        if (from !== to) {
          onReorder(from, to);
        }
      }

      clearDrag();
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [onReorder]);

  const beginDrag = (id: string, index: number, clientX: number) => {
    dragIdRef.current = id;
    originIndexRef.current = index;
    overIndexRef.current = index;
    pointerStartXRef.current = clientX;
    activeRef.current = false;
    setDragDeltaX(0);
  };

  const shiftForIndex = (index: number, originIndex: number): number => {
    if (dragId == null || overIndex == null || originIndex < 0) return 0;
    if (index === originIndex) return dragDeltaX;
    if (originIndex < overIndex && index > originIndex && index <= overIndex) {
      return -PRESET_STRIP_SLOT;
    }
    if (originIndex > overIndex && index >= overIndex && index < originIndex) {
      return PRESET_STRIP_SLOT;
    }
    return 0;
  };

  return {
    dragId,
    overIndex,
    dragDeltaX,
    beginDrag,
    shiftForIndex,
  };
}
