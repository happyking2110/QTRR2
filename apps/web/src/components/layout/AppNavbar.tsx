'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { components } from '@/lib/api/schema';

type ProfileSummary = components['schemas']['ProfileSummary'];

export interface AppNavbarProps {
  profiles: ProfileSummary[];
}

export function AppNavbar({ profiles }: AppNavbarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Giữ nguyên chỉ cycle và period khi chuyển tab (frontend-design 3.2)
  const cycleParam = searchParams.get('cycle');
  const periodParam = searchParams.get('period');
  const navParams = new URLSearchParams();
  if (cycleParam) navParams.set('cycle', cycleParam);
  if (periodParam) navParams.set('period', periodParam);
  const queryString = navParams.toString();
  const makeHref = (basePath: string) => {
    return queryString ? `${basePath}?${queryString}` : basePath;
  };

  const navItems = [
    { label: 'Tổng quan', href: '/' },
    ...profiles.map((p) => ({
      label: p.riskCode,
      href: `/profiles/${p.riskCode}`,
    })),
    { label: 'Kế hoạch hành động', href: '/actions' },
    { label: 'Chỉ số', href: '/indicators' },
    { label: 'Báo cáo', href: '/reports' },
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <nav
      aria-label="Điều hướng chính"
      className="bg-surface border-b border-border shadow-sm sticky top-0 z-30"
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6">
        <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto whitespace-nowrap py-0 -mb-px">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={makeHref(item.href)}
                className={cn(
                  'inline-flex items-center px-3.5 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-bright rounded-t-sm',
                  active
                    ? 'border-brand-bright text-brand-navy font-semibold bg-bg-tint/40'
                    : 'border-transparent text-text-muted hover:text-text hover:border-border',
                )}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
