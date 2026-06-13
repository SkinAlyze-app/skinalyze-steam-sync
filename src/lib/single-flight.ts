export type SingleFlightStart<T> = {
  promise: Promise<T>;
  started: boolean;
};

export function createSingleFlight<T>() {
  let current: Promise<T> | null = null;

  const start = (factory: () => Promise<T>): SingleFlightStart<T> => {
    if (current) {
      return { promise: current, started: false };
    }

    try {
      current = factory().finally(() => {
        current = null;
      });
    } catch (error) {
      current = Promise.reject(error).finally(() => {
        current = null;
      });
    }

    return { promise: current, started: true };
  };

  return {
    start,
    run(factory: () => Promise<T>): Promise<T> {
      return start(factory).promise;
    },
    isRunning(): boolean {
      return current != null;
    },
  };
}
