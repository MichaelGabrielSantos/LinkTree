export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Tempo esgotado após ${ms} ms`);
    this.name = "TimeoutError";
  }
}

/** Limita a espera; a operação original continua em segundo plano e não é cancelada. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(ms)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
