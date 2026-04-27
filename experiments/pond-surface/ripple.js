// 2D water ripple displacement, ported from the doorman extension.
// Texture is sampled live from a source canvas every frame so the
// rippled output reflects whatever's currently drawn there (e.g. video).

export function createRipple(displayCanvas, sourceCanvas, options = {}) {
  const { strength = 160, riprad = 5, dampShift = 11 } = options;
  const ctx = displayCanvas.getContext('2d');
  const sctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const W = displayCanvas.width;
  const H = displayCanvas.height;
  const halfW = W >> 1;
  const halfH = H >> 1;
  const mapSize = W * (H + 2) * 2;

  let oldind = W;
  let newind = W * (H + 3);
  const ripplemap = new Float32Array(mapSize);
  const lastMap = new Float32Array(W * H);
  const ripple = ctx.createImageData(W, H);
  const rd = ripple.data;
  for (let i = 3; i < rd.length; i += 4) rd[i] = 255;

  function disturb(dx, dy, amount = strength) {
    const x = dx | 0;
    const y = dy | 0;
    for (let j = y - riprad; j < y + riprad; j++) {
      if (j < 0 || j >= H) continue;
      for (let k = x - riprad; k < x + riprad; k++) {
        if (k < 0 || k >= W) continue;
        ripplemap[oldind + j * W + k] += amount;
      }
    }
  }

  function step() {
    const td = sctx.getImageData(0, 0, W, H).data;

    const t = oldind;
    oldind = newind;
    newind = t;
    let i = 0;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ni = newind + i;
        const mi = oldind + i;
        let data =
          ((ripplemap[mi - W] + ripplemap[mi + W] + ripplemap[mi - 1] + ripplemap[mi + 1]) >> 1) -
          ripplemap[ni];
        data -= data >> dampShift;
        ripplemap[ni] = data;
        data = 1024 - data;
        lastMap[i] = data;

        let a = ((((x - halfW) * data) / 1024) | 0) + halfW;
        let b = ((((y - halfH) * data) / 1024) | 0) + halfH;
        if (a >= W) a = W - 1; else if (a < 0) a = 0;
        if (b >= H) b = H - 1; else if (b < 0) b = 0;

        const np = (a + b * W) * 4;
        const cp = i * 4;
        rd[cp]     = td[np];
        rd[cp + 1] = td[np + 1];
        rd[cp + 2] = td[np + 2];
        i++;
      }
    }

    ctx.putImageData(ripple, 0, 0);
  }

  return { step, disturb };
}
