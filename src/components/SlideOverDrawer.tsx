import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface SlideOverDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  printVisible?: boolean;
}

export function SlideOverDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  printVisible = false,
}: SlideOverDrawerProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end ${printVisible ? '' : 'no-print'}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/35 backdrop-blur-[2px] transition-opacity no-print"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col bg-white border-l border-slate-200/80 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 px-6 py-5 no-print">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
