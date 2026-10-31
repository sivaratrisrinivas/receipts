// A tiny store: state, a pure reducer, and subscribers. No framework.

export interface Store<State, Action> {
  getState(): State;
  dispatch(action: Action): void;
  /** Called after every change with the new state. Returns an unsubscribe function. */
  subscribe(listener: (state: State) => void): () => void;
}

export function createStore<State, Action>(initial: State, reduce: (state: State, action: Action) => State): Store<State, Action> {
  let state = initial;
  const listeners = new Set<(state: State) => void>();
  return {
    getState: () => state,
    dispatch(action) {
      state = reduce(state, action);
      for (const listener of [...listeners]) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
