import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  distribution?: React.ReactNode;
  icon?: React.ReactNode;
  href?: string;
  className?: string;
  testId?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  distribution,
  icon,
  href,
  className,
  testId,
}: StatCardProps) {
  const content = (
    <div
      data-testid={testId}
      className={cn(
        'bg-surface rounded-card border border-border/80 p-5 shadow-sm flex flex-col justify-between transition-all h-full',
        href && 'hover:border-brand-bright/60 hover:shadow-md cursor-pointer group',
        className,
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-text-muted">
            {title}
          </p>
          {icon ? (
            <div className="text-text-muted/70 group-hover:text-brand-bright transition-colors">
              {icon}
            </div>
          ) : href ? (
            <ChevronRight
              className="w-4 h-4 text-text-muted group-hover:text-brand-bright group-hover:translate-x-0.5 transition-all"
              aria-hidden="true"
            />
          ) : null}
        </div>
        <div className="mt-2 text-3xl font-bold tracking-tight text-text tabular-nums flex items-baseline gap-2">
          {value}
        </div>
      </div>

      {(subtitle || distribution) && (
        <div className="mt-2 flex flex-col gap-1">
          {distribution && <div>{distribution}</div>}
          {subtitle && (
            <p className="text-xs text-text-muted">{subtitle}</p>
          )}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block no-underline">
        {content}
      </Link>
    );
  }

  return content;
}
