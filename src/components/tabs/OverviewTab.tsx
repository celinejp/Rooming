import { useHouse } from '@/src/contexts/HouseContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2, 
  Clock,
  Sparkles,
  ArrowRight,
  MessageSquare,
  Users,
  CheckSquare,
  Shield,
  Megaphone,
  Plus
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState, useEffect } from 'react';
import { geminiService } from '@/src/services/gemini';
import { FairnessScore, Announcement } from '@/src/types';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { db, handleFirestoreError, OperationType } from '@/src/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface OverviewTabProps {
  onNavigate?: (tab: string) => void;
}

export default function OverviewTab({ onNavigate }: OverviewTabProps) {
  const { house, profile, members, expenses, chores, shoppingList, activities, announcements, getUserName } = useHouse();
  const [isAddingAnnouncement, setIsAddingAnnouncement] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [dailyReminders, setDailyReminders] = useState<string>('');
  const [isLoadingReminders, setIsLoadingReminders] = useState(false);

  const choresDueToday = chores.filter(c => !c.completed);
  const lowStockItems = shoppingList.filter(i => i.status !== 'In Stock');

  useEffect(() => {
    const fetchReminders = async () => {
      if (chores.length > 0 || expenses.length > 0 || shoppingList.length > 0) {
        setIsLoadingReminders(true);
        try {
          const reminders = await geminiService.generateDailyReminders(chores, expenses, shoppingList);
          setDailyReminders(reminders);
        } catch (error) {
          console.error('Failed to fetch reminders', error);
        } finally {
          setIsLoadingReminders(false);
        }
      }
    };
    fetchReminders();
  }, [chores.length, expenses.length, shoppingList.length]);

  const calculateBalances = () => {
    const balances: Record<string, Record<string, number>> = {};
    members.forEach(m => balances[m.uid] = {});

    expenses.forEach(e => {
      const curr = e.currency || 'USD';
      
      // Initialize currency for payer if not exists
      if (!balances[e.paidBy][curr]) balances[e.paidBy][curr] = 0;

      if (e.splitType === 'equal') {
        const share = e.amount / members.length;
        members.forEach(m => {
          if (!balances[m.uid][curr]) balances[m.uid][curr] = 0;
          if (m.uid === e.paidBy) {
            balances[m.uid][curr] += (e.amount - share);
          } else {
            balances[m.uid][curr] -= share;
          }
        });
      } else if (e.splits) {
        e.splits.forEach(split => {
          if (!balances[split.userId][curr]) balances[split.userId][curr] = 0;
          if (!balances[e.paidBy][curr]) balances[e.paidBy][curr] = 0;
          
          if (split.userId !== e.paidBy) {
            balances[split.userId][curr] -= split.amount;
            balances[e.paidBy][curr] += split.amount;
          }
        });
      }
    });
    return balances;
  };

  const simplifyAllDebts = () => {
    const currencyTransactions: Record<string, { from: string, to: string, amount: number }[]> = {};
    const currenciesInUse = Array.from(new Set(expenses.map(e => e.currency || 'USD')));

    currenciesInUse.forEach(curr => {
      const netBalances: Record<string, number> = {};
      members.forEach(m => netBalances[m.uid] = 0);

      expenses.filter(e => (e.currency || 'USD') === curr).forEach(e => {
        netBalances[e.paidBy] += e.amount;
        e.splits.forEach(s => {
          netBalances[s.userId] -= s.amount;
        });
      });

      const debtors: { uid: string, balance: number }[] = [];
      const creditors: { uid: string, balance: number }[] = [];

      Object.entries(netBalances).forEach(([uid, balance]) => {
        if (balance < -0.01) debtors.push({ uid, balance: Math.abs(balance) });
        else if (balance > 0.01) creditors.push({ uid, balance });
      });

      const transactions: { from: string, to: string, amount: number }[] = [];
      let i = 0, j = 0;
      while (i < debtors.length && j < creditors.length) {
        const amount = Math.min(debtors[i].balance, creditors[j].balance);
        transactions.push({ from: debtors[i].uid, to: creditors[j].uid, amount });
        debtors[i].balance -= amount;
        creditors[j].balance -= amount;
        if (debtors[i].balance < 0.01) i++;
        if (creditors[j].balance < 0.01) j++;
      }
      currencyTransactions[curr] = transactions;
    });
    return currencyTransactions;
  };

  const allSimplifiedDebts = simplifyAllDebts();

  const allBalances = calculateBalances();
  const myBalances = allBalances[profile?.uid || ''] || {};
  const activeBalances = Object.entries(myBalances).filter(([_, b]) => Math.abs(b) > 0.01);

  const currencies = [
    { code: 'USD', symbol: '$' },
    { code: 'EUR', symbol: '€' },
    { code: 'GBP', symbol: '£' },
    { code: 'JPY', symbol: '¥' },
    { code: 'CAD', symbol: 'CA$' },
    { code: 'AUD', symbol: 'A$' },
    { code: 'INR', symbol: '₹' },
    { code: 'CNY', symbol: '¥' },
    { code: 'BRL', symbol: 'R$' },
    { code: 'MXN', symbol: 'Mex$' },
  ];

  const getCurrencySymbol = (code: string) => {
    return currencies.find(c => c.code === code)?.symbol || code;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">Welcome back, <span className="font-bold">{profile?.displayName}</span>. Here's what's happening in <span className="font-bold">{house?.name}</span>.</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            className="gap-2"
            onClick={() => onNavigate?.('announcements')}
          >
            <Megaphone className="h-4 w-4" /> Announcements
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogTrigger nativeButton={false} render={
            <Card 
              className="bg-white shadow-sm border-none cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all"
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">Your Balance</CardTitle>
                {activeBalances.length > 0 && activeBalances[0][1] >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-rose-500" />
                )}
              </CardHeader>
              <CardContent>
                {activeBalances.length === 0 ? (
                  <div className="text-2xl font-bold text-slate-400">Settled</div>
                ) : (
                  <div className="space-y-1">
                    {activeBalances.map(([curr, balance]) => (
                      <div key={curr} className={`text-xl font-bold ${balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {balance >= 0 ? '+' : '-'}{getCurrencySymbol(curr)}{Math.abs(balance).toFixed(2)}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {activeBalances.length === 0 ? 'No outstanding debts' : 
                   activeBalances.every(([_, b]) => b >= 0) ? 'People owe you' : 
                   activeBalances.every(([_, b]) => b <= 0) ? 'You owe people' : 'Mixed balances'}
                </p>
              </CardContent>
            </Card>
          } />
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Debt Breakdown</DialogTitle>
              <DialogDescription>Detailed view of who owes whom in the house.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-6 py-4">
                {Object.keys(allSimplifiedDebts).length === 0 || Object.values(allSimplifiedDebts).every(t => t.length === 0) ? (
                  <p className="text-center py-8 text-muted-foreground italic">Everyone is settled up! 🎉</p>
                ) : (
                  Object.entries(allSimplifiedDebts).map(([curr, transactions]) => {
                    const myTxs = transactions.filter(t => t.from === profile?.uid || t.to === profile?.uid);
                    const otherTxs = transactions.filter(t => t.from !== profile?.uid && t.to !== profile?.uid);
                    
                    return transactions.length > 0 && (
                      <div key={curr} className="space-y-4">
                        <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider">{curr}</h4>
                        
                        {myTxs.length > 0 && (
                          <div className="space-y-3">
                            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Your Transactions</p>
                            {myTxs.map((t, i) => (
                              <div key={`my-${i}`} className="flex items-center justify-between p-3 rounded-lg bg-indigo-50 border border-indigo-100 text-sm">
                                <div className="flex items-center gap-2">
                                  <span className={`font-bold ${t.from === profile?.uid ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {t.from === profile?.uid ? 'You' : getUserName(t.from)}
                                  </span>
                                  <ArrowRight className={`h-3 w-3 ${t.from === profile?.uid ? 'text-rose-400' : 'text-emerald-400'}`} />
                                  <span className={`font-bold ${t.to === profile?.uid ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {t.to === profile?.uid ? 'You' : getUserName(t.to)}
                                  </span>
                                </div>
                                <span className="font-bold">{getCurrencySymbol(curr)}{t.amount.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {otherTxs.length > 0 && (
                          <div className="space-y-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Other House Debts</p>
                            {otherTxs.map((t, i) => (
                              <div key={`other-${i}`} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100 text-sm opacity-70">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{getUserName(t.from)}</span>
                                  <ArrowRight className="h-3 w-3 text-slate-400" />
                                  <span className="font-medium">{getUserName(t.to)}</span>
                                </div>
                                <span className="font-bold">{getCurrencySymbol(curr)}{t.amount.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <Card 
          className="bg-white shadow-sm border-none cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all"
          onClick={() => onNavigate?.('chores')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Chores Due</CardTitle>
            <CheckSquare className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{choresDueToday.length}</div>
            <p className="text-xs text-muted-foreground">Tasks needing attention</p>
          </CardContent>
        </Card>

        <Card 
          className="bg-white shadow-sm border-none cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all"
          onClick={() => onNavigate?.('shopping')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lowStockItems.length}</div>
            <p className="text-xs text-muted-foreground">Items to restock</p>
          </CardContent>
        </Card>

        <Card 
          className="bg-white shadow-sm border-none cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all"
          onClick={() => onNavigate?.('settings')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Housemates</CardTitle>
            <Users className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}</div>
            <p className="text-xs text-muted-foreground">Active residents</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Activity Feed & Alerts */}
        <div className="lg:col-span-7 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="bg-white shadow-sm border-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-indigo-500" />
                  House Activity
                </CardTitle>
                <CardDescription>What's been happening lately.</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-6">
                    {activities.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <p>No activity yet. Start living together!</p>
                      </div>
                    ) : (
                      activities.map((activity) => (
                        <div key={activity.id} className="flex gap-4 relative">
                          <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                          <div className="space-y-1">
                            <p className="text-sm leading-none font-medium">
                              {activity.description}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {activity.timestamp?.toDate ? formatDistanceToNow(activity.timestamp.toDate(), { addSuffix: true }) : 'Just now'}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm border-none">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                  Urgent Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {lowStockItems.slice(0, 3).map(item => (
                  <div 
                    key={item.id} 
                    className="flex items-center justify-between p-2 rounded-lg bg-rose-50 cursor-pointer hover:bg-rose-100 transition-colors"
                    onClick={() => onNavigate?.('shopping')}
                  >
                    <span className="text-sm font-medium text-rose-900">{item.name}</span>
                    <Badge variant="destructive" className="text-[10px] uppercase">{item.status}</Badge>
                  </div>
                ))}
                {choresDueToday.slice(0, 3).map(chore => (
                  <div 
                    key={chore.id} 
                    className="flex items-center justify-between p-2 rounded-lg bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors"
                    onClick={() => onNavigate?.('chores')}
                  >
                    <span className="text-sm font-medium text-amber-900">{chore.name}</span>
                    <Badge variant="outline" className="text-[10px] uppercase border-amber-200 text-amber-700">Due Today</Badge>
                  </div>
                ))}
                {lowStockItems.length === 0 && choresDueToday.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                    All clear! Everything is in order.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
