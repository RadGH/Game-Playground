// Just enough of `document` for Chibi 3's eye texture to be built under node (tests and profiling).
if (!globalThis.document) {
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, fillRect() {} }) }) };
}
