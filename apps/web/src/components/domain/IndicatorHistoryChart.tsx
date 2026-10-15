'use client';

import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { components } from '@/lib/api/schema';
import { ZoneBadge } from '@/components/domain/ZoneBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatNumber } from '@/lib/format';

type IndicatorHistoryItem = components['schemas']['IndicatorHistoryItem'];

export interface IndicatorHistoryChartProps {
  indicatorId: string;
  indicatorKind: 'kri' | 'kci';
}

function getZoneDotColor(zone: string): string {
  switch (zone) {
    case 'green':
      return 'var(--ok-line)';
    case 'yellow':
      return 'var(--warn-line)';
    case 'red':
      return 'var(--bad-line)';
    default:
      return 'var(--text-muted)';
  }
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: IndicatorHistoryItem;
}

function CustomDot(props: DotProps) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload) return null;
  const color = getZoneDotColor(payload.zone);

  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={color}
      stroke="var(--surface)"
      strokeWidth={2}
    />
  );
}

export function IndicatorHistoryChart({
  indicatorId,
  indicatorKind,
}: IndicatorHistoryChartProps) {
  const [data, setData] = useState<IndicatorHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchHistory() {
      try {
        setLoading(true);
        const res = await fetch(`/api/indicators/${indicatorId}/history`);
        if (!res.ok) {
          throw new Error('Lỗi khi tải lịch sử');
        }
        const json = await res.json();
        if (isMounted) {
          setData(json);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError((err as Error).message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchHistory();
    return () => {
      isMounted = false;
    };
  }, [indicatorId]);

  if (loading) {
    return (
      <div className="py-6 text-center text-xs text-text-muted animate-pulse">
        Đang tải biểu đồ xu hướng...
      </div>
    );
  }

  if (error || !data || data.length === 0) {
    return (
      <EmptyState
        title="Chưa có số liệu lịch sử"
        description="Chỉ số này chưa có số liệu được duyệt qua các kỳ."
        className="py-4 min-h-[120px]"
      />
    );
  }

  // Kiểm tra xem chỉ số có giá trị số hay thủ công hoàn toàn
  const hasNumericValues = data.some((d) => d.valueNum !== null);

  if (!hasNumericValues) {
    return (
      <div className="pt-2">
        <h4 className="text-xs font-semibold text-text-muted uppercase mb-2">
          Lịch sử các kỳ đã duyệt (Thủ công)
        </h4>
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-bg-tint text-text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Kỳ</th>
                <th scope="col" className="px-3 py-2 font-semibold">Giá trị ghi nhận</th>
                <th scope="col" className="px-3 py-2 font-semibold">Vùng đánh giá</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {data.map((item) => (
                <tr key={item.periodKey} className="hover:bg-bg-tint/30">
                  <td className="px-3 py-2 font-medium">{item.periodKey}</td>
                  <td className="px-3 py-2">{item.valueText || '—'}</td>
                  <td className="px-3 py-2">
                    <ZoneBadge kind={indicatorKind} zone={item.zone} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-2 space-y-2">
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span className="font-semibold uppercase">Biểu đồ xu hướng</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-state-ok-line" />
            Trong ngưỡng / Hiệu quả
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-state-warn-line" />
            Cảnh báo / Một phần
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-state-bad-line" />
            Vượt ngưỡng / Chưa hiệu quả
          </span>
        </div>
      </div>

      <div className="w-full h-48 bg-surface rounded border border-border p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
            <XAxis
              dataKey="periodKey"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              stroke="var(--border)"
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              stroke="var(--border)"
              tickFormatter={(val) => formatNumber(val)}
            />
            <Tooltip
              formatter={(val: unknown) => [typeof val === 'number' ? formatNumber(val) : '—', 'Giá trị']}
              labelFormatter={(label) => `Kỳ: ${label}`}
              contentStyle={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)',
                borderRadius: 'var(--radius-control)',
                fontSize: '12px',
              }}
            />
            <Line
              type="monotone"
              dataKey="valueNum"
              stroke="var(--brand-blue-bright)"
              strokeWidth={2}
              dot={<CustomDot />}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
