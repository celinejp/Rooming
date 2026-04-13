import { useState } from 'react';
import { useHouse } from '@/src/contexts/HouseContext';
import { db, handleFirestoreError, OperationType } from '@/src/firebase';
import { collection, addDoc, serverTimestamp, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Plus, 
  ShoppingCart, 
  Trash2, 
  User,
  PackagePlus,
  DollarSign,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  SkipForward
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ShoppingItem } from '@/src/types';

export default function ShoppingTab({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { house, profile, shoppingList, members, getUserName, responsibilities } = useHouse();
  const [newItemName, setNewItemName] = useState('');
  const [buyingItem, setBuyingItem] = useState<ShoppingItem | null>(null);
  const [price, setPrice] = useState('');
  const [buyerId, setBuyerId] = useState('');

  const addItem = async () => {
    if (!newItemName || !house || !profile) return;
    try {
      const rotationOrder = members.map(m => m.uid);
      await addDoc(collection(db, 'shoppingList'), {
        name: newItemName,
        houseId: house.id,
        addedBy: profile.uid,
        assignedTo: rotationOrder[0],
        rotationOrder: rotationOrder,
        status: 'In Stock',
        isBought: false,
      });
      setNewItemName('');
      toast.success('Item added to house essentials');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'shoppingList');
    }
  };

  const updateStatus = async (item: ShoppingItem, newStatus: 'In Stock' | 'Low' | 'Out') => {
    try {
      await updateDoc(doc(db, 'shoppingList', item.id), {
        status: newStatus,
        isBought: newStatus === 'Out' ? false : item.isBought
      });

      if (newStatus === 'Low' || newStatus === 'Out') {
        await addDoc(collection(db, 'activities'), {
          type: 'shopping_alert',
          description: `${item.name} is ${newStatus.toLowerCase()}! ${getUserName(item.assignedTo)} it's your turn next to buy it.`,
          timestamp: serverTimestamp(),
          houseId: house?.id,
          userId: profile?.uid,
        });
      }
      toast.success(`${item.name} marked as ${newStatus}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `shoppingList/${item.id}`);
    }
  };

  const skipBuyer = async (item: ShoppingItem) => {
    const currentIndex = item.rotationOrder.indexOf(item.assignedTo);
    const nextIndex = (currentIndex + 1) % item.rotationOrder.length;
    const nextBuyer = item.rotationOrder[nextIndex];

    try {
      await updateDoc(doc(db, 'shoppingList', item.id), {
        assignedTo: nextBuyer
      });
      
      await addDoc(collection(db, 'activities'), {
        type: 'shopping_skip',
        description: `${getUserName(item.assignedTo)} skipped buying ${item.name}. Now assigned to ${getUserName(nextBuyer)}.`,
        timestamp: serverTimestamp(),
        houseId: house?.id,
        userId: profile?.uid,
      });

      toast.info(`Skipped to ${getUserName(nextBuyer)}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `shoppingList/${item.id}`);
    }
  };

  const startBuying = (item: ShoppingItem) => {
    setBuyingItem(item);
    setBuyerId(item.assignedTo || profile?.uid || '');
    setPrice('');
  };

  const confirmPurchase = async () => {
    if (!buyingItem || !price || !buyerId || !house) return;
    try {
      const amount = parseFloat(price);
      const currentIndex = buyingItem.rotationOrder.indexOf(buyingItem.assignedTo);
      const nextIndex = (currentIndex + 1) % buyingItem.rotationOrder.length;
      const nextBuyer = buyingItem.rotationOrder[nextIndex];

      await updateDoc(doc(db, 'shoppingList', buyingItem.id), {
        isBought: true,
        status: 'In Stock',
        price: amount,
        boughtBy: buyerId,
        boughtAt: serverTimestamp(),
        assignedTo: nextBuyer
      });

      await addDoc(collection(db, 'expenses'), {
        title: `Purchased: ${buyingItem.name}`,
        amount,
        currency: profile?.defaultCurrency || 'USD',
        category: 'groceries',
        paidBy: buyerId,
        splitType: 'equal',
        splits: members.map(m => ({ userId: m.uid, amount: amount / members.length })),
        date: serverTimestamp(),
        houseId: house.id,
        isRecurring: false,
      });

      await addDoc(collection(db, 'activities'), {
        type: 'expense',
        description: `${getUserName(buyerId)} bought ${buyingItem.name} for $${amount}. Next buyer: ${getUserName(nextBuyer)}`,
        timestamp: serverTimestamp(),
        houseId: house.id,
        userId: buyerId,
      });

      setBuyingItem(null);
      toast.success(`Purchased ${buyingItem.name}! Next turn: ${getUserName(nextBuyer)}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `shoppingList/${buyingItem.id}`);
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'shoppingList', id));
      toast.success('Item removed');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `shoppingList/${id}`);
    }
  };

  const myPendingBills = responsibilities.filter(r => r.assignedTo === profile?.uid && r.status === 'pending');

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">House Essentials</h2>
        <p className="text-muted-foreground">Track stock and rotate buying responsibilities.</p>
      </div>

      {myPendingBills.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider px-1">Bill Reminders</h3>
          <div className="grid gap-3">
            {myPendingBills.map(bill => (
              <Card key={bill.id} className="bg-amber-50 border-amber-200 shadow-sm">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                      <DollarSign className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-bold text-amber-900">{bill.title}</p>
                      <p className="text-xs text-amber-700">It's time to add the {bill.currency}{bill.amount} split.</p>
                    </div>
                  </div>
                    <Button 
                      size="sm" 
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={() => onNavigate?.('participants:responsibilities')}
                    >
                      Review
                    </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-white shadow-xl border-none overflow-hidden">
            <CardHeader className="bg-primary/5 pb-8">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <ShoppingCart className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Add essential (e.g. Toilet Paper, Milk)" 
                    className="pl-9 h-11 bg-white"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addItem()}
                  />
                </div>
                <Button onClick={addItem} className="h-11 px-6 shadow-lg shadow-primary/20">
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <div className="divide-y divide-slate-100">
                  {shoppingList.length === 0 ? (
                    <div className="text-center py-24 text-muted-foreground">
                      <PackagePlus className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p>Your essentials list is empty.</p>
                    </div>
                  ) : (
                    shoppingList.map((item) => {
                      const isAssignedToMe = item.assignedTo === profile?.uid;
                      
                      return (
                        <div key={item.id} className="group p-4 hover:bg-slate-50 transition-colors space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                                item.status === 'In Stock' ? 'bg-emerald-100 text-emerald-600' :
                                item.status === 'Low' ? 'bg-amber-100 text-amber-600' :
                                'bg-rose-100 text-rose-600'
                              }`}>
                                {item.status === 'In Stock' ? <CheckCircle className="h-5 w-5" /> :
                                 item.status === 'Low' ? <AlertCircle className="h-5 w-5" /> :
                                 <XCircle className="h-5 w-5" />}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-900">{item.name}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className={`text-[10px] uppercase ${
                                    item.status === 'In Stock' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' :
                                    item.status === 'Low' ? 'border-amber-200 text-amber-700 bg-amber-50' :
                                    'border-rose-200 text-rose-700 bg-rose-50'
                                  }`}>
                                    {item.status}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <RefreshCw className="h-3 w-3" /> Next: {getUserName(item.assignedTo)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {item.status !== 'In Stock' && (
                                <Button 
                                  size="sm" 
                                  className={isAssignedToMe ? "bg-primary" : "bg-slate-200 text-slate-600"}
                                  onClick={() => startBuying(item)}
                                >
                                  Buy Now
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => deleteItem(item.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 text-[10px] px-2"
                              onClick={() => updateStatus(item, 'In Stock')}
                            >
                              In Stock
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 text-[10px] px-2 border-amber-200 text-amber-700 hover:bg-amber-50"
                              onClick={() => updateStatus(item, 'Low')}
                            >
                              Low
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 text-[10px] px-2 border-rose-200 text-rose-700 hover:bg-rose-50"
                              onClick={() => updateStatus(item, 'Out')}
                            >
                              Out
                            </Button>
                            <div className="flex-1" />
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 text-[10px] px-2 text-slate-500 hover:text-primary"
                              onClick={() => skipBuyer(item)}
                            >
                              <SkipForward className="h-3 w-3 mr-1" /> Skip Turn
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-indigo-600 text-white border-none shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg">Rotation System</CardTitle>
              <CardDescription className="text-indigo-100">
                Fairly distribute the cost of essentials.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-indigo-500 flex items-center justify-center text-xs">1</div>
                <p>Add items everyone uses.</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-indigo-500 flex items-center justify-center text-xs">2</div>
                <p>Mark as "Low" or "Out" when running thin.</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-indigo-500 flex items-center justify-center text-xs">3</div>
                <p>The assigned person buys it and the turn rotates.</p>
              </div>
              <div className="pt-4 border-t border-indigo-500">
                <p className="text-xs italic opacity-80">
                  "Skip Turn" allows reassigning to the next person if someone can't make it to the store.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!buyingItem} onOpenChange={(open) => !open && setBuyingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Purchase</DialogTitle>
            <DialogDescription>Enter the purchase details for {buyingItem?.name}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="price">Price ({profile?.defaultCurrency || 'USD'})</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="price" 
                  type="number" 
                  placeholder="0.00" 
                  className="pl-9"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="buyer">Who bought it?</Label>
              <Select value={buyerId} onValueChange={setBuyerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select buyer">
                    {getUserName(buyerId)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.uid} value={m.uid}>{m.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={confirmPurchase} disabled={!price || !buyerId} className="w-full">
            Confirm & Rotate Turn
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
