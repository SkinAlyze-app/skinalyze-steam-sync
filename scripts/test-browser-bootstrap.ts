type BrowserTestGlobals = typeof globalThis & {
  browser?: unknown;
  chrome?: unknown;
};

export function installBrowserTestEnvironment(): void {
  const globals = globalThis as BrowserTestGlobals;
  globals.chrome ??= { runtime: { id: 'skinalyze-test-extension' } };
  globals.browser = new Proxy({}, {
    get(_target, property) {
      return (globals.chrome as Record<PropertyKey, unknown> | undefined)?.[property];
    },
  });
}
