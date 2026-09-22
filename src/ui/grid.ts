// Configuration memory grid rendering (canvas)

export function renderGrid(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 400
  return canvas
}
