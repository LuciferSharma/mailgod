import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { templateApi, segmentApi } from '../../api';
import { X, Trash2, Zap, Mail, Clock, GitBranch, Shuffle, Tag, Globe, LogOut } from 'lucide-react';

const nodeTypeMeta: Record<string, { label: string; icon: any; gradient: string }> = {
  trigger: { label: 'Trigger', icon: Zap, gradient: 'from-emerald-500 to-green-600' },
  sendEmail: { label: 'Send Email', icon: Mail, gradient: 'from-blue-500 to-indigo-600' },
  delay: { label: 'Delay', icon: Clock, gradient: 'from-slate-600 to-zinc-700' },
  condition: { label: 'Condition', icon: GitBranch, gradient: 'from-amber-500 to-orange-500' },
  abSplit: { label: 'A/B Split', icon: Shuffle, gradient: 'from-violet-500 to-purple-600' },
  addTag: { label: 'Add Tag', icon: Tag, gradient: 'from-orange-500 to-amber-500' },
  removeTag: { label: 'Remove Tag', icon: Tag, gradient: 'from-rose-500 to-orange-500' },
  webhook: { label: 'Webhook', icon: Globe, gradient: 'from-teal-500 to-cyan-500' },
  exit: { label: 'Exit', icon: LogOut, gradient: 'from-red-500 to-rose-500' },
};

interface NodeConfigPanelProps {
  node: any;
  onUpdate: (data: any) => void;
  onClose: () => void;
  onDelete: () => void;
}

function InputField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputClass = 'w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm bg-zinc-800 text-zinc-200 placeholder-zinc-600 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 outline-none transition-all';
const selectClass = 'w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm bg-zinc-800 text-zinc-200 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 outline-none transition-all appearance-none cursor-pointer';

