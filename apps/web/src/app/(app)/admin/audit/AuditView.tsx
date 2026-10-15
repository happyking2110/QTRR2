'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  RotateCcw,
  Loader2,
  Eye,
} from 'lucide-react';
import type { components } from '@/lib/api/schema';
import { PageHero } from '@/components/ui/PageHero';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateTime } from '@/lib/format';
import { apiSend, ApiClientError } from '@/lib/api/client';
import {
  AuditDiffDrawer,
  getActionLabel,
  ACTION_LABELS,
  type AuditEntry,
} from './AuditDiffDrawer';

export type AuditPage = components['schemas']['AuditPage'];
export type CurrentUser = components['schemas']['CurrentUser'];

export interface AuditFilters {
  actor: string;
  entity: string;
  action: string;
  from: string;
  to: string;
}

export interface AuditViewProps {
  initialData: AuditPage;
  initialFilters: AuditFilters;
  currentUser?: CurrentUser;
}

export function AuditView({ initialData, initialFilters }: AuditViewProps) {
  const router = useRouter();

  // Logs state
  const [items, setItems] = useState<AuditEntry[]>(initialData.items || []);
  const [nextCursor, setNextCursor] = useState<string | null>(initialData.nextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter form state
  const [filters, setFilters] = useState<AuditFilters>({
    actor: initialFilters.actor || '',
    entity: initialFilters.entity || '',
    action: initialFilters.action || '',
    from: initialFilters.from || '',
    to: initialFilters.to || '',
  });

  // Drawer state
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Build query string helper
  const buildQuery = (overrideFilters?: Partial<AuditFilters>, cursor?: string | null) => {
    const f = { ...filters, ...overrideFilters };
    const params = new URLSearchParams();
    if (f.actor.trim()) params.set('actor', f.actor.trim());
    if (f.entity.trim()) params.set('entity', f.entity.trim());
    if (f.action.trim()) params.set('action', f.action.trim());
    if (f.from.trim()) params.set('from', f.from.trim());
    if (f.to.trim()) params.set('to', f.to.trim());
    if (cursor) params.set('cursor', cursor);
    return params.toString();
  };

  // Handle filter submit
  const handleApplyFilters = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsFiltering(true);
    setError(null);

    const queryString = buildQuery();
    // Update URL query params
    router.push(queryString ? `/admin/audit?${queryString}` : '/admin/audit');

    try {
      const res = await apiSend<AuditPage>(
        'GET',
        `/api/audit${queryString ? `?${queryString}` : ''}`,
      );
      setItems(res.items || []);
      setNextCursor(res.nextCursor);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Không thể tải dữ liệu nhật ký');
      }
    } finally {
      setIsFiltering(false);
    }
  };

  // Handle reset filters
  const handleResetFilters = async () => {
    const emptyFilters: AuditFilters = {
      actor: '',
      entity: '',
      action: '',
      from: '',
      to: '',
    };
    setFilters(emptyFilters);
    setIsFiltering(true);
    setError(null);
    router.push('/admin/audit');

    try {
      const res = await apiSend<AuditPage>('GET', '/api/audit');
      setItems(res.items || []);
      setNextCursor(res.nextCursor);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Không thể tải lại nhật ký');
      }
    } finally {
      setIsFiltering(false);
    }
  };

  // Handle Load More
  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setError(null);

    try {
      const queryString = buildQuery(undefined, nextCursor);
      const res = await apiSend<AuditPage>('GET', `/api/audit?${queryString}`);

      setItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const newAdditions = (res.items || []).filter((i) => !existingIds.has(i.id));
        return [...prev, ...newAdditions];
      });
      setNextCursor(res.nextCursor);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Không thể tải thêm nhật ký');
      }
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Open diff drawer
  const handleOpenDetail = (entry: AuditEntry) => {
    setSelectedEntry(entry);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Hero */}
      <PageHero
        eyebrow="Quản trị hệ thống"
        title="Nhật ký hoạt động"
        description="Truy vết đầy đủ các thay đổi dữ liệu, thao tác nghiệp vụ và bảo mật hệ thống MBF Risk Monitor"
      />

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-800 flex items-center justify-between"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs underline hover:no-underline font-medium ml-4"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Filter Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
        <form onSubmit={handleApplyFilters} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Actor search */}
            <div>
              <label
                htmlFor="filter-actor"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Người thực hiện
              </label>
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="filter-actor"
                  type="text"
                  placeholder="Email hoặc họ tên..."
                  value={filters.actor}
                  onChange={(e) => setFilters({ ...filters, actor: e.target.value })}
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Entity search */}
            <div>
              <label
                htmlFor="filter-entity"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Đối tượng (Entity)
              </label>
              <input
                id="filter-entity"
                type="text"
                placeholder="vd: indicator, period..."
                value={filters.entity}
                onChange={(e) => setFilters({ ...filters, entity: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* Action Select */}
            <div>
              <label
                htmlFor="filter-action"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Hành động
              </label>
              <select
                id="filter-action"
                value={filters.action}
                onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
              >
                <option value="">Tất cả hành động</option>
                {Object.entries(ACTION_LABELS).map(([actCode, actLabel]) => (
                  <option key={actCode} value={actCode}>
                    {actLabel} ({actCode})
                  </option>
                ))}
              </select>
            </div>

            {/* From Date */}
            <div>
              <label
                htmlFor="filter-from"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Từ ngày
              </label>
              <input
                id="filter-from"
                type="date"
                value={filters.from}
                onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* To Date */}
            <div>
              <label
                htmlFor="filter-to"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Đến ngày
              </label>
              <input
                id="filter-to"
                type="date"
                value={filters.to}
                onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleResetFilters}
              disabled={isFiltering}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Đặt lại</span>
            </button>

            <button
              type="submit"
              disabled={isFiltering}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm disabled:opacity-50"
            >
              {isFiltering ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Filter className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Áp dụng lọc</span>
            </button>
          </div>
        </form>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="Không tìm thấy nhật ký"
              description="Không có bản ghi nhật ký hoạt động nào khớp với tiêu chí tìm kiếm hiện tại."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-testid="audit-table">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <th className="py-3 px-4 w-44">Thời gian</th>
                  <th className="py-3 px-4 w-52">Người thực hiện</th>
                  <th className="py-3 px-4">Hành động</th>
                  <th className="py-3 px-4 w-48">Đối tượng</th>
                  <th className="py-3 px-4 w-24 text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    data-testid={`audit-row-${item.id}`}
                    onClick={() => handleOpenDetail(item)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                  >
                    {/* Time */}
                    <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap align-top">
                      <div>{formatDateTime(item.at)}</div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">#{item.id}</div>
                    </td>

                    {/* Actor */}
                    <td className="py-3 px-4 align-top">
                      {item.user ? (
                        <div>
                          <div className="font-semibold text-slate-900">{item.user.fullName}</div>
                          <div className="text-slate-500 text-[11px] truncate max-w-[190px]">
                            {item.user.email}
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                          Hệ thống
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 align-top">
                      <div className="font-semibold text-slate-800">
                        {getActionLabel(item.action)}
                      </div>
                      <div className="text-slate-400 font-mono text-[11px] mt-0.5">
                        {item.action}
                      </div>
                    </td>

                    {/* Entity */}
                    <td className="py-3 px-4 align-top">
                      <div className="font-mono text-slate-800 font-medium">
                        {item.entity}
                        {item.entityId ? (
                          <span className="text-slate-500 font-normal ml-1">#{item.entityId}</span>
                        ) : null}
                      </div>
                    </td>

                    {/* Action Button */}
                    <td className="py-3 px-4 text-right align-middle">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail(item);
                        }}
                        aria-label={`Xem chi tiết nhật ký #${item.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Diff</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination: Load More */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div data-testid="audit-count" className="text-xs text-slate-500">
            Hiển thị <span className="font-semibold text-slate-800">{items.length}</span> bản ghi
          </div>

          <div>
            {nextCursor ? (
              <button
                type="button"
                data-testid="load-more-btn"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 transition shadow-sm disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Đang tải...</span>
                  </>
                ) : (
                  <span>Tải thêm</span>
                )}
              </button>
            ) : items.length > 0 ? (
              <span role="status" className="text-xs text-slate-400 italic">
                Đã hiển thị tất cả nhật ký
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Diff Drawer Modal */}
      <AuditDiffDrawer
        entry={selectedEntry}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
