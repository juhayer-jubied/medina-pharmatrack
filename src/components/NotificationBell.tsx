import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Info,
  Scale,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import type { NotificationRecord, PublicUser } from '../lib/pharmaLogic';

const PUBLIC_READ_STORAGE_KEY = 'medina_public_read_notifications';

function getPublicReadIds(): string[] {
  try {
    const raw = localStorage.getItem(PUBLIC_READ_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePublicReadIds(ids: string[]): void {
  try {
    localStorage.setItem(PUBLIC_READ_STORAGE_KEY, JSON.stringify(Array.from(new Set(ids))));
  } catch {
    // Ignore storage quota errors
  }
}

function formatNotificationTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

interface NotificationBellProps {
  user: PublicUser | null;
}

export function NotificationBell({ user }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [publicReadIds, setPublicReadIds] = useState<string[]>(() => getPublicReadIds());
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getNotifications();
      setNotifications(data.notifications);
    } catch {
      // Non-blocking background fetch
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();
    const interval = window.setInterval(() => {
      void fetchNotifications();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [fetchNotifications, user?.id]);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function isRead(item: NotificationRecord): boolean {
    if (user) {
      return Array.isArray(item.readBy) && item.readBy.includes(user.id);
    }
    return publicReadIds.includes(item.notificationId);
  }

  const unreadCount = notifications.filter((n) => !isRead(n)).length;

  async function handleMarkAllRead() {
    if (notifications.length === 0) return;
    if (user) {
      setNotifications((prev) =>
        prev.map((n) =>
          n.readBy.includes(user.id) ? n : { ...n, readBy: [...n.readBy, user.id] }
        )
      );
      try {
        await api.markNotificationsRead();
      } catch {
        // Ignore error
      }
    } else {
      const merged = Array.from(
        new Set([...publicReadIds, ...notifications.map((n) => n.notificationId)])
      );
      setPublicReadIds(merged);
      savePublicReadIds(merged);
    }
  }

  async function handleMarkSingleRead(item: NotificationRecord) {
    if (isRead(item)) return;
    if (user) {
      setNotifications((prev) =>
        prev.map((n) =>
          n.notificationId === item.notificationId
            ? { ...n, readBy: [...n.readBy, user.id] }
            : n
        )
      );
      try {
        await api.markNotificationsRead(item.notificationId);
      } catch {
        // Ignore error
      }
    } else {
      const merged = Array.from(new Set([...publicReadIds, item.notificationId]));
      setPublicReadIds(merged);
      savePublicReadIds(merged);
    }
  }

  function getAudienceLabel(item: NotificationRecord): string {
    if (item.targetType === 'INDIVIDUAL') return 'Direct Alert';
    if (item.targetType === 'ALL_COMPANIES') return 'All Companies';
    if (item.targetType === 'ALL_PHARMACIES') return 'All Pharmacies';
    if (item.targetType === 'PUBLIC') return 'Public Notice';
    return 'National Notice';
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            void fetchNotifications();
          }
        }}
        aria-label="DGDA Notifications"
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all shadow-2xs"
      >
        <Bell className="h-4 w-4 text-slate-700" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[10px] font-bold text-white shadow-xs">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="DGDA Notifications Panel"
          className="absolute right-0 mt-2.5 w-[330px] sm:w-[400px] rounded-2xl border border-slate-200 bg-white shadow-2xl z-50 overflow-hidden"
        >
          {/* Popup Header */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
              <span className="text-sm font-semibold text-slate-900">DGDA Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void handleMarkAllRead()}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#0F766E] hover:bg-teal-50 transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-100">
            {loading && notifications.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                Loading DGDA notices...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 px-6 text-center">
                <Bell className="mx-auto h-7 w-7 text-slate-300" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-slate-700">No notifications yet</p>
                <p className="mt-1 text-xs text-slate-500">
                  Official alerts, notices, and regulation updates from DGDA will appear here.
                </p>
              </div>
            ) : (
              notifications.map((item) => {
                const unread = !isRead(item);
                const isLaw = item.category === 'Law & Regulation';
                const isUrgent = item.category === 'Urgent Alert';

                return (
                  <div
                    key={item.notificationId}
                    onClick={() => void handleMarkSingleRead(item)}
                    className={`px-4 py-3.5 transition-colors cursor-pointer ${
                      unread ? 'bg-teal-50/40 hover:bg-teal-50/70' : 'bg-white hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            isUrgent
                              ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : isLaw
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                              : 'border-teal-200 bg-teal-50 text-[#0F766E]'
                          }`}
                        >
                          {isUrgent ? (
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          ) : isLaw ? (
                            <Scale className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <Info className="h-3 w-3" aria-hidden="true" />
                          )}
                          {item.category}
                        </span>

                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            item.targetType === 'INDIVIDUAL'
                              ? 'bg-amber-100 text-amber-800 font-semibold'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {getAudienceLabel(item)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] text-slate-400">
                          {formatNotificationTime(item.createdAt)}
                        </span>
                        {unread && (
                          <span
                            className="h-2 w-2 rounded-full bg-[#0F766E]"
                            title="Unread"
                          />
                        )}
                      </div>
                    </div>

                    <h4 className="mt-1.5 text-sm font-semibold text-slate-900 leading-snug">
                      {item.title}
                    </h4>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                      {item.message}
                    </p>
                    <div className="mt-1.5 text-[11px] text-slate-400">
                      Issued by {item.sentBy}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}