import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface CampaignFunnelProps {
  eventCounts: Record<string, number>;
}

const stages = [
  { key: 'sent', label: 'Sent', color: '#3b82f6' },
  { key: 'delivered', label: 'Delivered', color: '#22c55e' },
  { key: 'opened', label: 'Opened', color: '#a855f7' },
  { key: 'clicked', label: 'Clicked', color: '#6366f1' },
];

export default function CampaignFunnel({ eventCounts }: CampaignFunnelProps) {
  const data = stages.map((stage) => ({
    name: stage.label,
    value: eventCounts[stage.key] || 0,
    color: stage.color,
  }));

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bg-card rounded-lg border border-line p-6">
      <h3 className="text-sm font-semibold text-heading mb-4">Delivery Funnel</h3>
      {maxValue <= 1 && data.every((d) => d.value === 0) ? (
        <p className="text-sm text-dim text-center py-8">No events recorded yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
            <XAxis type="number" tick={{ fill: 'var(--color-subtle)', fontSize: 12 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={80}
              tick={{ fill: 'var(--color-subtle)', fontSize: 13 }}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-line)',
                borderRadius: 8,
                color: 'var(--color-heading)',
                fontSize: 13,
              }}
              formatter={(value: number) => [value.toLocaleString(), 'Count']}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={28}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
