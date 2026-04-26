const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17]
];

export function drawFace(ctx, landmarks, { width, height, offsetX = 0, offsetY = 0 }) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!landmarks || landmarks.length === 0) return;
  ctx.fillStyle = 'rgba(124, 204, 255, 0.55)';
  for (const p of landmarks) {
    ctx.beginPath();
    ctx.arc(p.x * width + offsetX, p.y * height + offsetY, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawHands(ctx, hands, { width, height }) {
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#7cf';
  ctx.fillStyle = '#fff';

  for (const landmarks of hands) {
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const p = landmarks[a], q = landmarks[b];
      ctx.moveTo(p.x * width, p.y * height);
      ctx.lineTo(q.x * width, q.y * height);
    }
    ctx.stroke();

    for (const p of landmarks) {
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
