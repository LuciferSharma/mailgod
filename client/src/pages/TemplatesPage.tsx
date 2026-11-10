import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Eye, Send, FileText, X, ChevronUp, Sparkles, SplitSquareHorizontal,
  Monitor, Smartphone, Pencil, Copy, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { templateApi } from '../api';
import { templatePresets, type TemplatePreset } from '../utils/templatePresets';
import { useTheme } from '../stores/themeStore';
import EmailPreviewModal from '../components/templates/EmailPreviewModal';
import type { Template } from '../types';
import PageHint from '../components/PageHint';

const inputClass = 'bg-field border border-field-line rounded-md px-3 py-2 text-sm text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none';

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formPreviewText, setFormPreviewText] = useState('');
  const [formCategory, setFormCategory] = useState('marketing');
  const [formHtml, setFormHtml] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewPreviewText, setPreviewPreviewText] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [testSendId, setTestSendId] = useState<string | null>(null);
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [showFormPreview, setShowFormPreview] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const theme = useTheme((s) => s.theme);

  const onCodeChange = useCallback((val: string) => setFormHtml(val), []);

  const scrollFormIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    });
  }, []);

  const populateForm = (template: Template) => {
    setEditingId(template._id);
    setFormName(template.name);
    setFormSubject(template.subject);
    setFormPreviewText(template.preview_text || '');
    setFormCategory(template.category);
    setFormHtml(template.html_content || '');
    setShowLivePreview(false);
    setShowFormPreview(false);
  };

  const applyPreset = (preset: TemplatePreset) => {
    setFormName(preset.name);
    setFormSubject(preset.subject);
    setFormCategory(preset.category);
    setFormHtml(preset.html);
  };

  const startEdit = async (template: Template) => {
    const id = String(template._id);
    setLoadingEditId(id);
    try {
      const full = await templateApi.get(id);
      populateForm(full);
      setShowForm(true);
      scrollFormIntoView();
    } catch {
      toast.error('Failed to load template for editing');
    } finally {
      setLoadingEditId(null);
    }
  };

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: templateApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Template>) => templateApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template created');
      resetForm();
    },
    onError: () => toast.error('Failed to create template'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Template> }) => templateApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template updated');
      resetForm();
    },
    onError: () => toast.error('Failed to update template'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => templateApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template deleted');
    },
    onError: () => toast.error('Failed to delete template'),
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => templateApi.duplicate(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template duplicated');
    },
    onError: () => toast.error('Failed to duplicate template'),
  });

  const handleDuplicate = (template: Template) => {
    const suggested = `${template.name} (copy)`;
    const name = window.prompt('Name for the duplicated template:', suggested);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name is required');
      return;
    }
    duplicateMutation.mutate({ id: template._id, name: trimmed });
  };

  const previewMutation = useMutation({
    mutationFn: ({ id, subject, previewText }: { id: string; subject: string; previewText: string }) =>
      templateApi.preview(id).then((data) => ({ ...data, subject, previewText })),
    onSuccess: (data) => {
      setPreviewHtml(data.html);
      setPreviewSubject(data.subject);
      setPreviewPreviewText(data.previewText);
    },
    onError: () => toast.error('Failed to preview template'),
  });

  const testSendMutation = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) => templateApi.testSend(id, email),
    onSuccess: () => {
      toast.success('Test email sent');
      setTestEmail('');
      setTestSendId(null);
    },
    onError: () => toast.error('Failed to send test email'),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName('');
    setFormSubject('');
    setFormPreviewText('');
    setFormCategory('marketing');
    setFormHtml('');
  };

  const extractVariables = (html: string): string[] => {
    const matches = html.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
  };

  const handleSubmit = () => {
    if (!formName.trim() || !formSubject.trim()) {
      toast.error('Name and subject are required');
      return;
    }
    const payload = {
      name: formName,
      subject: formSubject,
      preview_text: formPreviewText,
      category: formCategory,
      html_content: formHtml,
      variables: extractVariables(formHtml),
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const detectedVars = extractVariables(formHtml);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Templates</h1>
          <p className="text-subtle mt-1">Email templates</p>
        </div>
        <button
          onClick={() => {
            if (showForm) resetForm();
            else {
              setShowForm(true);
              scrollFormIntoView();
            }
          }}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          {showForm ? <ChevronUp className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          {showForm ? 'Cancel' : 'Create Template'}
        </button>
      </div>

      <PageHint storageKey="templates" lines={[
        'Use {{name}}, {{first_name}}, {{email}} for subscriber data (auto-filled). Custom variables like {{company_name}} are set in Settings.',
        'Always send a test email before using a template in a campaign. Use the send icon (\u2709) on each row.',
      ]} />

      {showForm && (
        <div ref={formRef} className="bg-card rounded-lg border border-line p-6 mb-6">
          <h3 className="text-lg font-semibold text-heading mb-4">{editingId ? 'Edit Template' : 'New Template'}</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-body mb-1">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Welcome Email"
                  className={`w-full ${inputClass}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-body mb-1">Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className={`w-full ${inputClass}`}
                >
                  <option value="marketing">Marketing</option>
                  <option value="transactional">Transactional</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="retention">Retention</option>
                  <option value="reactivation">Reactivation</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-1">Subject</label>
              <input
                type="text"
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
                placeholder="Email subject line..."
                className={`w-full ${inputClass}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-1">Preview Text</label>
              <input
                type="text"
                value={formPreviewText}
                onChange={(e) => setFormPreviewText(e.target.value)}
                placeholder="Text shown in email preview..."
                className={`w-full ${inputClass}`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <label className="block text-sm font-medium text-body">HTML Content</label>
                  <button
                    type="button"
                    onClick={() => setShowLivePreview(!showLivePreview)}
                    className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border transition-colors ${
                      showLivePreview
                        ? 'bg-blue-500/15 text-blue-500 border-blue-500/30'
                        : 'bg-elevated text-subtle border-line hover:text-heading'
                    }`}
                  >
                    <SplitSquareHorizontal className="w-3 h-3" />
                    Preview
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-dim" />
                  <span className="text-xs text-dim mr-1">Presets:</span>
                  {templatePresets.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="px-2.5 py-1 text-xs bg-elevated hover:bg-blue-500/15 hover:text-blue-500 text-subtle border border-line rounded-md transition-colors"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className={`${showLivePreview ? 'grid grid-cols-2 gap-3' : ''}`}>
                <div className="border border-field-line rounded-md overflow-hidden">
                  <CodeMirror
                    value={formHtml}
                    onChange={onCodeChange}
                    height={showLivePreview ? '420px' : '320px'}
                    theme={theme === 'dark' ? 'dark' : 'light'}
                    extensions={[html()]}
                    placeholder="<html>...</html>"
                    basicSetup={{
                      lineNumbers: true,
                      foldGutter: true,
                      bracketMatching: true,
                      autocompletion: true,
                    }}
                  />
                </div>
                {showLivePreview && (
                  <div className="border border-field-line rounded-md overflow-hidden bg-[#f0f0f0] dark:bg-zinc-800 flex flex-col">
                    {/* Device toggle */}
                    <div className="flex items-center justify-center gap-1 py-2 bg-white/80 dark:bg-zinc-900/80 border-b border-field-line">
                      <button
                        type="button"
                        onClick={() => setPreviewDevice('desktop')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          previewDevice === 'desktop'
                            ? 'bg-blue-500/15 text-blue-500'
                            : 'text-gray-500 hover:text-gray-700 dark:text-zinc-500 dark:hover:text-zinc-300'
                        }`}
                      >
                        <Monitor className="w-3 h-3" /> Desktop
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewDevice('mobile')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          previewDevice === 'mobile'
                            ? 'bg-blue-500/15 text-blue-500'
                            : 'text-gray-500 hover:text-gray-700 dark:text-zinc-500 dark:hover:text-zinc-300'
                        }`}
                      >
                        <Smartphone className="w-3 h-3" /> Mobile
                      </button>
                    </div>
                    {/* Preview frame */}
                    <div className="flex-1 flex justify-center overflow-auto p-3">
                      {formHtml ? (
                        <div
                          className="bg-white rounded shadow-sm transition-all duration-200 shrink-0"
                          style={{ width: previewDevice === 'mobile' ? 375 : '100%', maxWidth: '100%' }}
                        >
                          <iframe
                            ref={iframeRef}
                            srcDoc={formHtml}
                            className="w-full border-0 rounded"
                            style={{ height: 388 }}
                            sandbox="allow-same-origin"
                            title="Live Preview"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-400 dark:text-zinc-600 text-sm">
                          Start typing HTML to see a preview
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {detectedVars.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-body mb-1.5">Detected Variables</label>
                <div className="flex flex-wrap gap-2">
                  {detectedVars.map(v => {
                    const isSubscriber = ['name', 'first_name', 'email', 'plan_tier', 'unsubscribe_url'].includes(v);
                    return (
                      <span
                        key={v}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          isSubscriber
                            ? 'bg-green-500/15 text-green-500'
                            : 'bg-purple-500/15 text-purple-500'
                        }`}
                        title={isSubscriber ? 'Auto-filled from subscriber data' : 'Global variable — set in Settings'}
                      >
                        {`{{${v}}}`}
                      </span>
                    );
                  })}
                </div>
                <p className="text-[11px] text-dim mt-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500/60 mr-1 align-middle" /> Subscriber (auto)
                  <span className="inline-block w-2 h-2 rounded-full bg-purple-500/60 mr-1 ml-3 align-middle" /> Global (Settings &rarr; Template Variables)
                </p>
              </div>
            )}
            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setShowFormPreview(true)}
                disabled={!formHtml.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-line rounded-md text-body hover:bg-elevated disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Eye className="w-4 h-4" />
                Preview as Email
              </button>
              <div className="flex gap-3">
                <button onClick={resetForm} className="px-4 py-2 text-sm border border-line rounded-md text-body hover:bg-elevated">
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {editingId
                    ? (updateMutation.isPending ? 'Saving...' : 'Save Changes')
                    : (createMutation.isPending ? 'Creating...' : 'Create Template')
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFormPreview && formHtml && (
        <EmailPreviewModal
          html={formHtml}
          subject={formSubject || 'Email Subject'}
          previewText={formPreviewText}
          onClose={() => setShowFormPreview(false)}
        />
      )}

      {previewHtml !== null && (
        <EmailPreviewModal
          html={previewHtml}
          subject={previewSubject}
          previewText={previewPreviewText}
          onClose={() => setPreviewHtml(null)}
        />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : !templates || templates.length === 0 ? (
        <div className="bg-card rounded-lg border border-line p-12 text-center">
          <FileText className="w-12 h-12 text-dim mx-auto mb-3" />
          <p className="text-subtle">No templates created yet.</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-line overflow-hidden">
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-elevated">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Subject</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-subtle uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {templates.map((template: Template) => (
                <tr key={template._id} className="hover:bg-elevated/50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-heading">{template.name}</div>
                    {Array.isArray(template.variables) && template.variables.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {template.variables.map(v => (
                          <span key={v} className="text-xs bg-elevated text-subtle px-1.5 py-0.5 rounded">
                            {v}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-subtle">{template.subject}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-500/15 text-subtle capitalize">
                      {template.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-subtle">
                    {new Date(template.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(template)}
                        disabled={loadingEditId === template._id}
                        className="p-1.5 text-dim hover:text-amber-500 rounded disabled:opacity-50"
                        title="Edit"
                      >
                        {loadingEditId === template._id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Pencil className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => previewMutation.mutate({ id: template._id, subject: template.subject, previewText: template.preview_text || '' })}
                        className="p-1.5 text-dim hover:text-blue-500 rounded"
                        title="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDuplicate(template)}
                        disabled={duplicateMutation.isPending}
                        className="p-1.5 text-dim hover:text-blue-500 rounded disabled:opacity-50"
                        title="Duplicate"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      {testSendId === template._id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="email"
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                            placeholder="email@example.com"
                            className="w-40 text-xs bg-field border border-field-line rounded px-2 py-1 text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none"
                          />
                          <button
                            onClick={() => {
                              if (testEmail.trim()) {
                                testSendMutation.mutate({ id: template._id, email: testEmail });
                              }
                            }}
                            disabled={testSendMutation.isPending}
                            className="p-1 text-blue-500 hover:text-blue-400"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setTestSendId(null); setTestEmail(''); }}
                            className="p-1 text-dim hover:text-body"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setTestSendId(template._id)}
                          className="p-1.5 text-dim hover:text-green-500 rounded"
                          title="Test Send"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm('Delete this template?')) deleteMutation.mutate(template._id);
                        }}
                        className="p-1.5 text-dim hover:text-red-500 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
