const NODES: [number, number][] = [[24, 150], [110, 62], [205, 138], [295, 56], [380, 120]];
const NAMES = ["Bridge", "Forest", "Tower", "Summit"];

function pointAt(t: number): [number, number] {
  const segs = NODES.slice(1).map((p, i) => Math.hypot(p[0] - NODES[i][0], p[1] - NODES[i][1]));
  let d = Math.max(0, Math.min(1, t)) * segs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? Math.min(1, d / segs[i]) : 0;
      return [NODES[i][0] + (NODES[i + 1][0] - NODES[i][0]) * f, NODES[i][1] + (NODES[i + 1][1] - NODES[i][1]) * f];
    }
    d -= segs[i];
  }
  return NODES[NODES.length - 1];
}

export type QuestGoal = { id: string; label: string; metric: string; target: number; current: number; pct: number };
const fmt = (g: QuestGoal, v: number) => (g.metric === "money" ? `$${Math.round(v).toLocaleString()}` : Math.round(v).toLocaleString());

/** A winding trail toward a yearly goal; the caped kid marks how far the team has come. */
export function QuestMap({ goal }: { goal: QuestGoal }) {
  const [mx, my] = pointAt(goal.pct);
  const path = "M" + NODES.map((p) => p.join(",")).join(" L");
  return (
    <figure className="rounded-xl bg-[linear-gradient(160deg,#e9f3fb,#fdf6dc)] p-3 dark:bg-[linear-gradient(160deg,#10263a,#2a2410)]">
      <figcaption className="mb-1 flex items-baseline justify-between text-sm"><span className="font-bold">{goal.label}</span><span className="tabular-nums text-muted">{fmt(goal, goal.current)} / {fmt(goal, goal.target)}</span></figcaption>
      <svg viewBox="0 -12 420 214" className="w-full" role="img" aria-label={`${goal.label}: ${Math.round(goal.pct * 100)}% of the way`}>
        <path d={path} fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d={path} fill="none" stroke="#FED438" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={`${goal.pct} 1`} />
        {NODES.slice(1).map((p, i) => {
          const reached = goal.pct >= (i + 1) / 4;
          return (
            <g key={i}>
              <circle cx={p[0]} cy={p[1]} r="11" fill={reached ? "#004F81" : "#fff"} stroke="#004F81" strokeWidth="3" />
              {reached && <text x={p[0]} y={p[1] + 4} textAnchor="middle" fontSize="11" fill="#FED438">★</text>}
              <text x={p[0]} y={p[1] + (i % 2 ? -30 : 30)} textAnchor="middle" fontSize="15" fontWeight="800" fill="currentColor" opacity={reached ? 1 : 0.6}>{NAMES[i]}</text>
              <text x={p[0]} y={p[1] + (i % 2 ? -15 : 46)} textAnchor="middle" fontSize="13" fontWeight="600" fill="currentColor" opacity={reached ? 0.9 : 0.5}>{fmt(goal, (goal.target * (i + 1)) / 4)}</text>
            </g>
          );
        })}
        <circle cx={NODES[0][0]} cy={NODES[0][1]} r="7" fill="#004F81" />
        <g transform={`translate(${mx - 16},${my - 30})`}><image href="/logo.png" width="32" height="30" /></g>
      </svg>
    </figure>
  );
}
