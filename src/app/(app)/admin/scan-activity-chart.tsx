'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/cn';
import type { DailyTrendPoint } from '@/server/services/analytics';

/**
 * Chart + accessible data matrix (Global Dashboard Design §4.5).
 *
 * The chart is the reading aid; the numbers below it are the record. The toggle
 * is the metric switch from the spec header, and the matrix stays in the DOM
 * (not a modal) so print and screen readers get every value.
 */

type Metric = 'scans' | 'threats';

export function ScanActivityChart({ data }: { data: DailyTrendPoint[] }) {
  const [metric, setMetric] = useState<Metric>('scans');
  const [showMatrix, setShowMatrix] = useState(false);

  const totalScans = data.reduce((a, d) => a + d.scans, 0);
  const totalThreats = data.reduce((a, d) => a + d.threats, 0);
  const avgResponse =
    data.filter((d) => d.avgResponseMs > 0).reduce((a, d) => a + d.avgResponseMs, 0) /
    Math.max(data.filter((d) => d.avgResponseMs > 0).length, 1);

  const sparse = data.length > 14 ? data.filter((_, i) => i % 3 === 0) : data;

  return (
    <div className="rounded-md border border-border-subtle bg-surface-raised">
      {/* Card header: title, range, summary, metric switch */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-text-primary">Aktivitas Pemindaian</h2>
          <p className="mt-0.5 text-[11.5px] text-text-muted">
            {data.length} hari terakhir ·{' '}
            <span className="numeric">{totalScans}</span> pemindaian ·{' '}
            <span className="numeric">{totalThreats}</span> temuan
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="label-xs">Rata-rata respons</p>
            <p className="numeric text-[13px] font-medium text-text-primary">
              {avgResponse > 0 ? `${Math.round(avgResponse)} ms` : '—'}
            </p>
          </div>
          <div
            role="group"
            aria-label="Pilih metrik grafik"
            className="flex items-center gap-px rounded-sm border border-border-subtle bg-surface-sunken p-px"
          >
            {(
              [
                ['scans', 'Pemindaian'],
                ['threats', 'Temuan'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMetric(value)}
                aria-pressed={metric === value}
                className={cn(
                  'cursor-pointer rounded-sm px-2 py-1 text-[11.5px] font-medium transition-colors duration-fast',
                  metric === value
                    ? 'bg-surface-raised text-text-primary shadow-none'
                    : 'text-text-muted hover:text-text-secondary',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-2 py-3">
        {data.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-text-muted">Belum ada data pemindaian.</p>
        ) : (
          <div className="h-[200px] w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              {metric === 'scans' ? (
                <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -22 }}>
                  <CartesianGrid
                    stroke="var(--color-border-subtle)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dayLabel"
                    ticks={sparse.map((d) => d.dayLabel)}
                    stroke="var(--color-text-muted)"
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 10.5 }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--color-border-subtle)' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke="var(--color-text-muted)"
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 10.5 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: 'var(--color-text-secondary)', marginBottom: 2 }}
                    itemStyle={{ color: 'var(--color-text-primary)' }}
                    cursor={{ stroke: 'var(--color-border-strong)' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="scans"
                    name="Pemindaian"
                    stroke="var(--color-chart-2)"
                    strokeWidth={1.75}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                  />
                </LineChart>
              ) : (
                <BarChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -22 }}>
                  <CartesianGrid
                    stroke="var(--color-border-subtle)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dayLabel"
                    ticks={sparse.map((d) => d.dayLabel)}
                    stroke="var(--color-text-muted)"
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 10.5 }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--color-border-subtle)' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke="var(--color-text-muted)"
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 10.5 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: 'var(--color-text-secondary)', marginBottom: 2 }}
                    itemStyle={{ color: 'var(--color-text-primary)' }}
                    cursor={{ fill: 'var(--color-surface-sunken)' }}
                  />
                  <Bar dataKey="threats" name="Temuan" fill="var(--color-chart-4)" radius={[2, 2, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Numeric matrix: always in the DOM, printable, screen-reader source of truth */}
      <div className="border-t border-border-subtle">
        <button
          type="button"
          onClick={() => setShowMatrix((v) => !v)}
          aria-expanded={showMatrix}
          className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-2 text-left text-[11.5px] text-text-muted transition-colors duration-fast hover:text-text-secondary"
        >
          <span>Tabel angka pendamping</span>
          <span className="numeric">{showMatrix ? '− sembunyikan' : '+ tampilkan'}</span>
        </button>

        <div className={cn('overflow-x-auto px-4 pb-3', !showMatrix && 'hidden print:block')}>
          <table className="w-full border-collapse text-[11.5px]">
            <caption className="sr-only">
              Pemindaian dan temuan per hari, {data.length} hari terakhir
            </caption>
            <thead>
              <tr className="border-b border-border-subtle">
                <th scope="col" className="py-1.5 pr-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-text-muted">
                  Tanggal
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right text-[10.5px] font-semibold uppercase tracking-wider text-text-muted">
                  Pemindaian
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right text-[10.5px] font-semibold uppercase tracking-wider text-text-muted">
                  Temuan
                </th>
                <th scope="col" className="py-1.5 text-right text-[10.5px] font-semibold uppercase tracking-wider text-text-muted">
                  Respons
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {data.map((d) => (
                <tr key={d.date}>
                  <td className="numeric whitespace-nowrap py-1 pr-3 text-text-secondary">{d.dayLabel}</td>
                  <td className="numeric py-1 pr-3 text-right text-text-primary">{d.scans}</td>
                  <td
                    className={cn(
                      'numeric py-1 pr-3 text-right',
                      d.threats > 0 ? 'font-medium text-status-critical' : 'text-text-muted',
                    )}
                  >
                    {d.threats}
                  </td>
                  <td className="numeric py-1 text-right text-text-muted">
                    {d.avgResponseMs > 0 ? `${d.avgResponseMs} ms` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const tooltipStyle = {
  background: 'var(--color-surface-overlay)',
  border: '1px solid var(--color-border-strong)',
  borderRadius: 'var(--radius-md)',
  fontSize: 12,
  color: 'var(--color-text-primary)',
} as const;
