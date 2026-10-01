/** État de la caméra 2D (pur, testable) : centre en cellules du monde, zoom en pixels par cellule. */
export class ViewState {
  cx = 0
  cy = 0
  zoom = 1
  vw = 800
  vh = 600
  constructor(public worldW = 256, public worldH = 256) {}

  get minZoom() {
    return Math.min(this.vw / this.worldW, this.vh / this.worldH) * 0.8
  }
  readonly maxZoom = 40

  resize(vw: number, vh: number) {
    this.vw = vw
    this.vh = vh
    this.clamp()
  }

  /** Cadre tout le monde. */
  fit() {
    this.cx = this.worldW / 2
    this.cy = this.worldH / 2
    this.zoom = Math.min(this.vw / this.worldW, this.vh / this.worldH) * 0.95
  }

  /** Déplace la vue de (dx, dy) pixels écran (glisser). */
  panBy(dx: number, dy: number) {
    this.cx -= dx / this.zoom
    this.cy -= dy / this.zoom
    this.clamp()
  }

  /** Zoome d'un facteur en gardant fixe le point sous (px, py) en pixels écran. */
  zoomAt(factor: number, px: number, py: number) {
    const before = this.screenToWorld(px, py)
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor))
    const after = this.screenToWorld(px, py)
    this.cx += before.x - after.x
    this.cy += before.y - after.y
    this.clamp()
  }

  screenToWorld(px: number, py: number) {
    return { x: this.cx + (px - this.vw / 2) / this.zoom, y: this.cy + (py - this.vh / 2) / this.zoom }
  }

  /** Garde le centre dans le monde. */
  clamp() {
    this.cx = Math.min(this.worldW, Math.max(0, this.cx))
    this.cy = Math.min(this.worldH, Math.max(0, this.cy))
  }
}
