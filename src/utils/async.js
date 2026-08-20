export function debounce(callback, delay = 300) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
  wrapped.flush = (...args) => {
    clearTimeout(timer);
    return callback(...args);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSequential(items, task, onProgress = () => {}) {
  const results = [];
  for (let index = 0; index < items.length; index += 1) {
    results.push(await task(items[index], index));
    onProgress(index + 1, items.length);
  }
  return results;
}
