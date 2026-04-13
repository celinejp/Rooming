import { useState, useEffect } from 'react';
import { useHouse } from '@/src/contexts/HouseContext';
import { auth, db, handleFirestoreError, OperationType } from '@/src/firebase';
import { updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  User, 
  Mail, 
  Phone, 
  Globe, 
  Coins, 
  Bell, 
  Trash2, 
  LogOut,
  Moon,
  Sun,
  ShieldAlert
} from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export default function SettingsTab() {
  const { profile, user } = useHouse();
  const [name, setName] = useState(profile?.displayName || '');
  const [phone, setPhone] = useState(profile?.phoneNumber || '');
  const [timezone, setTimezone] = useState(profile?.timezone || 'UTC');
  const [currency, setCurrency] = useState(profile?.defaultCurrency || 'USD');
  const [isSaving, setIsSaving] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [notifications, setNotifications] = useState(profile?.notificationSettings || {
    expenses: true,
    chores: true,
    inventory: true,
    announcements: true
  });

  useEffect(() => {
    setIsDarkMode(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('darkMode', String(newMode));
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const saveAccountDetails = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: name,
        phoneNumber: phone,
        timezone: timezone,
        defaultCurrency: currency,
        notificationSettings: notifications
      });
      toast.success('Account details updated!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

  const closeAccount = async () => {
    if (!user || !confirm('Are you sure you want to CLOSE your account? This action is permanent and will remove you from your house.')) return;
    try {
      // 1. Delete from Firestore
      await deleteDoc(doc(db, 'users', user.uid));
      // 2. Delete from Auth
      await deleteUser(user);
      toast.success('Account closed successfully.');
      window.location.reload();
    } catch (error) {
      console.error(error);
      toast.error('Failed to close account. You may need to re-authenticate first.');
    }
  };

  const handleLogout = () => auth.signOut();

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your personal account and app preferences.</p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-8">
          {/* Account Details */}
          <Card className="bg-white dark:bg-slate-900 shadow-sm border-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Account Details
              </CardTitle>
              <CardDescription>Update your personal information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="name" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder="Enter your name"
                    className="pl-9" 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="email" value={profile?.email} disabled className="pl-9 bg-slate-50 dark:bg-slate-800" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" className="pl-9" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                      <SelectItem value="America/New_York">Eastern Time</SelectItem>
                      <SelectItem value="Europe/London">London</SelectItem>
                      <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Default Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                      <SelectItem value="JPY">JPY (¥)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={saveAccountDetails} className="w-full" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Account Details'}
              </Button>
            </CardContent>
          </Card>

          {/* Preferences */}
          <Card className="bg-white dark:bg-slate-900 shadow-sm border-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                App Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Dark Mode</Label>
                  <p className="text-xs text-muted-foreground">Switch between light and dark themes.</p>
                </div>
                <Button variant="outline" size="icon" onClick={toggleDarkMode}>
                  {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </div>
              <div className="pt-4 border-t">
                <Button variant="outline" className="w-full gap-2 text-muted-foreground" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" /> Log Out
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          {/* Notifications */}
          <Card className="bg-white dark:bg-slate-900 shadow-sm border-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Notification Settings
              </CardTitle>
              <CardDescription>Manage what alerts you receive.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="notif-expenses" className="flex-1 cursor-pointer">New Expenses</Label>
                  <Switch 
                    id="notif-expenses" 
                    checked={notifications.expenses} 
                    onCheckedChange={(v) => setNotifications({...notifications, expenses: v})} 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="notif-chores" className="flex-1 cursor-pointer">Chore Reminders</Label>
                  <Switch 
                    id="notif-chores" 
                    checked={notifications.chores} 
                    onCheckedChange={(v) => setNotifications({...notifications, chores: v})} 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="notif-inventory" className="flex-1 cursor-pointer">Inventory Alerts</Label>
                  <Switch 
                    id="notif-inventory" 
                    checked={notifications.inventory} 
                    onCheckedChange={(v) => setNotifications({...notifications, inventory: v})} 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="notif-announcements" className="flex-1 cursor-pointer">House Announcements</Label>
                  <Switch 
                    id="notif-announcements" 
                    checked={notifications.announcements} 
                    onCheckedChange={(v) => setNotifications({...notifications, announcements: v})} 
                  />
                </div>
              </div>
              <Button variant="secondary" onClick={saveAccountDetails} className="w-full">Update Notifications</Button>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-rose-100 dark:border-rose-900/30 bg-rose-50/30 dark:bg-rose-900/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-rose-600">
                <ShieldAlert className="h-5 w-5" />
                Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-rose-600/80 leading-relaxed">
                Closing your account will permanently delete your profile data and remove you from your current house. This action cannot be undone.
              </p>
              <Button variant="destructive" className="w-full gap-2" onClick={closeAccount}>
                <Trash2 className="h-4 w-4" /> Close Account
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <footer className="pt-12 border-t border-slate-100 dark:border-slate-800 text-center space-y-4">
        <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
          Made with ❤️ in California
        </p>
        <div className="flex justify-center gap-6 text-xs text-muted-foreground">
          <a href="#" className="hover:text-primary transition-colors">Terms & Conditions</a>
          <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
          <span className="opacity-50">© 2026 Rooming Inc. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
