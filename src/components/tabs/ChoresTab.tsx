import { useState, useMemo } from 'react';
import { useHouse } from '@/src/contexts/HouseContext';
import { db, handleFirestoreError, OperationType } from '@/src/firebase';
import { collection, addDoc, serverTimestamp, updateDoc, doc, deleteDoc, arrayUnion, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Plus, 
  CheckSquare, 
  Trash2, 
  User, 
  Calendar as CalendarIcon,
  Sparkles,
  RotateCcw,
  History,
  LayoutGrid,
  Edit2,
  Plane,
  SkipForward,
  CheckCircle2,
  AlertCircle,
  Check
} from 'lucide-react';
import { format, addDays, addWeeks, addMonths, isSameDay, subDays, eachDayOfInterval } from 'date-fns';
import { geminiService } from '@/src/services/gemini';
import { toast } from 'sonner';
import { Chore, ChoreHistory } from '@/src/types';

export default function ChoresTab() {
  const { house, profile, members, chores, getUserName } = useHouse();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'custom' | 'rotation' | 'completion-based'>('weekly');
  const [customInterval, setCustomInterval] = useState('7');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const last10Days = useMemo(() => {
    const end = new Date();
    const start = subDays(end, 9);
    return eachDayOfInterval({ start, end });
  }, []);

  // Initialize participants when dialog opens
  const handleOpenAdd = (open: boolean) => {
    if (open) {
      setSelectedParticipants(members.map(m => m.uid));
    }
    setIsAddOpen(open);
  };

  const choreHistoryGrid = useMemo(() => {
    return chores.map(chore => {
      const dayHistory = last10Days.map(day => {
        const completions = (chore.history || [])
          .filter(h => h.status === 'completed' && isSameDay(h.completedAt?.toDate ? h.completedAt.toDate() : new Date(h.completedAt), day))
          .sort((a, b) => {
            const dateA = a.completedAt?.toDate ? a.completedAt.toDate() : new Date(a.completedAt);
            const dateB = b.completedAt?.toDate ? b.completedAt.toDate() : new Date(b.completedAt);
            return dateB.getTime() - dateA.getTime();
          });
        return {
          day,
          completion: completions[0] || null
        };
      });
      return {
        choreId: chore.id,
        choreName: chore.name,
        dayHistory
      };
    });
  }, [chores, last10Days]);

  const addChore = async () => {
    if (!name || !house || !profile || selectedParticipants.length === 0) return;
    try {
      const start = new Date(startDate);
      
      // Filter members to only include selected participants, maintaining their sorted order
      const participantUids = members
        .filter(m => selectedParticipants.includes(m.uid))
        .map(m => m.uid);
      
      // Reorder rotation based on who goes first
      const firstPersonId = assignedTo || participantUids[0];
      const firstIndex = participantUids.indexOf(firstPersonId);
      const reorderedRotation = [
        ...participantUids.slice(firstIndex),
        ...participantUids.slice(0, firstIndex)
      ];

      const choreData: any = {
        name,
        assignedTo: firstPersonId,
        frequency,
        completed: false,
        houseId: house.id,
        startDate: Timestamp.fromDate(start),
        dueDate: Timestamp.fromDate(start),
        rotationOrder: reorderedRotation,
        history: [],
      };

      if (frequency === 'custom') {
        choreData.customIntervalDays = parseInt(customInterval);
      }

      await addDoc(collection(db, 'chores'), choreData);
      
      await addDoc(collection(db, 'activities'), {
        type: 'chore',
        description: `${profile.displayName} added a new chore: ${name}`,
        timestamp: serverTimestamp(),
        houseId: house.id,
        userId: profile.uid,
      });

      setIsAddOpen(false);
      setName('');
      setAssignedTo('');
      setFrequency('weekly');
      setStartDate(format(new Date(), 'yyyy-MM-dd'));
      toast.success('Chore added!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'chores');
    }
  };

  const completeChore = async (chore: Chore, onBehalfOf?: string) => {
    if (!house || !profile) return;
    try {
      const historyEntry: any = {
        completedBy: profile.uid,
        completedAt: new Date(),
        status: 'completed',
      };

      if (onBehalfOf) {
        historyEntry.wasOnBehalfOf = onBehalfOf;
        historyEntry.note = `covered for ${getUserName(onBehalfOf)}`;
      }

      const currentIndex = chore.rotationOrder.indexOf(chore.assignedTo);
      const nextIndex = (currentIndex + 1) % chore.rotationOrder.length;
      const nextPersonId = chore.rotationOrder[nextIndex];

      let nextDueDate = new Date();
      if (chore.frequency !== 'completion-based' && chore.frequency !== 'rotation') {
        const currentDue = chore.dueDate?.toDate ? chore.dueDate.toDate() : new Date(chore.dueDate);
        if (chore.frequency === 'daily') nextDueDate = addDays(currentDue, 1);
        else if (chore.frequency === 'weekly') nextDueDate = addWeeks(currentDue, 1);
        else if (chore.frequency === 'bi-weekly') nextDueDate = addWeeks(currentDue, 2);
        else if (chore.frequency === 'monthly') nextDueDate = addMonths(currentDue, 1);
        else if (chore.frequency === 'custom' && chore.customIntervalDays) {
          nextDueDate = addDays(currentDue, chore.customIntervalDays);
        }
        
        // If the due date is already in the past, set it to the next occurrence from today
        while (nextDueDate < new Date()) {
          if (chore.frequency === 'daily') nextDueDate = addDays(nextDueDate, 1);
          else if (chore.frequency === 'weekly') nextDueDate = addWeeks(nextDueDate, 1);
          else if (chore.frequency === 'bi-weekly') nextDueDate = addWeeks(nextDueDate, 2);
          else if (chore.frequency === 'monthly') nextDueDate = addMonths(nextDueDate, 1);
          else if (chore.frequency === 'custom' && chore.customIntervalDays) {
            nextDueDate = addDays(nextDueDate, chore.customIntervalDays);
          } else {
            break;
          }
        }
      }

      const updates: any = {
        history: arrayUnion(historyEntry),
        assignedTo: nextPersonId,
        dueDate: (chore.frequency === 'completion-based' || chore.frequency === 'rotation') ? null : Timestamp.fromDate(nextDueDate),
        lastCompletedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'chores', chore.id), updates);
      
      // Notification for next person
      await addDoc(collection(db, 'notifications'), {
        userId: nextPersonId,
        message: `You are now responsible for ${chore.name}`,
        type: 'chore_assignment',
        choreId: chore.id,
        houseId: house.id,
        timestamp: serverTimestamp(),
        read: false,
        link: 'chores',
      });

      await addDoc(collection(db, 'activities'), {
        type: 'chore_complete',
        description: `${profile.displayName} completed chore: ${chore.name}${onBehalfOf ? ` (covered for ${getUserName(onBehalfOf)})` : ''}`,
        timestamp: serverTimestamp(),
        houseId: house.id,
        userId: profile.uid,
      });

      toast.success(onBehalfOf ? `You covered ${chore.name} for ${getUserName(onBehalfOf)}!` : 'Chore completed! Great job!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chores/${chore.id}`);
    }
  };

  const skipChore = async (chore: any) => {
    if (!profile) return;
    try {
      const historyEntry: any = {
        skippedBy: profile.uid,
        skippedAt: new Date(),
        status: 'skipped'
      };

      const updates: any = {
        history: arrayUnion(historyEntry),
      };

      if (chore.frequency === 'rotation') {
        const currentIndex = chore.rotationOrder.indexOf(chore.assignedTo);
        const nextIndex = (currentIndex + 1) % chore.rotationOrder.length;
        updates.assignedTo = chore.rotationOrder[nextIndex];
      }

      await updateDoc(doc(db, 'chores', chore.id), updates);
      toast.success('Chore skipped.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `chores/${chore.id}`);
    }
  };

  const deleteChore = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'chores', id));
      toast.success('Chore deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `chores/${id}`);
    }
  };

  const suggestSchedule = async () => {
    setIsSuggesting(true);
    try {
      const suggestions = await geminiService.suggestChoreSchedule(members, chores);
      toast.success('AI suggested a new schedule! Check the UI for insights.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to suggest schedule.');
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Chores</h2>
          <p className="text-muted-foreground">Keep the house clean and the workload balanced.</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={suggestSchedule} 
            disabled={isSuggesting || chores.length === 0}
            className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          >
            <Sparkles className={`h-4 w-4 ${isSuggesting ? 'animate-spin' : ''}`} />
            AI Suggest Schedule
          </Button>
          <Dialog open={isAddOpen} onOpenChange={handleOpenAdd}>
            <DialogTrigger nativeButton={true} render={<Button className="gap-2 shadow-lg shadow-primary/20" />}>
              <Plus className="h-4 w-4" /> Add Chore
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add New Chore</DialogTitle>
                <DialogDescription>Define a task and set up the rotation.</DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[80vh]">
                <div className="grid gap-6 py-4 px-1">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Chore Name</Label>
                    <Input 
                      id="name" 
                      placeholder="e.g. Take out trash" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="startDate">Start Date</Label>
                      <Input 
                        id="startDate" 
                        type="date" 
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="assignedTo">Who goes first?</Label>
                      <Select value={assignedTo} onValueChange={setAssignedTo}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select roommate">
                            {getUserName(assignedTo)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {members.filter(m => selectedParticipants.includes(m.uid)).map(m => (
                            <SelectItem key={m.uid} value={m.uid}>{m.displayName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="frequency">Frequency</Label>
                    <Select value={frequency} onValueChange={(v: any) => setFrequency(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="custom">Every X Days</SelectItem>
                        <SelectItem value="completion-based">Completion-based (Rotation moves when done)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {frequency === 'custom' && (
                    <div className="grid gap-2">
                      <Label htmlFor="interval">Interval (days)</Label>
                      <Input 
                        id="interval" 
                        type="number" 
                        value={customInterval}
                        onChange={(e) => setCustomInterval(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="grid gap-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-bold">Participants</Label>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 text-[10px] px-2"
                          onClick={() => setSelectedParticipants(members.map(m => m.uid))}
                        >
                          Select All
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 text-[10px] px-2"
                          onClick={() => setSelectedParticipants([])}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      {members.map(m => (
                        <div key={m.uid} className="flex items-center space-x-2">
                          <Checkbox 
                            id={`member-${m.uid}`} 
                            checked={selectedParticipants.includes(m.uid)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedParticipants([...selectedParticipants, m.uid]);
                              } else {
                                setSelectedParticipants(selectedParticipants.filter(id => id !== m.uid));
                              }
                            }}
                          />
                          <label 
                            htmlFor={`member-${m.uid}`}
                            className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {m.displayName}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Rotation Preview</p>
                    <div className="flex flex-wrap gap-2">
                      {members.filter(m => selectedParticipants.includes(m.uid)).map((m, i, arr) => (
                        <div key={m.uid} className="flex items-center gap-1">
                          <Badge variant="secondary" className="text-[10px]">{m.displayName}</Badge>
                          {i < arr.length - 1 && <SkipForward className="h-2 w-2 text-slate-300" />}
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 italic">Rotation follows group join order among selected participants.</p>
                  </div>
                </div>
              </ScrollArea>
              <Button onClick={addChore} className="w-full mt-4" disabled={!name || selectedParticipants.length === 0}>
                Save Chore
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Active Chores */}
        <Card className="md:col-span-2 bg-white shadow-sm border-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              Active Chores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                {chores.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>No chores defined yet.</p>
                  </div>
                ) : (
                    chores.map((chore) => {
                      const assignee = members.find(m => m.uid === chore.assignedTo);
                      const isAssignedToMe = chore.assignedTo === profile?.uid;
                      const dueDate = chore.dueDate?.toDate ? chore.dueDate.toDate() : (chore.dueDate ? new Date(chore.dueDate) : null);
                      const isOverdue = dueDate && dueDate < new Date() && !isSameDay(dueDate, new Date());

                      return (
                        <div key={chore.id} className={`group flex items-center justify-between p-4 rounded-2xl transition-all border ${isOverdue ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-transparent hover:border-slate-200 hover:bg-slate-100'}`}>
                          <div className="flex items-center gap-4">
                            <Button 
                              variant={isAssignedToMe ? "default" : "outline"}
                              size="icon" 
                              className={`h-10 w-10 rounded-full border-2 transition-all ${isAssignedToMe ? 'shadow-lg shadow-primary/20' : 'border-primary/20 text-primary hover:bg-primary hover:text-white'}`}
                              onClick={() => completeChore(chore)}
                            >
                              <CheckSquare className="h-5 w-5" />
                            </Button>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-slate-900">{chore.name}</p>
                                {isOverdue && <Badge variant="destructive" className="text-[8px] h-4 px-1">OVERDUE</Badge>}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className={`flex items-center gap-1 ${isAssignedToMe ? 'text-primary font-bold' : ''}`}>
                                  <User className="h-3 w-3" /> {assignee?.displayName || 'Unassigned'}
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1 capitalize"><RotateCcw className="h-3 w-3" /> {chore.frequency.replace('-', ' ')}</span>
                                {dueDate && (
                                  <>
                                    <span>•</span>
                                    <span className={`flex items-center gap-1 ${isOverdue ? 'text-rose-600 font-bold' : ''}`}>
                                      <CalendarIcon className="h-3 w-3" /> {format(dueDate, 'MMM do')}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {!isAssignedToMe && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-[10px] gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => completeChore(chore, chore.assignedTo)}
                              >
                                <CheckCircle2 className="h-3 w-3" /> I did this instead
                              </Button>
                            )}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                onClick={() => deleteChore(chore.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Chore Tracker Grid */}
        <div className="md:col-span-3 space-y-6">
          <Card className="bg-white shadow-sm border-none overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-bottom border-slate-100">
              <CardTitle className="flex items-center gap-2 text-lg">
                <LayoutGrid className="h-5 w-5 text-indigo-500" />
                Chore History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      {last10Days.map((day) => (
                        <th key={day.toISOString()} className="p-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 min-w-[60px]">
                          <div className="flex flex-col">
                            <span>{format(day, 'EEE')}</span>
                            <span className="text-indigo-600">{format(day, 'd')}</span>
                          </div>
                        </th>
                      ))}
                      <th className="p-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-l border-slate-100 w-48 bg-slate-50/80">Chore Task</th>
                    </tr>
                  </thead>
                  <tbody>
                    {choreHistoryGrid.map((row) => (
                      <tr key={row.choreId} className="border-b border-slate-100 hover:bg-slate-50/30 transition-colors">
                        {row.dayHistory.map((cell) => (
                          <td key={cell.day.toISOString()} className="p-2 text-center border-slate-100">
                            {cell.completion ? (
                              <div className="flex flex-col items-center justify-center relative">
                                <div className="absolute -top-1 -right-1 bg-emerald-500 rounded-full p-0.5 shadow-sm">
                                  <Check className="h-2 w-2 text-white" />
                                </div>
                                <Badge variant="secondary" className="h-7 w-7 rounded-full p-0 flex items-center justify-center bg-indigo-50 text-indigo-700 border-indigo-100 text-[10px] font-bold">
                                  {getUserName(cell.completion.completedBy).split(' ').map(n => n[0]).join('')}
                                </Badge>
                                {cell.completion.wasOnBehalfOf && (
                                  <span className="text-[7px] text-amber-600 font-bold mt-0.5">covered for {getUserName(cell.completion.wasOnBehalfOf)}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-100 text-xs"> </span>
                            )}
                          </td>
                        ))}
                        <td className="p-3 text-right text-sm font-semibold text-slate-700 border-l border-slate-100 bg-slate-50/20">{row.choreName}</td>
                      </tr>
                    ))}
                    {chores.length === 0 && (
                      <tr>
                        <td colSpan={last10Days.length + 1} className="p-12 text-center text-muted-foreground italic">
                          No chores added yet to track.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
