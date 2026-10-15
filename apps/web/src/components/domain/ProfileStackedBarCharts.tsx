'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import type { components } from '@/lib/api/schema';
import { Card } from '@/components/ui/Card';

type ProfileSummary = components['schemas']['ProfileSummary'];

export interface ProfileStackedBarChartsProps {
  profiles: ProfileSummary[];
}

// Màu sắc từ mục 2.2 và tokens.css
const COLOR_GREEN = '#2E7D32'; // Trong ngưỡng / Hoàn thành
const COLOR_YELLOW = '#F9A825'; // Cảnh báo / Có nguy cơ chậm
const COLOR_RED = '#C62828'; // Vượt ngưỡng / Quá hạn
const COLOR_BLUE = '#237BD3'; // Đang thực hiện
const COLOR_GRAY = '#9AA3AE'; // Chưa có số liệu / Chưa bắt đầu

const formatBarLabel = (v: unknown): string => (Number(v) > 0 ? String(v) : '');

interface TooltipItem {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface p-2.5 shadow-md text-xs">
      <p className="font-semibold text-text mb-1">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => {
          if (entry.value === 0) return null;
          return (
            <div
              key={entry.name}
              className="flex items-center justify-between gap-3 text-text-muted"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span>{entry.name}:</span>
              </span>
              <span className="font-semibold text-text tabular-nums">{entry.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProfileKriChart({ profiles }: { profiles: ProfileSummary[] }) {
  const chartHeight = Math.max(160, profiles.length * 34 + 40);

  const data = profiles.map((p) => ({
    riskCode: p.riskCode,
    name: p.name,
    green: p.kri.green,
    yellow: p.kri.yellow,
    red: p.kri.red,
    noData: p.kri.noData,
    total: p.kri.total,
  }));

  return (
    <Card
      title="Trạng thái KRI theo hồ sơ"
      subtitle="Số KRI theo vùng ngưỡng tại kỳ hiện tại"
    >
      <div className="w-full pt-1" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 10, right: 15, left: 0, bottom: 5 }}
            barCategoryGap={8}
          >
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            />
            <YAxis
              type="category"
              dataKey="riskCode"
              tick={{ fontSize: 11, fill: 'var(--text)' }}
              width={75}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="green" stackId="kri" fill={COLOR_GREEN} name="Trong ngưỡng">
              <LabelList
                dataKey="green"
                position="center"
                fill="#ffffff"
                fontSize={11}
                fontWeight={600}
                formatter={formatBarLabel}
              />
            </Bar>
            <Bar dataKey="yellow" stackId="kri" fill={COLOR_YELLOW} name="Cảnh báo">
              <LabelList
                dataKey="yellow"
                position="center"
                fill="#ffffff"
                fontSize={11}
                fontWeight={600}
                formatter={formatBarLabel}
              />
            </Bar>
            <Bar dataKey="red" stackId="kri" fill={COLOR_RED} name="Vượt ngưỡng">
              <LabelList
                dataKey="red"
                position="center"
                fill="#ffffff"
                fontSize={11}
                fontWeight={600}
                formatter={formatBarLabel}
              />
            </Bar>
            <Bar dataKey="noData" stackId="kri" fill={COLOR_GRAY} name="Chưa có số liệu">
              <LabelList
                dataKey="noData"
                position="center"
                fill="#ffffff"
                fontSize={11}
                fontWeight={600}
                formatter={formatBarLabel}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Chú giải màu */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: COLOR_GREEN }} />
          <span>Trong ngưỡng</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: COLOR_YELLOW }} />
          <span>Cảnh báo</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: COLOR_RED }} />
          <span>Vượt ngưỡng</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: COLOR_GRAY }} />
          <span>Chưa có số liệu</span>
        </span>
      </div>

      {/* Bảng tương đương ẩn cho trình đọc màn hình */}
      <div className="sr-only">
        <table aria-label="Bảng số liệu trạng thái KRI theo hồ sơ">
          <thead>
            <tr>
              <th scope="col">Mã hồ sơ</th>
              <th scope="col">Trong ngưỡng</th>
              <th scope="col">Cảnh báo</th>
              <th scope="col">Vượt ngưỡng</th>
              <th scope="col">Chưa có số liệu</th>
              <th scope="col">Tổng số</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.riskCode}>
                <td>{p.riskCode}</td>
                <td>{p.kri.green}</td>
                <td>{p.kri.yellow}</td>
                <td>{p.kri.red}</td>
                <td>{p.kri.noData}</td>
                <td>{p.kri.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function ProfileActionsChart({ profiles }: { profiles: ProfileSummary[] }) {
  const chartHeight = Math.max(160, profiles.length * 34 + 40);

  const data = profiles.map((p) => ({
    riskCode: p.riskCode,
    name: p.name,
    completed: p.actions.completed,
    inProgress: p.actions.inProgress,
    atRisk: p.actions.atRisk,
    overdue: p.actions.overdue,
    notStarted: p.actions.notStarted,
    total: p.actions.total,
  }));

  return (
    <Card
      title="Kế hoạch hành động theo hồ sơ"
      subtitle="Số kế hoạch theo trạng thái thực hiện"
    >
      <div className="w-full pt-1" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 10, right: 15, left: 0, bottom: 5 }}
            barCategoryGap={8}
          >
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            />
            <YAxis
              type="category"
              dataKey="riskCode"
              tick={{ fontSize: 11, fill: 'var(--text)' }}
              width={75}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="completed" stackId="actions" fill={COLOR_GREEN} name="Hoàn thành">
              <LabelList
                dataKey="completed"
                position="center"
                fill="#ffffff"
                fontSize={11}
                fontWeight={600}
                formatter={formatBarLabel}
              />
            </Bar>
            <Bar dataKey="inProgress" stackId="actions" fill={COLOR_BLUE} name="Đang thực hiện">
              <LabelList
                dataKey="inProgress"
                position="center"
                fill="#ffffff"
                fontSize={11}
                fontWeight={600}
                formatter={formatBarLabel}
              />
            </Bar>
            <Bar dataKey="atRisk" stackId="actions" fill={COLOR_YELLOW} name="Có nguy cơ chậm">
              <LabelList
                dataKey="atRisk"
                position="center"
                fill="#ffffff"
                fontSize={11}
                fontWeight={600}
                formatter={formatBarLabel}
              />
            </Bar>
            <Bar dataKey="overdue" stackId="actions" fill={COLOR_RED} name="Quá hạn">
              <LabelList
                dataKey="overdue"
                position="center"
                fill="#ffffff"
                fontSize={11}
                fontWeight={600}
                formatter={formatBarLabel}
              />
            </Bar>
            <Bar dataKey="notStarted" stackId="actions" fill={COLOR_GRAY} name="Chưa bắt đầu">
              <LabelList
                dataKey="notStarted"
                position="center"
                fill="#ffffff"
                fontSize={11}
                fontWeight={600}
                formatter={formatBarLabel}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Chú giải màu */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: COLOR_GREEN }} />
          <span>Hoàn thành</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: COLOR_BLUE }} />
          <span>Đang thực hiện</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: COLOR_YELLOW }} />
          <span>Có nguy cơ chậm</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: COLOR_RED }} />
          <span>Quá hạn</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: COLOR_GRAY }} />
          <span>Chưa bắt đầu</span>
        </span>
      </div>

      {/* Bảng tương đương ẩn cho trình đọc màn hình */}
      <div className="sr-only">
        <table aria-label="Bảng số liệu kế hoạch hành động theo hồ sơ">
          <thead>
            <tr>
              <th scope="col">Mã hồ sơ</th>
              <th scope="col">Hoàn thành</th>
              <th scope="col">Đang thực hiện</th>
              <th scope="col">Có nguy cơ chậm</th>
              <th scope="col">Quá hạn</th>
              <th scope="col">Chưa bắt đầu</th>
              <th scope="col">Tổng số</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.riskCode}>
                <td>{p.riskCode}</td>
                <td>{p.actions.completed}</td>
                <td>{p.actions.inProgress}</td>
                <td>{p.actions.atRisk}</td>
                <td>{p.actions.overdue}</td>
                <td>{p.actions.notStarted}</td>
                <td>{p.actions.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function ProfileStackedBarCharts({ profiles }: ProfileStackedBarChartsProps) {
  return (
    <div className="flex flex-col gap-6">
      <ProfileKriChart profiles={profiles} />
      <ProfileActionsChart profiles={profiles} />
    </div>
  );
}
