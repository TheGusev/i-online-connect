export interface SocketLease {
  isActive(): boolean;
  dispose(): void;
  guard<Args extends unknown[], Result>(
    callback: (...args: Args) => Result,
  ): (...args: Args) => Result | undefined;
}
export function createSocketLease(dependencies: {
  getRevision(): number;
  isCurrent(revision: number): boolean;
  subscribe(listener: () => void): () => void;
  onDispose(): void;
}): SocketLease;
