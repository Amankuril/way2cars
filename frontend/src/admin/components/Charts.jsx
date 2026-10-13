import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Chart colours from the design tokens (single brand hue; recessive grid and axes). */
export const CHART = { brand: '#1875B9', grid: '#E3E8EC', axis: '#728189', ink: '#1D2C32', cursor: '#EAF3FA' };

const shortDate = (d) => {
  const [y, m, day] = String(d).split('-').map(Number);
  if (!y || !m || !day) return d;
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

function TooltipBox({ active, payload, label, format, name }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 shadow-pop">
      <p className="text-caption font-semibold text-ink-500">{shortDate(label)}</p>
      <p className="num mt-0.5 text-bodySm font-bold text-ink-900">
        {format(payload[0].value)} <span className="font-medium text-ink-500">{name}</span>
      </p>
    </div>
  );
}

/**
 * Single-series daily chart. data: [{ date: 'YYYY-MM-DD', [dataKey]: number }].
 * `kind`: 'bar' (counts / amounts per day) or 'line' (trends over longer ranges).
 */
export function DailyChart({ data, dataKey, name, format = (v) => v, axisFormat, kind = 'bar', height = 240 }) {
  const common = {
    data,
    margin: { top: 8, right: 8, bottom: 0, left: 0 },
  };
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="0" />
      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART.grid }} minTickGap={16} />
      <YAxis tickFormatter={axisFormat || format} tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={64} allowDecimals={false} />
      <Tooltip content={<TooltipBox format={format} name={name} />} cursor={kind === 'bar' ? { fill: CHART.cursor } : { stroke: CHART.axis, strokeDasharray: '3 3' }} />
    </>
  );
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={`${name} per day`}>
      <ResponsiveContainer width="100%" height="100%">
        {kind === 'bar' ? (
          <BarChart {...common} barCategoryGap="28%">
            {axes}
            <Bar dataKey={dataKey} name={name} fill={CHART.brand} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        ) : (
          <LineChart {...common}>
            {axes}
            <Line type="monotone" dataKey={dataKey} name={name} stroke={CHART.brand} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} isAnimationActive={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Fills missing IST days with zeros so bars line up with the calendar. */
export function fillDays(rows, from, to, keys) {
  const map = new Map((rows || []).map((r) => [r.date, r]));
  const out = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
    const key = d.toISOString().slice(0, 10);
    const r = map.get(key);
    out.push({ date: key, ...Object.fromEntries(keys.map((k) => [k, r?.[k] || 0])), ...(r || {}) });
  }
  return out;
}

/** Compact rupee axis labels: ₹12k, ₹1.2L, ₹3.4Cr (input in paise). */
export function compactRupees(paise) {
  const r = (paise || 0) / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  if (r >= 1e3) return `₹${(r / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return `₹${Math.round(r)}`;
}
