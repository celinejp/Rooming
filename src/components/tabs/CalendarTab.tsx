import { useState, useMemo } from 'react';
import { useHouse } from '@/src/contexts/HouseContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Trash2, 
  Zap, 
  Sparkles,
  Plus,
  Wrench,
  PartyPopper,
  CreditCard,
  CheckSquare,
  CheckCircle2,
  Info,
  Check,
  User
} from 'lucide-react';
import { format, isSameDay, isWithinInterval, startOfDay, endOfDay, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db, handleFirestoreError, OperationType } from '@/src/firebase';
import { collection, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function CalendarTab() {
  const { house, profile, expenses, chores, calendarEvents, getUserName } = useHouse();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [startDate, setStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const allEvents = useMemo(() => {
    const events: any[] = [];

    // Add Chores
    chores.forEach(c => {
      const dueDate = c.dueDate?.toDate ? c.dueDate.toDate() : (c.dueDate ? new Date(c.dueDate) : null);
      if (dueDate) {
        // Check if completed on this day
        const isCompleted = c.history?.some(h => 
          h.status === 'completed' && 
          isSameDay(h.completedAt?.toDate ? h.completedAt.toDate() : new Date(h.completedAt), dueDate)
        );

        events.push({
          id: `chore-${c.id}`,
          title: `Chore: ${c.name}`,
          startDate: dueDate,
          endDate: dueDate,
          type: 'chore',
          color: 'bg-amber-100 text-amber-700 border-amber-200',
          icon: CheckSquare,
          assignee: getUserName(c.assignedTo),
          completed: isCompleted,
          originalChore: c
        });
      }
    });

    // Add Expenses
    expenses.filter(e => e.isRecurring).forEach(e => {
      const date = e.date?.toDate ? e.date.toDate() : new Date(e.date);
      events.push({
        id: `expense-${e.id}`,
        title: `Bill: ${e.description}`,
        startDate: date,
        endDate: date,
        type: 'bill',
        color: 'bg-blue-100 text-blue-700 border-blue-200',
        icon: CreditCard
      });
    });

    // Add Calendar Events
    calendarEvents.forEach(e => {
      const start = e.startDate?.toDate ? e.startDate.toDate() : (e.startDate ? new Date(e.startDate) : null);
      const end = e.endDate?.toDate ? e.endDate.toDate() : (e.endDate ? new Date(e.endDate) : start);
      
      if (start) {
        events.push({
          id: e.id,
          title: e.title,
          startDate: start,
          endDate: end || start,
          startTime: e.startTime,
          endTime: e.endTime,
          type: 'event',
          color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
          icon: CalendarIcon,
          completed: e.completed,
          authorId: e.authorId
        });
      }
    });

    return events;
  }, [chores, expenses, calendarEvents, getUserName]);

  const selectedDayEvents = allEvents.filter(e => {
    if (!date) return false;
    const d = startOfDay(date);
    const start = startOfDay(e.startDate);
    const end = endOfDay(e.endDate);
    return isWithinInterval(d, { start, end });
  });

  const addEvent = async () => {
    if (!newTitle || !house || !profile) return;
    try {
      await addDoc(collection(db, 'calendarEvents'), {
        title: newTitle,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        startTime: startTime || null,
        endTime: endTime || null,
        houseId: house.id,
        createdBy: profile.uid,
        createdAt: serverTimestamp()
      });
      setIsAddOpen(false);
      setNewTitle('');
      setStartDate(format(new Date(), 'yyyy-MM-dd'));
      setEndDate('');
      setStartTime('');
      setEndTime('');
      toast.success('Event added to calendar!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'calendarEvents');
    }
  };

  const deleteEvent = async (id: string, type: string) => {
    if (type !== 'event') {
      toast.error('Only custom events can be deleted from here.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'calendarEvents', id));
      toast.success('Event deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `calendarEvents/${id}`);
    }
  };

  const toggleEventCompletion = async (event: any) => {
    if (event.type !== 'event') return;
    try {
      await updateDoc(doc(db, 'calendarEvents', event.id), {
        completed: !event.completed
      });
      toast.success(event.completed ? 'Marked as incomplete' : 'Marked as completed!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `calendarEvents/${event.id}`);
    }
  };

  const handleDayClick = (day: Date) => {
    setDate(day);
  };

  const DayWithEvents = ({ day, ...props }: any) => {
    const dayEvents = allEvents.filter(e => {
      const d = startOfDay(day);
      const start = startOfDay(e.startDate);
      const end = endOfDay(e.endDate);
      return isWithinInterval(d, { start, end });
    });

    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center">
        <span>{day.getDate()}</span>
        <div className="absolute bottom-1 flex gap-0.5">
          {dayEvents.slice(0, 3).map((e, i) => (
            <div 
              key={i} 
              className={cn(
                "w-1 h-1 rounded-full",
                e.type === 'chore' ? 'bg-amber-500' : e.type === 'bill' ? 'bg-blue-500' : 'bg-indigo-500',
                e.completed && 'bg-emerald-500'
              )} 
            />
          ))}
          {dayEvents.length > 3 && <div className="w-1 h-1 rounded-full bg-slate-400" />}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">House Calendar</h2>
          <p className="text-muted-foreground">Stay on top of bills, trash days, and cleaning schedules.</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger nativeButton={true} render={<Button className="gap-2 shadow-lg shadow-primary/20" />}>
            <Plus className="h-4 w-4" /> Add Event
          </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add Calendar Event</DialogTitle>
                <DialogDescription>Schedule something for the whole house.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Event Title</Label>
                  <Input id="title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. House Party" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="start">Start Date (Optional)</Label>
                    <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="end">End Date (Optional)</Label>
                    <Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="startTime">Start Time (Optional)</Label>
                    <Input id="startTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="endTime">End Time (Optional)</Label>
                    <Input id="endTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  </div>
                </div>
              </div>
              <Button onClick={addEvent} disabled={!newTitle}>Save Event</Button>
            </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-8 md:grid-cols-12">
        <Card className="md:col-span-8 bg-white shadow-sm border-none overflow-hidden">
          <CardContent className="p-0">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="p-4 w-full"
              components={{
                Day: ({ day, ...props }: any) => {
                  const dayEvents = allEvents.filter(e => {
                    const d = startOfDay(day.date);
                    const start = startOfDay(e.startDate);
                    const end = endOfDay(e.endDate);
                    return isWithinInterval(d, { start, end });
                  });

                  return (
                    <td {...props}>
                      <Button
                        variant="ghost"
                        className={cn(
                          "relative h-12 w-full p-0 font-normal aria-selected:opacity-100",
                          isSameDay(day.date, new Date()) && "bg-accent text-accent-foreground",
                          date && isSameDay(day.date, date) && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                        )}
                        onClick={() => setDate(day.date)}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className={cn(
                            "text-sm",
                            date && isSameDay(day.date, date) && "font-bold"
                          )}>
                            {day.date.getDate()}
                          </span>
                          <div className="flex gap-0.5">
                            {dayEvents.slice(0, 3).map((e, i) => (
                              <div 
                                key={i} 
                                className={cn(
                                  "w-1 h-1 rounded-full",
                                  e.type === 'chore' ? 'bg-amber-400' : e.type === 'bill' ? 'bg-blue-400' : 'bg-indigo-400',
                                  e.completed && 'bg-emerald-400',
                                  date && isSameDay(day.date, date) && "bg-white"
                                )} 
                              />
                            ))}
                          </div>
                        </div>
                      </Button>
                    </td>
                  );
                }
              }}
            />
          </CardContent>
        </Card>

        <div className="md:col-span-4 space-y-6">
          <Card className="bg-white shadow-sm border-none">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                {date ? format(date, 'MMMM d, yyyy') : 'Select a date'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {selectedDayEvents.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-sm italic">
                      No events scheduled for this day.
                    </div>
                  ) : (
                    selectedDayEvents.map((event) => (
                      <div 
                        key={event.id} 
                        className={cn(
                          "group p-4 rounded-2xl border transition-all cursor-pointer hover:shadow-md relative",
                          event.color,
                          event.completed && "opacity-60 grayscale-[0.5]"
                        )}
                        onClick={() => {
                          setSelectedEvent(event);
                          setIsDetailsOpen(true);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <event.icon className={cn("h-4 w-4", event.completed && "text-emerald-600")} />
                            <p className={cn("font-bold text-sm", event.completed && "line-through")}>{event.title}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {event.completed && <Check className="h-4 w-4 text-emerald-600" />}
                            <Info className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <p className="text-[10px] uppercase tracking-wider opacity-80 font-bold">
                            {event.type} 
                            {event.startTime && ` • ${event.startTime}`}
                            {event.endTime && ` - ${event.endTime}`}
                            {event.startDate && event.endDate && !isSameDay(event.startDate, event.endDate) && ` • ${format(event.startDate, 'MMM d')} - ${format(event.endDate, 'MMM d')}`}
                          </p>
                          {event.assignee && (
                            <p className="text-[10px] font-medium italic">Assigned to: {event.assignee}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Removed AI Reminders as requested */}
        </div>
      </div>
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          {selectedEvent && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={selectedEvent.color}>{selectedEvent.type}</Badge>
                  {selectedEvent.completed && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Completed</Badge>}
                </div>
                <DialogTitle className="text-xl flex items-center gap-2">
                  <selectedEvent.icon className="h-5 w-5" />
                  {selectedEvent.title}
                </DialogTitle>
                <DialogDescription>
                  {selectedEvent.description || 'No description provided.'}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="flex items-center gap-3 text-sm">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {format(selectedEvent.startDate, 'EEEE, MMMM do')}
                    {selectedEvent.endDate && !isSameDay(selectedEvent.startDate, selectedEvent.endDate) && ` - ${format(selectedEvent.endDate, 'MMMM do')}`}
                  </span>
                </div>
                {(selectedEvent.startTime || selectedEvent.endTime) && (
                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {selectedEvent.startTime || 'Anytime'} 
                      {selectedEvent.endTime && ` - ${selectedEvent.endTime}`}
                    </span>
                  </div>
                )}
                {selectedEvent.assignee && (
                  <div className="flex items-center gap-3 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>Assigned to: <strong>{selectedEvent.assignee}</strong></span>
                  </div>
                )}
              </div>
              <DialogFooter className="flex gap-2 sm:justify-between">
                <div className="flex gap-2">
                  {selectedEvent.type === 'event' && (
                    <Button 
                      variant="outline" 
                      className="gap-2"
                      onClick={() => toggleEventCompletion(selectedEvent)}
                    >
                      {selectedEvent.completed ? 'Mark Incomplete' : 'Mark Completed'}
                    </Button>
                  )}
                </div>
                <Button 
                  variant="destructive" 
                  size="icon" 
                  onClick={() => {
                    deleteEvent(selectedEvent.id, selectedEvent.type);
                    setIsDetailsOpen(false);
                  }}
                  disabled={selectedEvent.type !== 'event'}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
