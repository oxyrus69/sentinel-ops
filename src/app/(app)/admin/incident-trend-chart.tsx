'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlyTrendPoint } from '@/server/services/analytics';

/**
 * Incident trend.
 *
 * Flat fills (12% opacity), horizontal grid only, no gradients. The numbers are
 * also rendered as a table in the page, so this chart is explicitly decorative
 * for assistive tech (`aria-hidden` on the SVG container) and the table is the
 * accessible source of truth.
 */
export function IncidentTrendChart({ data }: { data: MonthlyTrendPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-text-muted">
        Belum ada data insiden untuk ditampilkan.
      </p>
    );
  }

  return (
    <div className="h-[240px] w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="var(--color-border-subtle)" strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="monthLabel"
            stroke="var(--color-text-muted)"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border-subtle)' }}
          />
          <YAxis
            allowDecimals={false}
            stroke="var(--color-text-muted)"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface-overlay)',
              border: '1px solid var(--color-border-strong)',
              borderRadius: 'var(--radius-md)',
              fontSize: 12,
              color: 'var(--color-text-primary)',
            }}
            labelStyle={{ color: 'var(--color-text-secondary)', marginBottom: 4 }}
            itemStyle={{ color: 'var(--color-text-primary)' }}
            cursor={{ stroke: 'var(--color-border-strong)' }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: 'var(--color-text-secondary)' }}
            iconType="square"
            iconSize={8}
          />
          <Area
            type="monotone"
            dataKey="total"
            name="Total tiket"
            stroke="var(--color-chart-1)"
            fill="var(--color-chart-1)"
            fillOpacity={0.12}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
          <Area
            type="monotone"
            dataKey="critical"
            name="Kritis"
            stroke="var(--color-chart-4)"
            fill="var(--color-chart-4)"
            fillOpacity={0.12}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
          <Area
            type="monotone"
            dataKey="resolved"
            name="Selesai"
            stroke="var(--color-chart-2)"
            fill="var(--color-chart-2)"
            fillOpacity={0.1}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
