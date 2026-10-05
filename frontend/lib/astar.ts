export type Node = { lat: number; lon: number };

function nm(a: Node, b: Node) {
  const R = 3440.065;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function astarClient(
  start: Node,
  dest: Node,
  bergs: { lat: number; lon: number; dangerRadiusNm?: number; predictedPath?: { lat: number; lon: number; hour?: number }[] }[],
  avoid: number
): Node[] {
  const step = 0.25;
  const key = (n: Node) => `${n.lat.toFixed(2)},${n.lon.toFixed(2)}`;
  const h = (n: Node) => nm(n, dest);
  const open: { f: number; n: Node }[] = [{ f: h(start), n: start }];
  const came = new Map<string, string | null>();
  const g = new Map<string, number>([[key(start), 0]]);
  came.set(key(start), null);
  const dirs = [
    [step, 0],
    [-step, 0],
    [0, step],
    [0, -step],
    [step, step],
    [-step, -step],
    [step, -step],
    [-step, step],
  ];
  const effectiveAvoid = Math.max(avoid, 8.0);

  for (let i = 0; i < 4000 && open.length; i++) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!.n;
    if (nm(current, dest) < step * 1.5) {
      const path = [dest];
      let k: string | null = key(current);
      while (k) {
        const [lat, lon] = k.split(",").map(Number);
        path.push({ lat, lon });
        k = came.get(k) ?? null;
      }
      return path.reverse();
    }
    for (const [dlat, dlon] of dirs) {
      const nxt = {
        lat: +((current.lat + dlat).toFixed(2)),
        lon: +((current.lon + dlon).toFixed(2)),
      };
      
      let bergPen = 0;
      for (const b of bergs) {
        const d0 = nm(nxt, b);
        const reqR = Math.max(effectiveAvoid, b.dangerRadiusNm || 7.0);
        if (d0 < reqR) {
          bergPen += ((reqR - d0) / reqR) ** 2 * 40.0;
        }
        if (b.predictedPath) {
          for (const pt of b.predictedPath) {
            if ((pt.hour ?? 1) > 0) {
              const dPred = nm(nxt, pt);
              const predR = 6.0;
              if (dPred < predR) {
                bergPen += ((predR - dPred) / predR) ** 2 * 25.0;
              }
            }
          }
        }
      }

      const tentative = (g.get(key(current)) ?? 1e9) + nm(current, nxt) + bergPen;
      if (tentative < (g.get(key(nxt)) ?? 1e9)) {
        g.set(key(nxt), tentative);
        came.set(key(nxt), key(current));
        open.push({ f: tentative + h(nxt), n: nxt });
      }
    }
  }
  return [start, dest];
}
