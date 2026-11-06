'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonthlyTrendPoint } from '@/server/services/analytics';

/**
 * Incident trend.
 *
 * Lines, not stacked areas: the series overlap in meaning (a critical ticket is
 * also a ticket), so overlapping fills produced wedges that read as separate
 * volumes. Flat 1.75px strokes with one shared baseline stay honest.
 *
 * The legend lives outside the canvas as a static row, and the same numbers are
 * rendered as a table in the page, so this SVG is `aria-hidden` and the table is
 * the accessible source of truth.
 */

const SERIES = [
  { key: 'total', label: 'Total', color: 'var(--color-chart-1)' },
  { key: 'critical', label: 'Kritis', color: 'var(--color-chart-4)' },
  { key: 'resolved', label: 'Selesai', color: 'var(--color-chart-2)' },
] as const;

export function IncidentTrendChart({ data }: { data: MonthlyTrendPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-text-muted">
        Belum ada data insiden untuk ditampilkan.
      </p>
    );
  }

  return (
    <div>
      {/* Static legend: no Recharts legend, no reflow during resize */}
      <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-2">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-text-secondary">
            <span
              aria-hidden="true"
              className="h-0.5 w-3 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>

      <div className="h-[190px] w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -24 }}>
            <CartesianGrid
              stroke="var(--color-border-subtle)"
              strokeDasharray="3 3"
              vertical={false}
            />
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
              width={40}
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
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={1.75}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
