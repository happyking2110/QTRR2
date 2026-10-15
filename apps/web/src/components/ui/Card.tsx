import React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Card({
  title,
  subtitle,
  badge,
  action,
  children,
  className = '',
  bodyClassName = '',
  ...props
}: CardProps) {
  const hasHeader = Boolean(title || subtitle || badge || action);

  return (
    <div
      className={`rounded-card border border-border/80 bg-surface shadow-sm ${className}`}
      {...props}
    >
      {hasHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div>
            {title && (
              <h2 className="text-base font-semibold text-text sm:text-lg">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
            )}
          </div>
          {(badge || action) && (
            <div className="flex items-center gap-2">
              {badge}
              {action}
            </div>
          )}
        </div>
      )}
      <div className={hasHeader ? `p-5 ${bodyClassName}` : `p-5 ${bodyClassName}`}>
        {children}
      </div>
    </div>
  );
}
