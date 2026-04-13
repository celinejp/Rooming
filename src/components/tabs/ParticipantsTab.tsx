import { useState, useEffect } from 'react';
import { useHouse } from '@/src/contexts/HouseContext';
import { db, handleFirestoreError, OperationType } from '@/src/firebase';
import { updateDoc, doc, arrayRemove, addDoc, collection, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { 
  Users, 
  UserMinus, 
  Copy, 
  Check,
  Share2,
  MessageCircle,
  ShieldCheck,
  Calendar,
  DollarSign,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Responsibility } from '@/src/types';
import { format, addMonths, addWeeks } from 'date-fns';

export default function ParticipantsTab({ activeSubTab }: { activeSubTab?: string }) {
  const { house, profile, members, responsibilities, getUserName } = useHouse();
  const [activeTab, setActiveTab] = useState(activeSubTab || 'residents');
  const [copied, setCopied] = useState(false);
  const [isAddingResp, setIsAddingResp] = useState(false);

  useEffect(() => {
    if (activeSubTab) {
      setActiveTab(activeSubTab);
    }
  }, [activeSubTab]);
  const [newResp, setNewResp] = useState<Partial<Responsibility>>({
    title: '',
    amount: 0,
    currency: profile?.defaultCurrency || 'USD',
    frequency: 'monthly',
    dayOfMonth: 1,
    assignedTo: ''
  });

  const copyInviteCode = () => {
    if (!house) return;
    navigator.clipboard.writeText(house.inviteCode);
    setCopied(true);
    toast.success('Invite code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const shareInvite = async (platform: 'whatsapp' | 'general') => {
    if (!house) return;
    const text = `Join my house "${house.name}" on Rooming! Use invite code: ${house.inviteCode}`;
    const url = window.location.origin;
    
    if (platform === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
    } else {
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Join my house on Rooming',
            text: text,
            url: url,
          });
        } catch (err) {
          console.error(err);
        }
      } else {
        copyInviteCode();
      }
    }
  };

  const removeMember = async (userId: string) => {
    if (!house || !confirm('Are you sure you want to remove this roommate?')) return;
    try {
      await updateDoc(doc(db, 'houses', house.id), {
        memberIds: arrayRemove(userId)
      });
      await updateDoc(doc(db, 'users', userId), {
        houseId: null,
        role: 'member'
      });
      toast.success('Roommate removed.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `houses/${house.id}`);
    }
  };

  const updateMemberRole = async (userId: string, newRole: 'admin' | 'member') => {
    if (!house) return;
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: newRole
      });
      toast.success(`Role updated to ${newRole}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const addResponsibility = async () => {
    if (!house || !newResp.title || !newResp.assignedTo || !newResp.amount) return;
    try {
      const dueDate = new Date();
      if (newResp.frequency === 'monthly' && newResp.dayOfMonth) {
        dueDate.setDate(newResp.dayOfMonth);
        if (dueDate < new Date()) {
          dueDate.setMonth(dueDate.getMonth() + 1);
        }
      }

      await addDoc(collection(db, 'responsibilities'), {
        ...newResp,
        houseId: house.id,
        status: 'pending',
        dueDate: dueDate,
        createdAt: serverTimestamp()
      });
      setIsAddingResp(false);
      setNewResp({
        title: '',
        amount: 0,
        currency: profile?.defaultCurrency || 'USD',
        frequency: 'monthly',
        dayOfMonth: 1,
        assignedTo: ''
      });
      toast.success('Responsibility assigned!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'responsibilities');
    }
  };

  const deleteResponsibility = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'responsibilities', id));
      toast.success('Responsibility removed');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `responsibilities/${id}`);
    }
  };

  const confirmResponsibility = async (resp: Responsibility) => {
    if (!house) return;
    try {
      // 1. Create the expense
      const expenseRef = await addDoc(collection(db, 'expenses'), {
        title: resp.title,
        amount: resp.amount,
        currency: resp.currency,
        category: 'utilities',
        paidBy: resp.assignedTo,
        splitType: 'equal',
        splits: members.map(m => ({ userId: m.uid, amount: resp.amount / members.length })),
        date: serverTimestamp(),
        houseId: house.id,
        isRecurring: true,
        recurringInterval: resp.frequency,
      });

      // 2. Update responsibility status and set next due date
      let nextDueDate = resp.dueDate.toDate ? resp.dueDate.toDate() : new Date(resp.dueDate);
      if (resp.frequency === 'monthly') {
        nextDueDate = addMonths(nextDueDate, 1);
      } else if (resp.frequency === 'weekly') {
        nextDueDate = addWeeks(nextDueDate, 1);
      }

      await updateDoc(doc(db, 'responsibilities', resp.id), {
        status: 'pending', // Reset to pending for the next cycle
        dueDate: nextDueDate,
        lastExpenseId: expenseRef.id
      });

      // 3. Add activity
      await addDoc(collection(db, 'activities'), {
        type: 'expense',
        description: `${getUserName(resp.assignedTo)} confirmed recurring bill: ${resp.title}`,
        timestamp: serverTimestamp(),
        houseId: house.id,
        userId: resp.assignedTo,
      });

      toast.success(`Expense created for ${resp.title}!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `responsibilities/${resp.id}`);
    }
  };

  const isAdmin = profile?.role === 'admin';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">House Management</h2>
          <p className="text-muted-foreground">Manage residents and recurring responsibilities.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="residents" className="rounded-lg gap-2">
            <Users className="h-4 w-4" /> Residents
          </TabsTrigger>
          <TabsTrigger value="responsibilities" className="rounded-lg gap-2">
            <ShieldCheck className="h-4 w-4" /> Responsibilities
          </TabsTrigger>
        </TabsList>

        <TabsContent value="residents">
          <div className="grid gap-8 md:grid-cols-3">
            <Card className="md:col-span-2 bg-white shadow-sm border-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5 text-primary" />
                  Resident List
                </CardTitle>
                <CardDescription>Current members of {house?.name}.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  {members.map(member => (
                    <div key={member.uid} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                          <AvatarImage src={member.photoURL} />
                          <AvatarFallback>{member.displayName?.[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{member.displayName}</p>
                          <Badge variant="secondary" className="text-[9px] uppercase tracking-tighter h-4 px-1">
                            {member.role}
                          </Badge>
                        </div>
                      </div>
                      {isAdmin && member.uid !== profile?.uid && (
                        <div className="flex items-center gap-1">
                          <Select 
                            value={member.role} 
                            onValueChange={(v: any) => updateMemberRole(member.uid, v)}
                          >
                            <SelectTrigger className="h-8 w-24 text-[10px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            onClick={() => removeMember(member.uid)}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="bg-gradient-to-br from-primary to-primary/80 text-white border-none shadow-xl">
                <CardHeader>
                  <CardTitle className="text-lg">Invite Roommates</CardTitle>
                  <CardDescription className="text-primary-foreground/80">Share the code to let others join.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="bg-white/10 rounded-2xl p-6 text-center border border-white/20">
                    <p className="text-xs uppercase tracking-widest opacity-70 mb-2">Invite Code</p>
                    <h3 className="text-4xl font-black tracking-[0.2em] mb-4">{house?.inviteCode}</h3>
                    <div className="flex gap-2">
                      <Button 
                        variant="secondary" 
                        className="flex-1 gap-2"
                        onClick={copyInviteCode}
                      >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? 'Copied' : 'Copy Code'}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="secondary" 
                      className="gap-2 bg-emerald-500 hover:bg-emerald-600 text-white border-none"
                      onClick={() => shareInvite('whatsapp')}
                    >
                      <MessageCircle className="h-4 w-4" /> WhatsApp
                    </Button>
                    <Button 
                      variant="secondary" 
                      className="gap-2"
                      onClick={() => shareInvite('general')}
                    >
                      <Share2 className="h-4 w-4" /> Share Link
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white shadow-sm border-none">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">House Capacity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <span>Current Residents</span>
                    <span className="font-bold">{members.length}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden">
                    <div 
                      className="bg-primary h-full transition-all duration-500" 
                      style={{ width: `${Math.min((members.length / 10) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">Recommended limit: 10 residents</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="responsibilities">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Recurring Responsibilities</h3>
                <p className="text-sm text-muted-foreground">Assign people to pay recurring bills like Rent or Wi-Fi.</p>
              </div>
              {isAdmin && (
                <Dialog open={isAddingResp} onOpenChange={setIsAddingResp}>
                  <DialogTrigger render={
                    <Button className="gap-2">
                      <Plus className="h-4 w-4" /> Add Responsibility
                    </Button>
                  } />
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>New Responsibility</DialogTitle>
                      <DialogDescription>Assign a recurring bill to a housemate.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label>Title (e.g. Rent, Electricity)</Label>
                        <Input 
                          placeholder="Bill name" 
                          value={newResp.title}
                          onChange={e => setNewResp({...newResp, title: e.target.value})}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>Amount</Label>
                          <Input 
                            type="number" 
                            placeholder="0.00" 
                            value={newResp.amount}
                            onChange={e => setNewResp({...newResp, amount: parseFloat(e.target.value)})}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Currency</Label>
                          <Select 
                            value={newResp.currency} 
                            onValueChange={v => setNewResp({...newResp, currency: v})}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD ($)</SelectItem>
                              <SelectItem value="EUR">EUR (€)</SelectItem>
                              <SelectItem value="GBP">GBP (£)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label>Assigned To</Label>
                        <Select 
                          value={newResp.assignedTo} 
                          onValueChange={v => setNewResp({...newResp, assignedTo: v})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select member">
                              {getUserName(newResp.assignedTo || '')}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {members.map(m => (
                              <SelectItem key={m.uid} value={m.uid}>{m.displayName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>Frequency</Label>
                          <Select 
                            value={newResp.frequency} 
                            onValueChange={(v: any) => setNewResp({...newResp, frequency: v})}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {newResp.frequency === 'monthly' && (
                          <div className="grid gap-2">
                            <Label>Day of Month</Label>
                            <Input 
                              type="number" 
                              min="1" 
                              max="31" 
                              value={newResp.dayOfMonth}
                              onChange={e => setNewResp({...newResp, dayOfMonth: parseInt(e.target.value)})}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    <Button onClick={addResponsibility} className="w-full">Assign Responsibility</Button>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {responsibilities.length === 0 ? (
                <Card className="md:col-span-2 border-dashed bg-slate-50">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>No recurring responsibilities assigned yet.</p>
                  </CardContent>
                </Card>
              ) : (
                responsibilities.map(resp => {
                  const isAssignedToMe = resp.assignedTo === profile?.uid;
                  const dueDate = resp.dueDate.toDate ? resp.dueDate.toDate() : new Date(resp.dueDate);
                  const isPastDue = dueDate < new Date();

                  return (
                    <Card key={resp.id} className={`bg-white shadow-sm border-none overflow-hidden ${isPastDue ? 'ring-2 ring-amber-500/20' : ''}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                              <DollarSign className="h-5 w-5" />
                            </div>
                            <div>
                              <CardTitle className="text-base">{resp.title}</CardTitle>
                              <CardDescription className="text-xs flex items-center gap-1">
                                <Calendar className="h-3 w-3" /> Next Due: {format(dueDate, 'MMM do')}
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant={isPastDue ? "destructive" : "secondary"} className="text-[10px] uppercase">
                            {resp.frequency}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-[10px]">{getUserName(resp.assignedTo)[0]}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-medium">{getUserName(resp.assignedTo)}</span>
                          </div>
                          <span className="font-bold text-indigo-600">{resp.currency}{resp.amount.toFixed(2)}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {isAssignedToMe && (
                            <Button 
                              className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => confirmResponsibility(resp)}
                            >
                              <CheckCircle2 className="h-4 w-4" /> Confirm & Split
                            </Button>
                          )}
                          {!isAssignedToMe && isPastDue && (
                            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs">
                              <AlertCircle className="h-4 w-4" /> Waiting for {getUserName(resp.assignedTo)}
                            </div>
                          )}
                          {isAdmin && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 text-rose-600"
                              onClick={() => deleteResponsibility(resp.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
