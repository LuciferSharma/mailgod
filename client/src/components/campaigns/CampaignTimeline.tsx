import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface TimelineEntry {
  _id: { event: string; hour: string };
  count: number;
}

interface CampaignTimelineProps {
  timeline: TimelineEntry[];
}

const eventLines = [
  { key: 'sent', color: '#3b82f6', label: 'Sent' },
  { key: 'delivered', color: '#22c55e', label: 'Delivered' },
  { key: 'opened', color: '#a855f7', label: 'Opened' },
  { key: 'clicked', color: '#6366f1', label: 'Clicked' },
];

export default function CampaignTimeline({ timeline }: CampaignTimelineProps) {
  // Pivot timeline data: group by hour, spread events as columns
  const hourMap = new Map<string, Record<string, number>>();
  timeline.forEach(({ _id, count }) => {
    const existing = hourMap.get(_id.hour) || {};
    existing[_id.event] = count;
    hourMap.set(_id.hour, existing);
  });

  const data = Array.from(hourMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, events]) => ({
      hour: hour.slice(5), // "MM-DD HH:00"
      sent: events.sent || 0,
      delivered: events.delivered || 0,
      opened: events.opened || 0,
      clicked: events.clicked || 0,
    }));

  return (
    <div className="bg-card rounded-lg border border-line p-6">
      <h3 className="text-sm font-semibold text-heading mb-4">Event Timeline</h3>
      {data.length === 0 ? (
        <p className="text-sm text-dim text-center py-8">No timeline data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ left: 0, right: 20 }}>
            <XAxis
              dataKey="hour"
              tick={{ fill: 'var(--color-subtle)', fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fill: 'var(--color-subtle)', fontSize: 12 }} width={50} />
            <Tooltip
              contentStyle={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-line)',
                borderRadius: 8,
                color: 'var(--color-heading)',
                fontSize: 13,
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: 'var(--color-subtle)' }}
            />
            {eventLines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
