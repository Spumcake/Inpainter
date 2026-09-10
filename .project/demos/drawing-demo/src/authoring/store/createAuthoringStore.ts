import { enableMapSet, enablePatches } from 'immer';
import type { Draft } from 'immer';
import { createStore } from 'zustand/vanilla';
import { immer } from 'zustand/middleware/immer';
import type { StateCreator, StoreApi } from 'zustand';

enableMapSet();
enablePatches();

export type ImmerSetState<T> = (
  nextStateOrUpdater: T | Partial<T> | ((state: Draft<T>) => void),
  replace?: boolean,
) => void;

export type AuthoringStore<T> = Omit<StoreApi<T>, 'setState'> & {
  setState: ImmerSetState<T>;
};

export type CreateAuthoringStoreOptions<T> = {
  /**
   * Runs inside the same immer pass after every `setState` draft.
   * Use for Session invariants that must not be bypassable by mutators.
   */
  normalize?: (state: Draft<T>) => void;
};

export function createAuthoringStore<T>(
  initializer: StateCreator<T, [['zustand/immer', never]], []>,
  options?: CreateAuthoringStoreOptions<T>,
): AuthoringStore<T> {
  const store = createStore<T>()(immer(initializer)) as AuthoringStore<T>;
  const normalize = options?.normalize;
  if (!normalize) {
    return store;
  }

  const rawSetState = store.setState.bind(store);
  store.setState = ((
    nextStateOrUpdater: T | Partial<T> | ((state: Draft<T>) => void),
    replace?: boolean,
  ) => {
    if (typeof nextStateOrUpdater === 'function') {
      rawSetState((draft) => {
        (nextStateOrUpdater as (state: Draft<T>) => void)(draft);
        normalize(draft);
      }, replace);
      return;
    }
    rawSetState((draft) => {
      Object.assign(draft as object, nextStateOrUpdater);
      normalize(draft);
    }, replace);
  }) as ImmerSetState<T>;

  return store;
}
