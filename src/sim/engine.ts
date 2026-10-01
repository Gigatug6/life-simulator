/** Charge le module WASM et expose son API typée. Aucune dépendance à Vue/Pinia. */
export interface LifeExports {
  version(): number
  tick(): number
  add(a: number, b: number): number
}

export async function loadEngine(source: BufferSource | Response | Promise<Response>): Promise<LifeExports> {
  const result =
    source instanceof Response || source instanceof Promise
      ? await WebAssembly.instantiateStreaming(source, {})
      : await WebAssembly.instantiate(source, {})
  return result.instance.exports as unknown as LifeExports
}
