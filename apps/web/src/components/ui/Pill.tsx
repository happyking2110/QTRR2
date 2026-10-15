import React from 'react';

export interface PillProps {
  levelLabel?: string | null;
  score?: number | null;
  className?: string;
}

export function Pill({ levelLabel, score, className = '' }: PillProps) {
  const normalized = (levelLabel || '').trim().toLowerCase();

  let style = 'bg-state-none-bg text-state-none-fg ring-1 ring-state-none-line/30';

  if (normalized === 'cao' || normalized === 'rất cao' || normalized === 'rat cao') {
    style = 'bg-state-bad-bg text-state-bad-fg ring-1 ring-state-bad-line/30';
  } else if (normalized === 'trung bình' || normalized === 'trung binh') {
    style = 'bg-state-warn-bg text-state-warn-fg ring-1 ring-state-warn-line/30';
  } else if (normalized === 'thấp' || normalized === 'thap') {
    style = 'bg-state-ok-bg text-state-ok-fg ring-1 ring-state-ok-line/30';
  }

  const labelText = levelLabel ? levelLabel : 'Chưa nhập';

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${style} ${className}`}
    >
      {score !== undefined && score !== null && (
        <span className="tabular-nums font-bold">{score}</span>
      )}
      {score !== undefined && score !== null && <span className="text-[10px] opacity-60">·</span>}
      <span className="font-medium">{labelText}</span>
    </span>
  );
}
