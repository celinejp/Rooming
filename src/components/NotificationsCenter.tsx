import { useMemo, useState } from 'react';
import { useHouse } from '@/src/contexts/HouseContext';
import { db, handleFirestoreError, OperationType } from '@/src/firebase';
import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bell,
  CheckCheck,
  Receipt,
  Megaphone,
  CheckSquare,
  ScrollText,
  Trash2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { HouseNotification } from '@/src/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function notificationTime(n: HouseNotification): number {
  const ts = n.timestamp;
  if (ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

function formatRelative(n: HouseNotification): string {
  try {
    const t = typeof n.timestamp === 'object' && n.timestamp && 'toDate' in n.timestamp
      ? (n.timestamp as { toDate: () => Date }).toDate()
      : new Date(0);
    return formatDistanceToNow(t, { addSuffix: true });
  } catch {
    return '';
  }
}

function iconForType(type?: string) {
  switch (type) {
    case 'chore_assignment':
      return CheckSquare;
    case 'announcement':
      return Megaphone;
    case 'rules':
      return ScrollText;
    case 'expense':
      return Receipt;
    default:
      return Bell;
  }
}

interface NotificationsCenterProps {
  onNavigate: (tabPath: string) => void;
}

export default function NotificationsCenter({ onNavigate }: NotificationsCenterProps) {
  const { notifications } = useHouse();
  const [open, setOpen] = useState(false);

  const sorted = useMemo(
    () => [...notifications].sort((a, b) => notificationTime(b) - notificationTime(a)),
    [notifications],
  );

  const unreadCount = useMemo(
    () => sorted.filter((n) => n.read !== true).length,
    [sorted],
  );

  const markRead = async (n: HouseNotification) => {
    if (n.read === true) return;
    try {
      await updateDoc(doc(db, 'notifications', n.id), { read: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `notifications/${n.id}`);
    }
  };

  const remove = async (n: HouseNotification, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'notifications', n.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `notifications/${n.id}`);
    }
  };

  const markAllRead = async () => {
    const unread = sorted.filter((n) => n.read !== true);
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach((n) => {
        batch.update(doc(db, 'notifications', n.id), { read: true });
      });
      await batch.commit();
      toast.success('All notifications marked');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'notifications');
    }
  };

  const onRowClick = async (n: HouseNotification) => {
    await markRead(n);
    if (n.link) {
      onNavigate(n.link);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        nativeButton
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Notifications"
          />
        }
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-5 text-primary-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-[min(calc(100vw-2rem),22rem)] p-0 sm:w-96"
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="font-semibold">Notifications</div>
          {unreadCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs text-muted-foreground"
              onClick={() => void markAllRead()}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[min(60vh,420px)]">
          {sorted.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              You&apos;re all caught up. Chore handoffs, expenses, and house updates will appear here.
            </p>
          ) : (
            <ul className="divide-y">
              {sorted.map((n) => {
                const Icon = iconForType(n.type);
                const unread = n.read !== true;
                const headline = n.title || (n.type === 'chore_assignment' ? 'Chore' : 'Update');
                return (
                  <li key={n.id} className="flex">
                    <button
                      type="button"
                      className={cn(
                        'flex min-w-0 flex-1 gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/60',
                        unread && 'bg-primary/5',
                      )}
                      onClick={() => void onRowClick(n)}
                    >
                      <div
                        className={cn(
                          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                          unread ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {headline}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatRelative(n)}
                          </span>
                        </div>
                        <p className="mt-0.5 pr-1 text-sm leading-snug">{n.message}</p>
                      </div>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-auto w-11 shrink-0 rounded-none text-muted-foreground hover:text-destructive"
                      aria-label="Dismiss"
                      onClick={(e) => void remove(n, e)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
