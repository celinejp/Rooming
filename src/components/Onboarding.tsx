import { useState } from 'react';
import { useHouse } from '@/src/contexts/HouseContext';
import { db, handleFirestoreError, OperationType } from '@/src/firebase';
import { doc, setDoc, updateDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Home, Plus, Users, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function Onboarding() {
  const { user } = useHouse();
  const [houseName, setHouseName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  const createHouse = async () => {
    if (!houseName || !user) return;
    setLoading(true);
    try {
      const newInviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const houseRef = await addDoc(collection(db, 'houses'), {
        name: houseName,
        inviteCode: newInviteCode,
        rentSplitType: 'equal',
        settings: {
          rules: 'Be respectful to each other.',
          quietHours: '10 PM - 8 AM',
          guestPolicy: 'Notify roommates 24h in advance.',
        },
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'users', user.uid), {
        houseId: houseRef.id,
        role: 'admin',
      });

      toast.success(`House "${houseName}" created!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'houses');
    } finally {
      setLoading(false);
    }
  };

  const joinHouse = async () => {
    if (!inviteCode || !user) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'houses'), where('inviteCode', '==', inviteCode.toUpperCase()));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        toast.error('Invalid invite code.');
        setLoading(false);
        return;
      }

      const houseDoc = querySnapshot.docs[0];
      await updateDoc(doc(db, 'users', user.uid), {
        houseId: houseDoc.id,
        role: 'member',
      });

      toast.success(`Joined ${houseDoc.data().name}!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="max-w-md w-full shadow-xl border-none">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Welcome to Rooming</CardTitle>
          <CardDescription>Let's get your household set up.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="create" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="create" className="gap-2">
                <Plus className="h-4 w-4" /> Create House
              </TabsTrigger>
              <TabsTrigger value="join" className="gap-2">
                <Users className="h-4 w-4" /> Join House
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="create" className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="houseName">House Name</Label>
                <Input 
                  id="houseName" 
                  placeholder="e.g. The Baker Street Boys" 
                  value={houseName}
                  onChange={(e) => setHouseName(e.target.value)}
                />
              </div>
              <Button 
                onClick={createHouse} 
                className="w-full gap-2" 
                disabled={!houseName || loading}
              >
                {loading ? 'Creating...' : 'Create House'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </TabsContent>

            <TabsContent value="join" className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="inviteCode">Invite Code</Label>
                <Input 
                  id="inviteCode" 
                  placeholder="Enter 6-digit code" 
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="uppercase text-center text-2xl tracking-widest font-mono"
                  maxLength={6}
                />
              </div>
              <Button 
                onClick={joinHouse} 
                className="w-full gap-2" 
                disabled={!inviteCode || loading}
              >
                {loading ? 'Joining...' : 'Join House'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