export default function NodeConfigPanel({ node, onUpdate, onClose, onDelete }: NodeConfigPanelProps) {
  const [localData, setLocalData] = useState(node.data);
  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: templateApi.list });
  const { data: segments } = useQuery({ queryKey: ['segments'], queryFn: segmentApi.list });

  useEffect(() => { setLocalData(node.data); }, [node.id]);

  const update = (partial: any) => {
    const merged = { ...localData, ...partial };
    setLocalData(merged);
    onUpdate(merged);
  };

  const meta = nodeTypeMeta[node.type] || { label: node.type, icon: Zap, gradient: 'from-zinc-600 to-zinc-700' };
  const Icon = meta.icon;

  return (
    <div className="w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
      {/* Header */}
      <div className={`bg-gradient-to-r ${meta.gradient} px-4 py-3 flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-2.5">
          <div className="bg-white/15 p-1.5 rounded-lg backdrop-blur-sm">
            <Icon className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">{meta.label}</h3>
            <p className="text-[10px] text-white/60">Configure settings</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/15 rounded-lg transition-colors">
          <X className="w-4 h-4 text-white/70" />
        </button>
      </div>

      {/* Config body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {node.type === 'trigger' && (
          <>
            <InputField label="Trigger Type">
              <select value={localData.triggerType || 'manual'} onChange={(e) => update({
                triggerType: e.target.value,
                segmentId: '', segmentName: '',
                frequency: 'daily', scheduleTime: '09:00', scheduleDow: '1', scheduleDom: '1',
              })} className={selectClass}>
                <option value="manual">Manual</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </InputField>
            {localData.triggerType === 'manual' && (
              <div className="bg-zinc-800 rounded-lg px-3 py-2.5 border border-zinc-700/50">
                <p className="text-xs text-zinc-400">Subscribers are enrolled manually using the <span className="font-semibold text-zinc-300">Enroll Segment</span> button or the API.</p>
              </div>
            )}
            {localData.triggerType === 'scheduled' && (
              <>
                <InputField label="Target Segment">
                  <select value={localData.segmentId || ''} onChange={(e) => {
                    const seg = segments?.find((s: any) => s._id === e.target.value);
                    update({ segmentId: e.target.value, segmentName: seg?.name || '' });
                  }} className={selectClass}>
                    <option value="">All active subscribers</option>
                    {segments?.map((s: any) => <option key={s._id} value={s._id}>{s.name} ({s.subscriber_count ?? '?'})</option>)}
                  </select>
                </InputField>
                <InputField label="Check Frequency">
                  <select value={localData.frequency || 'daily'} onChange={(e) => update({ frequency: e.target.value })} className={selectClass}>
                    <option value="hourly">Every Hour</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </InputField>
                {localData.frequency !== 'hourly' && (
                  <InputField label="Time">
                    <input type="time" value={localData.scheduleTime || '09:00'} onChange={(e) => update({ scheduleTime: e.target.value })} className={inputClass} />
                  </InputField>
                )}
                {localData.frequency === 'weekly' && (
                  <InputField label="Day of Week">
                    <select value={localData.scheduleDow || '1'} onChange={(e) => update({ scheduleDow: e.target.value })} className={selectClass}>
                      {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                        <option key={i} value={String(i)}>{d}</option>
                      ))}
                    </select>
                  </InputField>
                )}
                {localData.frequency === 'monthly' && (
                  <InputField label="Day of Month">
                    <select value={localData.scheduleDom || '1'} onChange={(e) => update({ scheduleDom: e.target.value })} className={selectClass}>
                      {Array.from({ length: 28 }, (_, i) => (
                        <option key={i + 1} value={String(i + 1)}>{i + 1}</option>
                      ))}
                    </select>
                  </InputField>
                )}
                <div className="bg-violet-500/10 rounded-lg px-3 py-2 border border-violet-500/20">
                  <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">Schedule</p>
                  <p className="text-sm text-violet-300 mt-0.5">
                    {localData.frequency === 'hourly' ? 'Every hour' :
                     localData.frequency === 'weekly' ? `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parseInt(localData.scheduleDow || '1')]} at ${localData.scheduleTime || '09:00'}` :
                     localData.frequency === 'monthly' ? `Day ${localData.scheduleDom || '1'} at ${localData.scheduleTime || '09:00'}` :
                     `Daily at ${localData.scheduleTime || '09:00'}`}
                    {localData.segmentName ? ` → ${localData.segmentName}` : ' → all active subscribers'}
                  </p>
                </div>
                <div className="bg-zinc-800 rounded-lg px-3 py-2.5 border border-zinc-700/50">
                  <p className="text-xs text-zinc-400">When you activate this flow, a scheduled job will be created automatically. New matching subscribers will be enrolled on each run.</p>
                </div>
              </>
            )}
          </>
        )}

        {node.type === 'sendEmail' && (
          <>
            <InputField label="Email Template">
              <select value={localData.templateId || ''} onChange={(e) => {
                const t = templates?.find((t: any) => t._id === e.target.value);
                update({ templateId: e.target.value, templateName: t?.name || '', subject: t?.subject || '' });
              }} className={selectClass}>
                <option value="">Select template...</option>
                {templates?.map((t: any) => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </InputField>
            {localData.templateId && localData.templateName && (
              <div className="bg-blue-500/10 rounded-lg px-3 py-2 border border-blue-500/20">
                <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Selected</p>
                <p className="text-sm font-medium text-blue-300 mt-0.5">{localData.templateName}</p>
              </div>
            )}
            <InputField label="Subject Line Override">
              <input value={localData.subject || ''} onChange={(e) => update({ subject: e.target.value })} placeholder="Use template default..." className={inputClass} />
            </InputField>
          </>
        )}

        {node.type === 'delay' && (
          <>
            <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700/50 text-center">
              <div className="text-3xl font-bold text-zinc-100 tabular-nums">{localData.delay?.value || 1}</div>
              <div className="text-xs font-medium text-zinc-500 uppercase mt-0.5">{localData.delay?.unit || 'days'}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InputField label="Duration">
                <input type="number" min="1" value={localData.delay?.value || 1} onChange={(e) => update({ delay: { ...localData.delay, value: parseInt(e.target.value) || 1 } })} className={inputClass} />
              </InputField>
              <InputField label="Unit">
                <select value={localData.delay?.unit || 'days'} onChange={(e) => update({ delay: { ...localData.delay, unit: e.target.value } })} className={selectClass}>
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </InputField>
            </div>
          </>
        )}

        {node.type === 'condition' && (
          <>
            <InputField label="Field">
              <select value={localData.condition?.field || ''} onChange={(e) => update({ condition: { ...localData.condition, field: e.target.value } })} className={selectClass}>
                <option value="">Select field...</option>
                <optgroup label="User Properties">
                  <option value="plan_tier">Plan Tier</option>
                  <option value="paid">Is Paid</option>
                  <option value="cancelled">Is Cancelled</option>
                  <option value="status">Status</option>
                  <option value="country">Country</option>
                </optgroup>
                <optgroup label="Activity">
                  <option value="usage_count">Usage Count</option>
                  <option value="signup_source">Signup Source</option>
                </optgroup>
                <optgroup label="Engagement">
                  <option value="engagement.emails_opened">Emails Opened</option>
                  <option value="engagement.emails_clicked">Emails Clicked</option>
                </optgroup>
                <optgroup label="Tags">
                  <option value="tags">Has Tag</option>
                </optgroup>
              </select>
            </InputField>
            <InputField label="Operator">
              <select value={localData.condition?.operator || 'equals'} onChange={(e) => update({ condition: { ...localData.condition, operator: e.target.value } })} className={selectClass}>
                <option value="equals">Equals</option>
                <option value="not_equals">Not Equals</option>
                <option value="contains">Contains</option>
                <option value="gt">Greater Than</option>
                <option value="lt">Less Than</option>
                <option value="exists">Exists</option>
                <option value="not_exists">Not Exists</option>
              </select>
            </InputField>
            <InputField label="Value">
              <input value={localData.condition?.value || ''} onChange={(e) => update({ condition: { ...localData.condition, value: e.target.value } })} placeholder="Enter value..." className={inputClass} />
            </InputField>
            {localData.condition?.field && (
              <div className="bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
                <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Rule Preview</p>
                <p className="text-sm text-amber-300 mt-0.5 font-mono">
                  {localData.condition.field} <span className="text-zinc-500">{localData.condition.operator}</span> {String(localData.condition.value || '...')}
                </p>
              </div>
            )}
          </>
        )}

        {node.type === 'abSplit' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-violet-500/10 rounded-xl p-3 border border-violet-500/20 text-center">
                <div className="text-2xl font-bold text-violet-300 tabular-nums">{localData.splitPercentage || 50}%</div>
                <div className="text-[10px] font-semibold text-violet-500 uppercase mt-0.5">Path A</div>
              </div>
              <div className="bg-purple-500/10 rounded-xl p-3 border border-purple-500/20 text-center">
                <div className="text-2xl font-bold text-purple-300 tabular-nums">{100 - (localData.splitPercentage || 50)}%</div>
                <div className="text-[10px] font-semibold text-purple-500 uppercase mt-0.5">Path B</div>
              </div>
            </div>
            <InputField label="Path A Percentage">
              <input
                type="range"
                min="5"
                max="95"
                step="5"
                value={localData.splitPercentage || 50}
                onChange={(e) => update({ splitPercentage: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
              <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                <span>5%</span>
                <span className="text-zinc-400">{localData.splitPercentage || 50}% / {100 - (localData.splitPercentage || 50)}%</span>
                <span>95%</span>
              </div>
            </InputField>
          </>
        )}

        {(node.type === 'addTag' || node.type === 'removeTag') && (
          <InputField label="Tag Name">
            <input value={localData.tag || ''} onChange={(e) => update({ tag: e.target.value })} placeholder="e.g. vip, engaged, churned" className={inputClass} />
            {localData.tag && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] text-zinc-600">Preview:</span>
                <span className="px-2.5 py-1 bg-zinc-800 rounded-md text-xs font-mono font-medium text-zinc-300 border border-zinc-700/50">{localData.tag}</span>
              </div>
            )}
          </InputField>
        )}

        {node.type === 'webhook' && (
          <InputField label="Webhook URL">
            <input value={localData.webhookUrl || ''} onChange={(e) => update({ webhookUrl: e.target.value })} placeholder="https://api.example.com/hook" className={`${inputClass} font-mono text-xs`} />
          </InputField>
        )}

        {node.type === 'exit' && (
          <div className="bg-red-500/10 rounded-lg px-4 py-3 border border-red-500/20 text-center">
            <LogOut className="w-5 h-5 text-red-400 mx-auto mb-1" />
            <p className="text-sm text-red-300 font-medium">End of Flow</p>
            <p className="text-xs text-red-500/60 mt-0.5">Subscribers exit the flow here</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-zinc-800 shrink-0">
        <button onClick={onDelete} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-300 transition-all">
          <Trash2 className="w-3.5 h-3.5" />
          Delete Node
        </button>
      </div>
    </div>
  );
}
