import React from 'react';

export interface PageHeroProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  children,
  className = '',
}: PageHeroProps) {
  return (
    <div className={`mb-6 flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div>
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-bright">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-text sm:text-[30px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-3xl text-sm text-text-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
      {children}
    </div>
  );
}
