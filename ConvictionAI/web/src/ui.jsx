// Shared UI primitives and charts (hand-rolled SVG, theme tokens only).
export const fmtM = (x, d = 1) => (x == null ? "—" : `$${x >= 1000 ? (x / 1000).toFixed(2) + "B" : x.toFixed(d) + "M"}`);
export const pct = (x, d = 0) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);
export const mult = (x, d = 2) => (x == null ? "—" : `${x.toFixed(d)}x`);

const STATUS_LABEL = { verified: "Verified", calculated: "Calculated", company: "Company-reported", third: "Third-party", inferred: "Inferred", assumption: "Assumption", missing: "Missing", disputed: "Disputed", synthetic: "Synthetic", upload: "Upload" };
export function Tag({ s, children }) {
  return <span className={`tag t-${s}`}>{children || STATUS_LABEL[s] || s}</span>;
}

export const SEG_COLOR = { po: "var(--c1)", me: "var(--c2)", as: "var(--c3)", ha: "var(--c4)", ir: "var(--c5)", dc: "var(--c6)" };

export function Bar({ v, max = 100, color }) {
  return <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, (v / max) * 100))}%`, background: color }} /></div>;
}

export function niceTicks(max, n = 4) {
  const raw = max / n, mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = []; for (let v = 0; v <= max + 1e-9; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

// Scatter with animated bubbles. points: [{id,x,y,r,color,label,dim}]
export function Scatter({ points, xDomain, yDomain, xLabel, yLabel, quad, onPick, selected, height = 360 }) {
  const W = 640, H = height, L = 46, R = 16, T = 16, B = 40;
  const sx = (v) => L + ((v - xDomain[0]) / (xDomain[1] - xDomain[0])) * (W - L - R);
  const sy = (v) => H - B - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * (H - T - B);
  const xt = []; for (let v = xDomain[0]; v <= xDomain[1]; v += 10) xt.push(v);
  const yt = []; for (let v = yDomain[0]; v <= yDomain[1]; v += 5) yt.push(v);
  return (
    <div className="hscroll">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 420, display: "block" }} role="img" aria-label={`${yLabel} versus ${xLabel}`}>
        {xt.map((v) => <g key={"x" + v}><line className="grid-l" x1={sx(v)} x2={sx(v)} y1={T} y2={H - B} /><text className="axis-t" x={sx(v)} y={H - B + 15} textAnchor="middle">{v}</text></g>)}
        {yt.map((v) => <g key={"y" + v}><line className="grid-l" x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} /><text className="axis-t" x={L - 8} y={sy(v) + 4} textAnchor="end">{v}</text></g>)}
        {quad && <>
          <line x1={sx(quad.x)} x2={sx(quad.x)} y1={T} y2={H - B} style={{ stroke: "var(--faint)", strokeDasharray: "4 4" }} />
          <line x1={L} x2={W - R} y1={sy(quad.y)} y2={sy(quad.y)} style={{ stroke: "var(--faint)", strokeDasharray: "4 4" }} />
          <text x={L + 6} y={T + 12} style={{ fontSize: 10.5 }}>{quad.tl}</text>
          <text x={W - R - 6} y={T + 12} textAnchor="end" style={{ fontSize: 10.5 }}>{quad.tr}</text>
        </>}
        <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle">{xLabel}</text>
        <text transform={`translate(12 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
        {points.map((p) => {
          const below = points.some((q) => q.id !== p.id && Math.abs(sx(q.x) - sx(p.x)) < 80 && Math.abs(sy(q.y) - sy(p.y)) < 34 && sy(q.y) < sy(p.y));
          return (
          <g key={p.id} className="bub" style={{ transform: `translate(${sx(p.x)}px, ${sy(p.y)}px)` }} onClick={() => onPick && onPick(p.id)}>
            <circle r={p.r} style={{ fill: p.color, fillOpacity: selected === p.id ? 0.45 : 0.22, stroke: p.color, strokeWidth: selected === p.id ? 2.5 : 1.2, strokeDasharray: p.dashed ? "3 3" : "none" }} />
            <circle r={3} style={{ fill: p.color }} />
            <text y={below ? p.r + 14 : -p.r - 5} textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 600, fontSize: 11.5 }}>{p.label}</text>
          </g>);
        })}
      </svg>
    </div>
  );
}

// Stacked vertical bars. data: [{label, parts:[{key,value,color}]}]
export function StackedBars({ data, format = (v) => v, height = 260, refLine }) {
  const W = 640, H = height, L = 52, R = 10, T = 12, B = 30;
  const totals = data.map((d) => d.parts.reduce((s, p) => s + p.value, 0));
  const ticks = niceTicks(Math.max(...totals, refLine || 0, 1));
  const max = ticks[ticks.length - 1];
  const bw = ((W - L - R) / data.length) * 0.56;
  const sy = (v) => H - B - (v / max) * (H - T - B);
  return (
    <div className="hscroll">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 380, display: "block" }} role="img">
        {ticks.map((v) => <g key={v}><line className="grid-l" x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} /><text className="axis-t" x={L - 8} y={sy(v) + 4} textAnchor="end">{format(v)}</text></g>)}
        {data.map((d, i) => {
          const cx = L + ((i + 0.5) * (W - L - R)) / data.length;
          let acc = 0;
          return (
            <g key={d.label}>
              {d.parts.map((p) => { const y0 = sy(acc); acc += p.value; const y1 = sy(acc);
                return p.value > 0 && <rect key={p.key} x={cx - bw / 2} y={y1} width={bw} height={Math.max(0, y0 - y1 - 1)} style={{ fill: p.color }} rx={2}><title>{`${p.key}: ${format(p.value)}`}</title></rect>; })}
              <text x={cx} y={sy(totals[i]) - 5} textAnchor="middle" className="num" style={{ fill: "var(--ink)", fontSize: 11 }}>{format(totals[i])}</text>
              <text x={cx} y={H - 10} textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
        {refLine != null && <line x1={L} x2={W - R} y1={sy(refLine)} y2={sy(refLine)} style={{ stroke: "var(--risk)", strokeDasharray: "5 4" }} />}
      </svg>
    </div>
  );
}

export function Legend({ items }) {
  return <div className="row small muted" style={{ gap: 14 }}>{items.map((i) => <span key={i.label} className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 2, background: i.color, display: "inline-block" }} />{i.label}</span>)}</div>;
}

export function Num({ label, value, src, status, sub }) {
  return (
    <div className="kpi">
      <span className="l">{label}</span>
      <span className="v" style={status === "missing" ? { color: "var(--faint)" } : status === "disputed" ? { color: "var(--risk)" } : null}>{value}</span>
      <span className="row" style={{ gap: 6 }}>{status && <Tag s={status} />}{sub && <span className="small muted">{sub}</span>}</span>
      {src && <span className="src">{src}</span>}
    </div>
  );
}

export function Field({ label, value, onChange, min, max, step, suffix, id }) {
  return (
    <div className="field">
      <label htmlFor={id}><span>{label}</span><span className="num" style={{ color: "var(--ink)" }}>{suffix ? suffix(value) : value}</span></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
