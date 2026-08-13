// The app was originally built to use Claude's artifact `window.storage` API.
// That API only exists inside Claude.ai's sandbox, so when running this as a
// normal standalone web app, we shim the same interface on top of localStorage
// (with an in-memory fallback) so nothing else in the app needs to change.

if (!window.storage) {
  const memoryFallback = {};
  let hasLocalStorage = true;
  try {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
  } catch (e) {
    hasLocalStorage = false;
  }

  window.storage = {
    async get(key, shared = false) {
      const fullKey = shared ? `shared:${key}` : key;
      let value;
      if (hasLocalStorage) {
        value = window.localStorage.getItem(fullKey);
      } else {
        value = memoryFallback[fullKey] ?? null;
      }
      if (value === null || value === undefined) {
        throw new Error('Key not found');
      }
      return { key, value, shared };
    },
    async set(key, value, shared = false) {
      const fullKey = shared ? `shared:${key}` : key;
      if (hasLocalStorage) {
        window.localStorage.setItem(fullKey, value);
      } else {
        memoryFallback[fullKey] = value;
      }
      return { key, value, shared };
    },
    async delete(key, shared = false) {
      const fullKey = shared ? `shared:${key}` : key;
      if (hasLocalStorage) {
        window.localStorage.removeItem(fullKey);
      } else {
        delete memoryFallback[fullKey];
      }
      return { key, deleted: true, shared };
    },
    async list(prefix = '', shared = false) {
      const keys = [];
      if (hasLocalStorage) {
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          const stripped = shared ? k.replace(/^shared:/, '') : k;
          if (!shared && k.startsWith('shared:')) continue;
          if (shared && !k.startsWith('shared:')) continue;
          if (stripped.startsWith(prefix)) keys.push(stripped);
        }
      } else {
        Object.keys(memoryFallback).forEach((k) => {
          const stripped = shared ? k.replace(/^shared:/, '') : k;
          if (!shared && k.startsWith('shared:')) return;
          if (shared && !k.startsWith('shared:')) return;
          if (stripped.startsWith(prefix)) keys.push(stripped);
        });
      }
      return { keys, prefix, shared };
    },
  };
}
