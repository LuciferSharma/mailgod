import { useState } from 'react';
import { X, Monitor, Smartphone, Tablet } from 'lucide-react';

interface EmailPreviewModalProps {
  html: string;
  subject?: string;
  previewText?: string;
  fromName?: string;
  fromEmail?: string;
  onClose: () => void;
}

type Device = 'desktop' | 'tablet' | 'mobile';

const devices: { key: Device; label: string; icon: typeof Monitor; width: number }[] = [
  { key: 'desktop', label: 'Desktop', icon: Monitor, width: 680 },
  { key: 'tablet', label: 'Tablet', icon: Tablet, width: 768 },
  { key: 'mobile', label: 'Mobile', icon: Smartphone, width: 375 },
];

function gmailWrap(html: string): string {
  let body = html;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) body = bodyMatch[1];

  const styleBlocks: string[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = styleRegex.exec(html)) !== null) {
    styleBlocks.push(match[0]);
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; -webkit-font-smoothing: antialiased; }
    img { max-width: 100%; height: auto; }
    a { color: #1a73e8; }
  </style>
  ${styleBlocks.join('\n  ')}
</head>
<body>${body}</body>
</html>`;
}

export default function EmailPreviewModal({
  html,
  subject = 'Email Subject',
  previewText = '',
  fromName = 'Your Company',
  fromEmail = 'hello@yourdomain.com',
  onClose,
}: EmailPreviewModalProps) {
  const [device, setDevice] = useState<Device>('desktop');
  const activeDevice = devices.find((d) => d.key === device)!;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-line shrink-0">
          <h3 className="text-base font-semibold text-heading">Email Preview</h3>
          <div className="flex items-center gap-1 bg-elevated rounded-lg p-0.5">
            {devices.map((d) => {
              const Icon = d.icon;
              return (
                <button
                  key={d.key}
                  onClick={() => setDevice(d.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    device === d.key
                      ? 'bg-card text-heading shadow-sm'
                      : 'text-subtle hover:text-heading'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {d.label}
                </button>
              );
            })}
          </div>
          <button onClick={onClose} className="p-1.5 text-dim hover:text-heading rounded-lg hover:bg-elevated transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-auto bg-[#f0f0f0] dark:bg-zinc-800 p-6 flex justify-center">
          <div
            className="transition-all duration-300 ease-in-out"
            style={{ width: activeDevice.width, maxWidth: '100%' }}
          >
            {/* Gmail chrome */}
            <div className="bg-white dark:bg-zinc-900 rounded-t-lg border border-b-0 border-gray-200 dark:border-zinc-700 px-5 py-4">
              <div className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-1 truncate">{subject}</div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {fromName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-gray-800 dark:text-zinc-200 truncate">
                    <span className="font-medium">{fromName}</span>
                    <span className="text-gray-500 dark:text-zinc-500 ml-1 text-xs">&lt;{fromEmail}&gt;</span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-zinc-500">to me</div>
                </div>
              </div>
              {previewText && (
                <div className="mt-2 text-xs text-gray-400 dark:text-zinc-600 truncate italic">{previewText}</div>
              )}
            </div>

            {/* Email body */}
            <div className="bg-white dark:bg-white rounded-b-lg border border-gray-200 dark:border-zinc-700 overflow-hidden">
              <iframe
                srcDoc={gmailWrap(html)}
                className="w-full border-0"
                style={{ height: device === 'mobile' ? '500px' : '600px' }}
                sandbox="allow-same-origin"
                title="Email Preview"
              />
            </div>

            {/* Device info */}
            <div className="text-center mt-3">
              <span className="text-xs text-gray-500 dark:text-zinc-500">
                {activeDevice.width}px &middot; {activeDevice.label} viewport
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
