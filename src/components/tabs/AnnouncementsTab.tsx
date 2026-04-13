import { useState } from 'react';
import { useHouse } from '@/src/contexts/HouseContext';
import { db, handleFirestoreError, OperationType } from '@/src/firebase';
import { collection, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Megaphone, 
  Shield, 
  Pin, 
  Plus, 
  Bell,
  Clock,
  User
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function AnnouncementsTab() {
  const { house, profile, members, announcements, getUserName } = useHouse();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [rules, setRules] = useState(house?.settings?.rules || '');
  const [quietHours, setQuietHours] = useState(house?.settings?.quietHours || '');

  const postAnnouncement = async () => {
    if (!title || !content || !house || !profile) return;
    try {
      await addDoc(collection(db, 'announcements'), {
        title,
        content,
        isPinned,
        authorId: profile.uid,
        houseId: house.id,
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'activities'), {
        type: 'announcement',
        description: `${profile.displayName} posted a new announcement: ${title}`,
        timestamp: serverTimestamp(),
        houseId: house.id,
        userId: profile.uid,
      });

      // Notify all members except author
      const otherMembers = members.filter(m => m.uid !== profile.uid);
      for (const member of otherMembers) {
        await addDoc(collection(db, 'notifications'), {
          userId: member.uid,
          houseId: house.id,
          type: 'announcement',
          title: 'New Announcement',
          message: `${profile.displayName} posted: ${title}`,
          timestamp: serverTimestamp(),
          read: false,
          link: 'announcements'
        });
      }

      setIsAddOpen(false);
      setTitle('');
      setContent('');
      setIsPinned(false);
      toast.success('Announcement posted!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'announcements');
    }
  };

  const saveRules = async () => {
    if (!house) return;
    try {
      await updateDoc(doc(db, 'houses', house.id), {
        'settings.rules': rules,
        'settings.quietHours': quietHours,
      });

      await addDoc(collection(db, 'activities'), {
        type: 'rules_update',
        description: `${profile?.displayName} updated the house rules`,
        timestamp: serverTimestamp(),
        houseId: house.id,
        userId: profile?.uid,
      });

      // Notify all members except author
      const otherMembers = members.filter(m => m.uid !== profile?.uid);
      for (const member of otherMembers) {
        await addDoc(collection(db, 'notifications'), {
          userId: member.uid,
          houseId: house.id,
          type: 'rules',
          title: 'House Rules Updated',
          message: `${profile?.displayName} updated the house rules and quiet hours.`,
          timestamp: serverTimestamp(),
          read: false,
          link: 'announcements'
        });
      }

      toast.success('House rules updated!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `houses/${house.id}`);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Announcements</h2>
          <p className="text-muted-foreground">Stay informed about house updates and policies.</p>
        </div>
        <Button onClick={() => setIsAddOpen(!isAddOpen)} className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="h-4 w-4" /> Post Announcement
        </Button>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          {isAddOpen && (
            <Card className="border-primary/20 shadow-lg animate-in zoom-in-95 duration-200">
              <CardHeader>
                <CardTitle className="text-lg">New Announcement</CardTitle>
                <CardDescription>This will be visible to everyone in the house.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input 
                    id="title" 
                    value={title} 
                    onChange={(e) => setTitle(e.target.value)} 
                    placeholder="e.g. Cleaning day this Saturday"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="content">Content</Label>
                  <Textarea 
                    id="content" 
                    value={content} 
                    onChange={(e) => setContent(e.target.value)} 
                    placeholder="Provide more details..."
                    className="min-h-[100px]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="pin" 
                    checked={isPinned} 
                    onChange={(e) => setIsPinned(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="pin" className="text-sm cursor-pointer">Pin to top</Label>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                  <Button onClick={postAnnouncement} disabled={!title || !content}>Post Now</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {announcements.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                <Megaphone className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                <p className="text-muted-foreground">No announcements yet.</p>
              </div>
            ) : (
              announcements.map((ann) => (
                <Card key={ann.id} className={`bg-white shadow-sm border-none relative overflow-hidden ${ann.isPinned ? 'ring-2 ring-primary/10' : ''}`}>
                  {ann.isPinned && (
                    <div className="absolute top-0 right-0 p-2">
                      <Pin className="h-4 w-4 text-primary fill-primary" />
                    </div>
                  )}
                  <CardHeader>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <User className="h-3 w-3" /> {getUserName(ann.authorId)}
                      <span>•</span>
                      <Clock className="h-3 w-3" /> {ann.createdAt?.toDate ? format(ann.createdAt.toDate(), 'MMM d, h:mm a') : 'Just now'}
                    </div>
                    <CardTitle className="text-xl">{ann.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{ann.content}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Card className="bg-indigo-900 text-white border-none shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-300" />
                House Rules
              </CardTitle>
              <CardDescription className="text-indigo-200">Core policies for the household.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rules" className="text-indigo-100">General Rules</Label>
                <Textarea 
                  id="rules" 
                  value={rules} 
                  onChange={(e) => setRules(e.target.value)}
                  placeholder="e.g. No guests after midnight..."
                  className="bg-indigo-950/50 border-indigo-800 text-white placeholder:text-indigo-400 min-h-[150px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quietHours" className="text-indigo-100">Quiet Hours</Label>
                <Input 
                  id="quietHours" 
                  value={quietHours} 
                  onChange={(e) => setQuietHours(e.target.value)}
                  placeholder="e.g. 10 PM - 8 AM"
                  className="bg-indigo-950/50 border-indigo-800 text-white placeholder:text-indigo-400"
                />
              </div>
              <Button onClick={saveRules} className="w-full bg-white text-indigo-900 hover:bg-indigo-50">Save House Rules</Button>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm border-none">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground leading-relaxed">
              New announcements will trigger a notification for all house members.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
