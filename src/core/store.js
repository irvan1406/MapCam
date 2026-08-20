export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();
  return {
    getState: () => state,
    setState(update, reason = 'update') {
      const nextState = typeof update === 'function' ? update(state) : { ...state, ...update };
      state = nextState;
      for (const listener of listeners) listener(state, reason);
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
