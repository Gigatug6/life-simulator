/** Messages échangés entre le thread UI et le worker de simulation. */
export type ToWorker = { type: 'init' } | { type: 'tick'; n: number }
export type FromWorker =
  | { type: 'ready'; version: number }
  | { type: 'ticked'; total: number }
  | { type: 'error'; message: string }
