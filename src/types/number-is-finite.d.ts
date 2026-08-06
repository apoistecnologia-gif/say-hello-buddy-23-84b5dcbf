export {};

declare global {
  interface NumberConstructor {
    isFinite(value: unknown): value is number;
  }
}
