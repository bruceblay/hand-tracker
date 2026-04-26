const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17]
];

export function drawHands(ctx, hands, {
  width, height,
  lineColor = '#7cf', dotColor = '#fff',
  lineWidth = 2, dotRadius = 3
}) {
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = lineColor;
  ctx.fillStyle = dotColor;

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
      ctx.arc(p.x * width, p.y * height, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
