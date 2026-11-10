import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, MapPin, CreditCard, Calendar, Video, Clock, Tag, X, Plus, Send, Eye, MousePointerClick, AlertTriangle, Ban } from 'lucide-react';
import toast from 'react-hot-toast';
import { subscriberApi } from '../api';
import type { EmailEvent } from '../types';
import CustomFieldsCard from '../components/subscribers/CustomFieldsCard';
import EngagementCard from '../components/subscribers/EngagementCard';
import SubscriberRemindersCard from '../components/subscribers/SubscriberRemindersCard';

const statusColors: Record<string, string> = { active: 'bg-green-500/15 text-green-500', unsubscribed: 'bg-red-500/15 text-red-500', bounced: 'bg-red-500/15 text-red-500', complained: 'bg-yellow-500/15 text-yellow-500' };
const eventIcons: Record<string, typeof Mail> = { sent: Send, delivered: Mail, open: Eye, click: MousePointerClick, bounce: AlertTriangle, spamreport: Ban, unsubscribe: X };
const eventColors: Record<string, string> = { sent: 'text-blue-500', delivered: 'text-green-500', open: 'text-purple-500', click: 'text-indigo-500', bounce: 'text-red-500', spamreport: 'text-orange-500', unsubscribe: 'text-subtle' };

export default function SubscriberProfilePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [newTag, setNewTag] = useState('');

  const { data, isLoading, error } = useQuery({ queryKey: ['subscriber', id], queryFn: () => subscriberApi.get(id!), enabled: !!id });
  const addTagsMutation = useMutation({ mutationFn: (tags: string[]) => subscriberApi.addTags(id!, tags), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['subscriber', id] }); toast.success('Tag added'); setNewTag(''); } });
  const removeTagMutation = useMutation({ mutationFn: (tag: string) => subscriberApi.removeTag(id!, tag), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['subscriber', id] }); toast.success('Tag removed'); } });

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  if (error || !data) return <div className="text-center py-12"><p className="text-red-500">Failed to load subscriber profile.</p><Link to="/subscribers" className="text-link hover:underline mt-2 inline-block">Back to Subscribers</Link></div>;

  const { subscriber, events } = data;
  const initials = subscriber.name ? subscriber.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : subscriber.email[0].toUpperCase();

  return (
    <div>
      <Link to="/subscribers" className="inline-flex items-center text-sm text-subtle hover:text-heading mb-4"><ArrowLeft className="w-4 h-4 mr-1" /> Back to Subscribers</Link>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-card rounded-lg border border-line p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold mb-4">{initials}</div>
              <h2 className="text-xl font-bold text-heading">{subscriber.name || 'No name'}</h2>
              <p className="text-sm text-subtle mt-1">{subscriber.email}</p>
              <span className={`mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[subscriber.status] || 'bg-zinc-500/15 text-subtle'}`}>{subscriber.status}</span>
            </div>
            <div className="mt-6 space-y-3">
              {[
                { icon: MapPin, text: subscriber.country || 'Unknown' },
                { icon: CreditCard, text: subscriber.plan_tier || 'Free', extra: <>{subscriber.paid && <span className="ml-2 text-xs bg-green-500/15 text-green-500 px-1.5 py-0.5 rounded">Paid</span>}{subscriber.cancelled && <span className="ml-2 text-xs bg-red-500/15 text-red-500 px-1.5 py-0.5 rounded">Cancelled</span>}</> },
                { icon: Tag, text: `Source: ${subscriber.signup_source || 'Unknown'}` },
                { icon: Video, text: `usage count: ${subscriber.usage_count ?? 0}` },
                { icon: Clock, text: `Last login: ${subscriber.last_login ? new Date(subscriber.last_login).toLocaleDateString() : 'Never'}` },
                { icon: Calendar, text: `Joined ${new Date(subscriber.created_at).toLocaleDateString()}` },
              ].map(({ icon: Icon, text, extra }, i) => (
                <div key={i} className="flex items-center text-sm"><Icon className="w-4 h-4 text-dim mr-2 flex-shrink-0" /><span className="text-body">{text}</span>{extra}</div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t border-line">
              <h3 className="text-sm font-medium text-body mb-3">Engagement</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[{ v: subscriber.engagement.emails_sent, l: 'Sent' }, { v: subscriber.engagement.emails_opened, l: 'Opened' }, { v: subscriber.engagement.emails_clicked, l: 'Clicked' }].map(({ v, l }) => (
                  <div key={l}><p className="text-lg font-bold text-heading">{v}</p><p className="text-xs text-subtle">{l}</p></div>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-card rounded-lg border border-line p-6">
            <h3 className="text-sm font-medium text-body mb-3">Tags</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {subscriber.tags.length === 0 && <p className="text-sm text-dim">No tags</p>}
              {subscriber.tags.map((tag: string) => (
                <span key={tag} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-500">{tag}<button onClick={() => removeTagMutation.mutate(tag)} className="ml-1.5 hover:text-blue-400"><X className="w-3 h-3" /></button></span>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newTag.trim() && addTagsMutation.mutate([newTag.trim()])} placeholder="Add tag..." className="flex-1 text-sm bg-field border border-field-line rounded-md px-3 py-1.5 text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none" />
              <button onClick={() => newTag.trim() && addTagsMutation.mutate([newTag.trim()])} disabled={!newTag.trim()} className="inline-flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"><Plus className="w-3 h-3 mr-1" /> Add</button>
            </div>
          </div>
          <SubscriberRemindersCard subscriberId={subscriber._id} />
          <EngagementCard subscriber={subscriber} />
          <CustomFieldsCard subscriberId={subscriber._id} customAttributes={subscriber.custom_attributes || {}} />
        </div>
        <div className="lg:col-span-2">
          <div className="bg-card rounded-lg border border-line p-6">
            <h3 className="text-lg font-semibold text-heading mb-4">Activity Timeline</h3>
            {events.length === 0 ? <p className="text-sm text-dim text-center py-8">No activity recorded yet.</p> : (
              <div className="flow-root"><ul className="-mb-8">
                {events.map((event: EmailEvent, idx: number) => {
                  const Icon = eventIcons[event.event] || Mail;
                  const color = eventColors[event.event] || 'text-dim';
                  const isLast = idx === events.length - 1;
                  return (
                    <li key={event._id}><div className="relative pb-8">
                      {!isLast && <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-line" />}
                      <div className="relative flex space-x-3">
                        <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-card bg-elevated ${color}`}><Icon className="w-4 h-4" /></span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-heading capitalize">Email {event.event === 'open' ? 'Opened' : event.event === 'click' ? 'Clicked' : event.event === 'bounce' ? 'Bounced' : event.event === 'spamreport' ? 'Spam Report' : event.event === 'unsubscribe' ? 'Unsubscribed' : event.event.charAt(0).toUpperCase() + event.event.slice(1)}</p>
                            <time className="text-xs text-dim">{new Date(event.timestamp).toLocaleString()}</time>
                          </div>
                          {event.metadata?.url && <p className="mt-1 text-xs text-subtle truncate">URL: {event.metadata.url}</p>}
                          {event.metadata?.reason && <p className="mt-1 text-xs text-red-500">Reason: {event.metadata.reason}</p>}
                          {event.campaign_id && <p className="mt-1 text-xs text-dim">Campaign: {event.campaign_id}</p>}
                        </div>
                      </div>
                    </div></li>
                  );
                })}
              </ul></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
