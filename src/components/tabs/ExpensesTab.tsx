import { useState, useEffect } from 'react';
import { useHouse } from '@/src/contexts/HouseContext';
import { db, handleFirestoreError, OperationType } from '@/src/firebase';
import { collection, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Plus, 
  Receipt, 
  Trash2, 
  DollarSign, 
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  MessageSquare,
  Users,
  Split,
  Calendar as CalendarIcon,
  Info,
  CheckCircle2,
  Image as ImageIcon,
  Pencil,
  Camera,
  X,
  Eye
} from 'lucide-react';
import { format } from 'date-fns';
import { geminiService } from '@/src/services/gemini';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { ExpenseSplit } from '@/src/types';

export default function ExpensesTab() {
  const { house, profile, members, expenses, getUserName } = useHouse();
  const [isAddOpen, setIsAddOpen] = useState(false);
  
  // Form State
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'rent' | 'groceries' | 'utilities' | 'entertainment' | 'other'>('other');
  const [paidBy, setPaidBy] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [splitType, setSplitType] = useState<'equal' | 'amount' | 'percentage' | 'shares'>('equal');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [splitValues, setSplitValues] = useState<Record<string, string>>({});
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isSettleUpOpen, setIsSettleUpOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const settleDebt = async (from: string, to: string, amount: number, curr: string) => {
    if (!house || !profile) return;
    setIsSaving(true);
    try {
      const settlementData = {
        title: `Settlement: ${getUserName(from)} to ${getUserName(to)}`,
        amount: amount,
        currency: curr,
        description: `Debt settlement payment`,
        category: 'other',
        paidBy: from,
        splitType: 'amount',
        splits: [{ userId: to, amount: amount }],
        date: new Date(),
        houseId: house.id,
        isRecurring: false,
        receiptImage: null,
      };

      await addDoc(collection(db, 'expenses'), settlementData);
      
      await addDoc(collection(db, 'activities'), {
        type: 'expense',
        description: `${getUserName(from)} settled a debt of ${getCurrencySymbol(curr)}${amount.toFixed(2)} to ${getUserName(to)}`,
        timestamp: serverTimestamp(),
        houseId: house.id,
        userId: profile.uid,
      });
      
      toast.success('Debt settled!');
      setIsSettleUpOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'expenses');
    } finally {
      setIsSaving(false);
    }
  };

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

  useEffect(() => {
    if (members.length > 0) {
      setSelectedMembers(members.map(m => m.uid));
      setPaidBy(profile?.uid || members[0].uid);
      const initialValues: Record<string, string> = {};
      members.forEach(m => initialValues[m.uid] = '');
      setSplitValues(initialValues);
    }
  }, [members, profile]);

  const calculateSplits = (): ExpenseSplit[] => {
    const total = parseFloat(amount) || 0;
    if (total <= 0 || selectedMembers.length === 0) return [];

    switch (splitType) {
      case 'equal': {
        const share = total / selectedMembers.length;
        return selectedMembers.map(uid => ({ userId: uid, amount: share }));
      }
      case 'amount': {
        return selectedMembers.map(uid => ({ 
          userId: uid, 
          amount: parseFloat(splitValues[uid]) || 0 
        }));
      }
      case 'percentage': {
        return selectedMembers.map(uid => ({ 
          userId: uid, 
          amount: (total * (parseFloat(splitValues[uid]) || 0)) / 100,
          percentage: parseFloat(splitValues[uid]) || 0
        }));
      }
      case 'shares': {
        const totalShares = selectedMembers.reduce((acc, uid) => acc + (parseFloat(splitValues[uid]) || 0), 0);
        if (totalShares === 0) return [];
        return selectedMembers.map(uid => ({ 
          userId: uid, 
          amount: (total * (parseFloat(splitValues[uid]) || 0)) / totalShares,
          shares: parseFloat(splitValues[uid]) || 0
        }));
      }
      default:
        return [];
    }
  };

  const addExpense = async () => {
    if (!amount || !title || !paidBy || !house) return;
    const finalSplits = calculateSplits();
    
    // Validation
    const splitTotal = finalSplits.reduce((acc, s) => acc + s.amount, 0);
    if (Math.abs(splitTotal - parseFloat(amount)) > 0.01) {
      toast.error(`Split total (${getCurrencySymbol(currency)}${splitTotal.toFixed(2)}) must equal total amount (${getCurrencySymbol(currency)}${amount})`);
      return;
    }

    setIsSaving(true);
    try {
      const expenseData = {
        title,
        amount: parseFloat(amount),
        currency,
        description,
        category,
        paidBy,
        splitType,
        splits: finalSplits,
        date: new Date(date),
        houseId: house.id,
        isRecurring: false,
        receiptImage: receiptImage || null,
      };

      if (editingExpenseId) {
        await updateDoc(doc(db, 'expenses', editingExpenseId), expenseData);
        
        await addDoc(collection(db, 'activities'), {
          type: 'expense_update',
          description: `${profile?.displayName || 'Someone'} updated the expense: ${title}`,
          timestamp: serverTimestamp(),
          houseId: house.id,
          userId: profile?.uid || '',
        });
        
        toast.success(`Expense updated! Everyone has been notified.`);
      } else {
        await addDoc(collection(db, 'expenses'), expenseData);
        
        await addDoc(collection(db, 'activities'), {
          type: 'expense',
          description: `${getUserName(paidBy)} added an expense: ${title} (${getCurrencySymbol(currency)}${amount})`,
          timestamp: serverTimestamp(),
          houseId: house.id,
          userId: profile?.uid || paidBy,
        });

        const amountStr = `${getCurrencySymbol(currency)}${parseFloat(amount).toFixed(2)}`;
        for (const member of members) {
          if (member.uid === paidBy) continue;
          if ((member.notificationSettings?.expenses ?? true) === false) continue;
          await addDoc(collection(db, 'notifications'), {
            userId: member.uid,
            houseId: house.id,
            type: 'expense',
            title: 'New expense',
            message: `${getUserName(paidBy)} added ${title} (${amountStr})`,
            timestamp: serverTimestamp(),
            read: false,
            link: 'expenses',
          });
        }
        
        toast.success('Expense added!');
      }

      setIsAddOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'expenses');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (expense: any) => {
    setEditingExpenseId(expense.id);
    setTitle(expense.title);
    setAmount(expense.amount.toString());
    setCurrency(expense.currency || 'USD');
    setDescription(expense.description || '');
    setCategory(expense.category);
    setPaidBy(expense.paidBy);
    setSplitType(expense.splitType);
    setReceiptImage(expense.receiptImage || null);
    
    if (expense.date?.toDate) {
      setDate(format(expense.date.toDate(), 'yyyy-MM-dd'));
    } else if (expense.date instanceof Date) {
      setDate(format(expense.date, 'yyyy-MM-dd'));
    }

    const uids = expense.splits.map((s: any) => s.userId);
    setSelectedMembers(uids);
    
    const values: Record<string, string> = {};
    expense.splits.forEach((s: any) => {
      if (expense.splitType === 'percentage') values[s.userId] = s.percentage?.toString() || '';
      else if (expense.splitType === 'shares') values[s.userId] = s.shares?.toString() || '';
      else if (expense.splitType === 'amount') values[s.userId] = s.amount?.toString() || '';
    });
    setSplitValues(values);
    
    setIsAddOpen(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const resetForm = () => {
    setTitle('');
    setAmount('');
    setCurrency('USD');
    setDescription('');
    setCategory('other');
    setSplitType('equal');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setEditingExpenseId(null);
    setReceiptImage(null);
    if (members.length > 0) {
      setSelectedMembers(members.map(m => m.uid));
      setPaidBy(profile?.uid || members[0].uid);
      const initialValues: Record<string, string> = {};
      members.forEach(m => initialValues[m.uid] = '');
      setSplitValues(initialValues);
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'expenses', id));
      toast.success('Expense deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `expenses/${id}`);
    }
  };

  const handleAutoCategorize = async () => {
    if (!title) return;
    setIsCategorizing(true);
    try {
      const cat = await geminiService.autoCategorizeExpense(title);
      setCategory(cat);
      toast.success(`Categorized as ${cat}`);
    } catch (error) {
      console.error(error);
    } finally {
      setIsCategorizing(false);
    }
  };

  const simplifyDebts = () => {
    // Group debts by currency
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

  const transactionsByCurrency = simplifyDebts();

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'rent': return 'bg-blue-100 text-blue-700';
      case 'groceries': return 'bg-emerald-100 text-emerald-700';
      case 'utilities': return 'bg-amber-100 text-amber-700';
      case 'entertainment': return 'bg-purple-100 text-purple-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Expenses</h2>
          <p className="text-muted-foreground">Track shared costs and settle up with ease.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isSettleUpOpen} onOpenChange={setIsSettleUpOpen}>
            <DialogTrigger nativeButton={true} render={<Button variant="outline" className="gap-2" />}>
              <CheckCircle2 className="h-4 w-4" /> Settle Up
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Simplified Debts</DialogTitle>
                <DialogDescription>Minimum transactions to settle all house debts.</DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] pr-4">
                <div className="space-y-6 py-4">
                  {Object.keys(transactionsByCurrency).length === 0 || Object.values(transactionsByCurrency).every(t => t.length === 0) ? (
                    <p className="text-center py-8 text-muted-foreground italic">Everyone is settled up! 🎉</p>
                  ) : (
                    Object.entries(transactionsByCurrency).map(([curr, transactions]) => {
                      const myTxs = transactions.filter(t => t.from === profile?.uid || t.to === profile?.uid);
                      const otherTxs = transactions.filter(t => t.from !== profile?.uid && t.to !== profile?.uid);
                      
                      return transactions.length > 0 && (
                        <div key={curr} className="space-y-4">
                          <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider">{curr}</h4>
                          
                          {myTxs.length > 0 && (
                            <div className="space-y-3">
                              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Your Transactions</p>
                              {myTxs.map((t, i) => (
                                <div key={`my-${i}`} className="flex items-center justify-between p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                                  <div className="flex items-center gap-3">
                                    <span className={`font-bold ${t.from === profile?.uid ? 'text-rose-600' : 'text-emerald-600'}`}>
                                      {t.from === profile?.uid ? 'You' : getUserName(t.from)}
                                    </span>
                                    <ArrowUpRight className={`h-4 w-4 ${t.from === profile?.uid ? 'text-rose-500' : 'text-emerald-500'}`} />
                                    <span className={`font-bold ${t.to === profile?.uid ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      {t.to === profile?.uid ? 'You' : getUserName(t.to)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <span className="font-bold text-lg">{getCurrencySymbol(curr)}{t.amount.toFixed(2)}</span>
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="h-8 text-xs bg-white text-indigo-700 border-indigo-100 hover:bg-indigo-100"
                                      onClick={() => settleDebt(t.from, t.to, t.amount, curr)}
                                      disabled={isSaving}
                                    >
                                      {isSaving ? '...' : 'Settle'}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {otherTxs.length > 0 && (
                            <div className="space-y-3">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Other House Debts</p>
                              {otherTxs.map((t, i) => (
                                <div key={`other-${i}`} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100 opacity-70">
                                  <div className="flex items-center gap-3">
                                    <span className="font-medium">{getUserName(t.from)}</span>
                                    <ArrowUpRight className="h-4 w-4 text-slate-400" />
                                    <span className="font-medium">{getUserName(t.to)}</span>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <span className="font-bold">{getCurrencySymbol(curr)}{t.amount.toFixed(2)}</span>
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="h-8 text-xs"
                                      onClick={() => settleDebt(t.from, t.to, t.amount, curr)}
                                      disabled={isSaving}
                                    >
                                      Settle
                                    </Button>
                                  </div>
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
          <Dialog open={isAddOpen} onOpenChange={(open) => {
            if (!open) resetForm();
            setIsAddOpen(open);
          }}>
            <DialogTrigger nativeButton={true} render={<Button className="gap-2 shadow-lg shadow-primary/20" />}>
              <Plus className="h-4 w-4" /> Add Expense
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>{editingExpenseId ? 'Edit Expense' : 'Add New Expense'}</DialogTitle>
                <DialogDescription>
                  {editingExpenseId ? 'Update the details of this expense.' : 'Enter the details of the shared expense.'}
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[80vh] pr-4">
                <div className="grid gap-6 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="title">Title</Label>
                      <div className="flex gap-2">
                        <Input 
                          id="title" 
                          placeholder="e.g. Rent" 
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          onBlur={handleAutoCategorize}
                        />
                        <Button 
                          variant="outline" 
                          size="icon" 
                          onClick={handleAutoCategorize}
                          disabled={isCategorizing || !title}
                        >
                          <Sparkles className={`h-4 w-4 ${isCategorizing ? 'animate-spin' : ''}`} />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="amount">Total Amount</Label>
                      <div className="flex gap-2">
                        <Select value={currency} onValueChange={setCurrency}>
                          <SelectTrigger className="w-[100px]">
                            <SelectValue placeholder="USD" />
                          </SelectTrigger>
                          <SelectContent>
                            {currencies.map(c => (
                              <SelectItem key={c.code} value={c.code}>{c.code} ({c.symbol})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-3 h-4 w-4 text-muted-foreground text-xs flex items-center justify-center">
                            {getCurrencySymbol(currency)}
                          </span>
                          <Input 
                            id="amount" 
                            type="number" 
                            placeholder="0.00" 
                            className="pl-9"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="category">Category</Label>
                      <Select value={category} onValueChange={(v: any) => setCategory(v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rent">Rent</SelectItem>
                          <SelectItem value="groceries">Groceries</SelectItem>
                          <SelectItem value="utilities">Utilities</SelectItem>
                          <SelectItem value="entertainment">Entertainment</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="date">Date</Label>
                      <div className="relative">
                        <CalendarIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="date" 
                          type="date" 
                          className="pl-9"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="paidBy">Paid By</Label>
                    <Select value={paidBy} onValueChange={setPaidBy}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select who paid">
                          {getUserName(paidBy)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {members.map(m => (
                          <SelectItem key={m.uid} value={m.uid}>
                            {m.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="description">Description (Optional)</Label>
                    <Input 
                      id="description" 
                      placeholder="e.g. March rent payment" 
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Receipt / Bill Image</Label>
                    <div className="flex flex-col gap-4">
                      {receiptImage ? (
                        <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-200 group">
                          <img src={receiptImage} alt="Receipt" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <Button variant="destructive" size="sm" onClick={() => setReceiptImage(null)}>
                              <X className="h-4 w-4 mr-2" /> Remove
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center w-full">
                          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                              <Camera className="w-8 h-8 mb-3 text-slate-400" />
                              <p className="mb-2 text-sm text-slate-500 font-semibold">Click to upload receipt</p>
                              <p className="text-xs text-slate-400">PNG, JPG or WEBP</p>
                            </div>
                            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-bold">
                        <Split className="h-4 w-4 text-primary" />
                        Split Options
                      </div>
                      <Select value={splitType} onValueChange={(v: any) => setSplitType(v)}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Select split type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equal">Equally</SelectItem>
                          <SelectItem value="amount">By Amount</SelectItem>
                          <SelectItem value="percentage">By Percentage</SelectItem>
                          <SelectItem value="shares">By Shares</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-4">
                        {members.map(m => (
                          <div key={m.uid} className="flex items-center gap-2">
                            <Checkbox 
                              id={`member-${m.uid}`}
                              checked={selectedMembers.includes(m.uid)}
                              onCheckedChange={(checked) => {
                                if (checked) setSelectedMembers([...selectedMembers, m.uid]);
                                else setSelectedMembers(selectedMembers.filter(id => id !== m.uid));
                              }}
                            />
                            <Label htmlFor={`member-${m.uid}`} className="text-xs cursor-pointer">{m.displayName}</Label>
                          </div>
                        ))}
                      </div>

                      {splitType !== 'equal' && (
                        <div className="space-y-3 pt-2 border-t border-slate-200">
                          {selectedMembers.map(uid => (
                            <div key={uid} className="flex items-center justify-between gap-4">
                              <span className="text-xs font-medium truncate flex-1">{getUserName(uid)}</span>
                              <div className="relative w-32">
                                {splitType === 'percentage' && <span className="absolute right-3 top-2 text-xs text-muted-foreground">%</span>}
                                {splitType === 'shares' && <span className="absolute right-3 top-2 text-xs text-muted-foreground">sh</span>}
                                {splitType === 'amount' && (
                                  <span className="absolute left-3 top-2 text-xs text-muted-foreground">
                                    {getCurrencySymbol(currency)}
                                  </span>
                                )}
                                <Input 
                                  type="number" 
                                  placeholder="0" 
                                  className={`h-8 text-right ${splitType === 'amount' ? 'pl-6' : 'pr-8'}`}
                                  value={splitValues[uid]}
                                  onChange={(e) => setSplitValues({...splitValues, [uid]: e.target.value})}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {splitType === 'equal' && (
                        <p className="text-[10px] text-muted-foreground italic">
                          Total will be divided equally among {selectedMembers.length} selected people.
                          ({getCurrencySymbol(currency)}{((parseFloat(amount) || 0) / (selectedMembers.length || 1)).toFixed(2)} each)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>
              <Button onClick={addExpense} className="w-full" disabled={!amount || !title || isSaving}>
                {isSaving ? 'Saving...' : 'Save Expense'}
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 bg-white shadow-sm border-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Recent Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-4">
                {expenses.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>No expenses recorded yet.</p>
                  </div>
                ) : (
                  expenses.map((expense) => {
                    const payerName = getUserName(expense.paidBy);
                    const sym = getCurrencySymbol(expense.currency || 'USD');

                    return (
                      <div key={expense.id} className="group flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-all border border-transparent hover:border-slate-200">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-xl ${getCategoryColor(expense.category)}`}>
                            <Receipt className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{expense.title}</p>
                            {expense.description && (
                              <p className="text-xs text-muted-foreground italic mb-1">{expense.description}</p>
                            )}
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span className="font-bold text-slate-700">{payerName} paid {sym}{expense.amount.toFixed(2)}</span>
                              <span>•</span>
                              <span>{(() => {
                                if (expense.date?.toDate) return format(expense.date.toDate(), 'MMM d, yyyy');
                                if (expense.date instanceof Date) return format(expense.date, 'MMM d, yyyy');
                                if (typeof expense.date === 'string') return format(new Date(expense.date), 'MMM d, yyyy');
                                return 'Just now';
                              })()}</span>
                            </div>
                            {expense.receiptImage && (
                              <div className="mt-2 relative w-12 h-12 rounded-lg overflow-hidden border border-slate-200 shadow-sm group/img">
                                <img src={expense.receiptImage} alt="Receipt thumbnail" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                  <ImageIcon className="h-3 w-3 text-white" />
                                </div>
                              </div>
                            )}
                            <div className="mt-2 flex flex-wrap gap-1">
                              {expense.splits.map(s => (
                                <Badge key={s.userId} variant="outline" className="text-[9px] py-0 h-5 bg-white">
                                  {getUserName(s.userId)} owes {sym}{s.amount.toFixed(2)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-bold text-lg">{sym}{expense.amount.toFixed(2)}</p>
                            <Badge variant="secondary" className="text-[8px] uppercase tracking-tighter">
                              {expense.splitType}
                            </Badge>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Dialog>
                              <DialogTrigger nativeButton={true} render={<Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50" />}>
                                <Eye className="h-4 w-4" />
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-[600px]">
                                <DialogHeader>
                                  <DialogTitle>Expense Details</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-6 py-4">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <h3 className="text-2xl font-bold">{expense.title}</h3>
                                      <p className="text-sm text-muted-foreground">{expense.description || 'No description'}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-3xl font-bold">{sym}{expense.amount.toFixed(2)}</p>
                                      <Badge variant="secondary">{expense.category}</Badge>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100 text-sm">
                                    <div>
                                      <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Paid By</p>
                                      <p className="font-medium">{payerName}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Date</p>
                                      <p className="font-medium">
                                        {(() => {
                                          if (expense.date?.toDate) return format(expense.date.toDate(), 'MMMM d, yyyy');
                                          if (expense.date instanceof Date) return format(expense.date, 'MMMM d, yyyy');
                                          if (typeof expense.date === 'string') return format(new Date(expense.date), 'MMMM d, yyyy');
                                          return 'Unknown';
                                        })()}
                                      </p>
                                    </div>
                                  </div>

                                  <div>
                                    <p className="text-xs text-muted-foreground uppercase font-bold mb-3">Split Details ({expense.splitType})</p>
                                    <div className="space-y-2">
                                      {expense.splits.map(s => (
                                        <div key={s.userId} className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-100">
                                          <span className="font-medium">{getUserName(s.userId)}</span>
                                          <span className="font-bold">{sym}{s.amount.toFixed(2)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {expense.receiptImage && (
                                    <div>
                                      <p className="text-xs text-muted-foreground uppercase font-bold mb-3">Receipt</p>
                                      <div className="aspect-auto max-h-[400px] overflow-hidden rounded-xl border border-slate-200">
                                        <img src={expense.receiptImage} alt="Receipt" className="w-full h-full object-contain" />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>

                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              onClick={() => handleEdit(expense)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              onClick={() => deleteExpense(expense.id)}
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

        <div className="space-y-6 h-fit sticky top-8">
          <Dialog open={isSettleUpOpen} onOpenChange={setIsSettleUpOpen}>
            <DialogTrigger nativeButton={false} render={
              <Card className="bg-white shadow-sm border-none cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-indigo-500" />
                    Net Balances
                  </CardTitle>
                  <CardDescription>Total standing for each member. Click to see who owes who.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {members.map(member => {
                    const isMe = member.uid === profile?.uid;
                    
                    if (isMe) {
                      const mySummary: Record<string, { owe: number, getBack: number }> = {};
                      Object.entries(transactionsByCurrency).forEach(([curr, txs]) => {
                        const owe = txs.filter(t => t.from === profile?.uid).reduce((sum, t) => sum + t.amount, 0);
                        const getBack = txs.filter(t => t.to === profile?.uid).reduce((sum, t) => sum + t.amount, 0);
                        if (owe > 0.01 || getBack > 0.01) {
                          mySummary[curr] = { owe, getBack };
                        }
                      });

                      return (
                        <div key={member.uid} className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                              {member.displayName?.[0]}
                            </div>
                            <span className="text-sm font-bold text-indigo-900">Your Summary</span>
                          </div>
                          <div className="space-y-2">
                            {Object.entries(mySummary).length === 0 ? (
                              <p className="text-xs text-indigo-600 italic">You're all settled up!</p>
                            ) : (
                              Object.entries(mySummary).map(([curr, { owe, getBack }]) => (
                                <div key={curr} className="grid grid-cols-2 gap-2" title={`${curr} Balance`}>
                                  <div className="flex flex-col">
                                    <span className="text-[10px] uppercase text-indigo-400 font-bold">You Owe</span>
                                    <span className="text-sm font-bold text-rose-600">{getCurrencySymbol(curr)}{owe.toFixed(2)}</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[10px] uppercase text-indigo-400 font-bold">You're Owed</span>
                                    <span className="text-sm font-bold text-emerald-600">{getCurrencySymbol(curr)}{getBack.toFixed(2)}</span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    }

                    // For other members, show relationship with current user
                    const relationships: { curr: string, balance: number }[] = [];
                    Object.entries(transactionsByCurrency).forEach(([curr, txs]) => {
                      const iOweThem = txs.find(t => t.from === profile?.uid && t.to === member.uid)?.amount || 0;
                      const theyOweMe = txs.find(t => t.from === member.uid && t.to === profile?.uid)?.amount || 0;
                      const balance = theyOweMe - iOweThem;
                      if (Math.abs(balance) > 0.01) {
                        relationships.push({ curr, balance });
                      }
                    });

                    return (
                      <div key={member.uid} className="space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold">
                            {member.displayName?.[0]}
                          </div>
                          <span className="text-sm font-medium">{member.displayName}</span>
                        </div>
                        <div className="pl-11 space-y-1">
                          {relationships.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground italic">No direct balance with you</span>
                          ) : (
                            relationships.map(({ curr, balance }) => (
                              <div key={curr} className={`flex items-center gap-1 text-xs font-bold ${balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {balance >= 0 ? (
                                  <>
                                    <ArrowUpRight className="h-3 w-3" />
                                    Owes you {getCurrencySymbol(curr)}{balance.toFixed(2)}
                                  </>
                                ) : (
                                  <>
                                    <ArrowDownLeft className="h-3 w-3" />
                                    You owe {getCurrencySymbol(curr)}{Math.abs(balance).toFixed(2)}
                                  </>
                                )}
                                <span className="text-[8px] text-muted-foreground ml-1">{curr}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            } />
          </Dialog>
        </div>
      </div>
    </div>
  );
}
