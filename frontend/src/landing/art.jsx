/** Hand-drawn SVG for the landing page. Line art only, so it stays sharp and needs no photo files. */

/** Handover points shown on the hero drawing. `x`/`y` are in the drawing's viewBox. */
export const HANDOVER_POINTS = [
  { label: 'Bodywork photographed', x: 300, y: 172 },
  { label: 'Odometer reading noted', x: 512, y: 116 },
  { label: 'Fuel or charge level noted', x: 92, y: 166 },
  { label: 'Tyres and accessories checked', x: 610, y: 224 },
];

function Wheel({ cx }) {
  return (
    <g>
      <circle cx={cx} cy="224" r="42" />
      <circle cx={cx} cy="224" r="24" />
      <circle cx={cx} cy="224" r="5" />
      {[0, 72, 144, 216, 288].map((a) => (
        <line key={a} x1={cx} y1="219" x2={cx} y2="200" transform={`rotate(${a} ${cx} 224)`} />
      ))}
    </g>
  );
}

/** Side elevation of an SUV, drawn like an inspection sheet with numbered points. */
export function HandoverDrawing({ className = '' }) {
  return (
    <svg viewBox="0 0 800 300" fill="none" className={className} role="img" aria-label="Line drawing of a car with four numbered inspection points">
      <g stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        {/* body */}
        <path d="M70 224 L62 190 Q60 160 72 145 L110 92 Q120 78 145 76 L440 72 Q474 72 498 92 L560 140 L676 154 Q720 162 730 190 L736 224 L662 224 A52 52 0 0 0 558 224 L240 224 A52 52 0 0 0 136 224 Z" />
        {/* windows */}
        <path d="M112 140 L146 96 Q151 90 161 90 L320 87 L320 140 Z" opacity=".75" />
        <path d="M334 140 L334 87 L436 85 Q462 85 482 101 L528 140 Z" opacity=".75" />
        {/* doors, handles, sill */}
        <path d="M327 88 L327 224 M534 146 Q542 190 540 224 M112 140 L72 145" opacity=".55" />
        <path d="M283 158 H311 M498 158 H526" strokeWidth="3" opacity=".75" />
        <path d="M250 206 H548" opacity=".35" />
        {/* lights, mirror, roof rail */}
        <path d="M696 166 Q718 170 726 190 L698 186 Z" opacity=".75" />
        <path d="M63 164 L84 160 L82 190 L62 190" opacity=".75" />
        <path d="M522 126 L546 124 L552 138 L532 139" opacity=".75" />
        <path d="M170 68 L420 64" opacity=".55" />
        <Wheel cx={188} />
        <Wheel cx={610} />
      </g>
      {/* ground line with dimension ticks */}
      <g stroke="currentColor" opacity=".4">
        <line x1="10" y1="267" x2="790" y2="267" />
        {[188, 610].map((x) => <line key={x} x1={x} y1="274" x2={x} y2="286" />)}
        <line x1="188" y1="280" x2="610" y2="280" strokeDasharray="3 6" />
      </g>
      {HANDOVER_POINTS.map((p, i) => (
        <g key={p.label}>
          <circle cx={p.x} cy={p.y} r="14" className="fill-accent-300" />
          <text x={p.x} y={p.y + 5} textAnchor="middle" className="fill-brand-900 text-[15px] font-extrabold">{i + 1}</text>
        </g>
      ))}
    </svg>
  );
}

const arches = (rear, front) => `L${front + 15} 76 A15 15 0 0 0 ${front - 15} 76 L${rear + 15} 76 A15 15 0 0 0 ${rear - 15} 76 Z`;

const SHAPES = {
  hatchback: { rear: 58, front: 176, body: 'M16 76 L14 56 Q14 46 24 42 L52 20 Q56 16 64 16 L128 16 Q138 16 146 22 L170 42 L206 48 Q222 52 224 64 L226 76', windows: 'M38 42 L58 24 Q60 22 66 22 L96 22 L96 42 Z M102 42 L102 22 L128 22 Q136 22 142 27 L158 42 Z' },
  sedan: { rear: 60, front: 180, body: 'M10 76 L10 58 Q12 50 30 46 L60 42 L84 22 Q90 16 100 16 L146 16 Q156 16 164 24 L182 42 L214 48 Q228 52 230 64 L232 76', windows: 'M70 42 L88 26 Q92 22 100 22 L120 22 L120 42 Z M126 42 L126 22 L146 22 Q153 22 159 28 L172 42 Z' },
  compactSuv: { rear: 62, front: 178, body: 'M14 76 L12 50 Q12 40 22 34 L44 14 Q48 10 58 10 L140 10 Q150 10 158 18 L176 38 L208 44 Q224 48 226 62 L228 76', windows: 'M34 36 L50 19 Q54 16 60 16 L98 16 L98 36 Z M104 36 L104 16 L140 16 Q148 16 153 21 L166 36 Z' },
  suv: { rear: 58, front: 186, body: 'M10 76 L8 38 Q8 28 16 22 L26 12 Q30 8 40 8 L150 8 Q158 8 164 14 L184 36 L216 40 Q230 44 232 58 L234 76', windows: 'M18 34 L30 17 Q33 14 40 14 L92 14 L92 34 Z M98 34 L98 14 L150 14 Q156 14 160 18 L174 34 Z' },
  muv: { rear: 58, front: 190, body: 'M10 76 L8 36 Q8 24 18 18 L24 12 Q28 8 38 8 L156 8 Q166 8 174 16 L196 40 L218 46 Q230 50 232 62 L234 76', windows: 'M16 36 L28 16 Q31 14 38 14 L72 14 L72 36 Z M78 36 L78 14 L118 14 L118 36 Z M124 36 L124 14 L156 14 Q163 14 168 19 L184 36 Z' },
};

/** Small side profile for a body type. */
export function BodySilhouette({ type, className = '' }) {
  const s = SHAPES[type];
  return (
    <svg viewBox="0 0 244 96" fill="none" className={className} aria-hidden>
      <g stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <path d={`${s.body} ${arches(s.rear, s.front)}`} />
        <path d={s.windows} opacity=".6" />
        {[s.rear, s.front].map((x) => (
          <g key={x}>
            <circle cx={x} cy="76" r="12" />
            <circle cx={x} cy="76" r="4" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Indian number plate. `black` is the self-drive fleet plate, `white` a private owner's. */
export function Plate({ tone, children }) {
  const black = tone === 'black';
  return (
    <div className={`inline-flex shrink-0 items-stretch self-start overflow-hidden whitespace-nowrap rounded-[6px] border-2 font-mono text-[15px] font-bold tracking-[0.12em] sm:text-[17px] ${black ? 'border-white/30 bg-ink-950 text-[#F2C230]' : 'border-ink-900 bg-white text-ink-950'}`}>
      <span className="flex flex-col items-center justify-center bg-[#1F4FA3] px-1.5 text-[8px] font-bold leading-none tracking-normal text-white">
        <span className="mb-0.5 h-1.5 w-1.5 rounded-full bg-white/80" />
        IND
      </span>
      <span className="px-3 py-1.5">{children}</span>
    </div>
  );
}
