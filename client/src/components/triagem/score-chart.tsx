import { formatShortDate } from './format';
import { PRIORITY_TEXT, type PriorityLevel } from './badges';

type Point = { at: number; score: number; priority: PriorityLevel | null; riskSignal: boolean };

const COLOR: Record<PriorityLevel, string> = {
  alta: '#AD531F',
  media: '#FF9C62',
  baixa: '#32764C',
};

/** Evolução da pontuação geral (0–100) com as linhas de corte (PROVISÓRIAS). */
export function ScoreChart({
  points,
  cutoffs,
}: {
  points: Point[];
  cutoffs: { alta: number; media: number };
}) {
  if (points.length === 0) {
    return <p className="text-sm text-tri-tinta/80">Ainda não há check-ins concluídos.</p>;
  }
  const W = 640;
  const H = 220;
  const pad = { l: 40, r: 16, t: 16, b: 32 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (s: number) => pad.t + ih - (s / 100) * ih;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.score)}`).join(' ');

  const summary = points
    .map(
      (p) =>
        `${formatShortDate(p.at)}: ${p.score} pontos${p.priority ? `, ${PRIORITY_TEXT[p.priority].toLowerCase()}` : ''}${p.riskSignal ? ', com sinal de risco' : ''}`
    )
    .join('; ');

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Evolução da pontuação. ${summary}`}>
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#0A2436" strokeOpacity={0.08} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#0A2436" fillOpacity={0.7}>
              {t}
            </text>
          </g>
        ))}
        {(
          [
            ['alta', cutoffs.alta],
            ['media', cutoffs.media],
          ] as const
        ).map(([level, value]) => (
          <g key={level}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(value)}
              y2={y(value)}
              stroke={COLOR[level]}
              strokeWidth={1.5}
              strokeDasharray="6 5"
            />
            <text x={W - pad.r} y={y(value) - 5} textAnchor="end" fontSize="11" fontWeight={600} fill={level === 'alta' ? '#AD531F' : '#0A2436'}>
              corte {level === 'alta' ? 'alta' : 'média'} ({value}) · provisório
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#1B4765" strokeWidth={2.5} strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.at}>
            {p.riskSignal ? (
              <circle cx={x(i)} cy={y(p.score)} r={11} fill="none" stroke="#AD531F" strokeWidth={2.5} />
            ) : null}
            <circle
              cx={x(i)}
              cy={y(p.score)}
              r={6}
              fill={p.priority ? COLOR[p.priority] : '#D9D9FF'}
              stroke="#fff"
              strokeWidth={2}
            />
            <text x={x(i)} y={y(p.score) - 14} textAnchor="middle" fontSize="12" fontWeight={700} fill="#0A2436">
              {p.score}
            </text>
            <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="#0A2436" fillOpacity={0.75}>
              {formatShortDate(p.at)}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tri-tinta/80">
        <span>Pontuação geral de 0 a 100 (média ponderada das escalas).</span>
        <span className="inline-flex items-center gap-1">
          <svg width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" fill="none" stroke="#AD531F" strokeWidth="2" />
          </svg>
          anel = check-in com sinal de risco
        </span>
      </figcaption>
    </figure>
  );
}
