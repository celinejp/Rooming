import { useState, useEffect, useMemo } from 'react';
import { useHouse } from '@/src/contexts/HouseContext';
import { auth, signOut } from '@/src/firebase';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, addDays, addWeeks, addMonths, isSameDay, subDays, eachDayOfInterval } from 'date-fns';
import { 
  LayoutDashboard, 
  Receipt, 
  CheckSquare, 
  Package, 
  ShoppingCart, 
  Calendar as CalendarIcon, 
  Settings,
  LogOut,
  Home,
  Menu,
  X,
  Megaphone,
  Users2,
  Moon,
  Sun
} from 'lucide-react';
import OverviewTab from './tabs/OverviewTab';
import ExpensesTab from './tabs/ExpensesTab';
import ChoresTab from './tabs/ChoresTab';
import ShoppingTab from './tabs/ShoppingTab';
import CalendarTab from './tabs/CalendarTab';
import SettingsTab from './tabs/SettingsTab';
import AnnouncementsTab from './tabs/AnnouncementsTab';
import ParticipantsTab from './tabs/ParticipantsTab';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import NotificationsCenter from './NotificationsCenter';

export default function Dashboard() {
  const { house, profile, announcements } = useHouse();
  const [activeTab, setActiveTab] = useState('overview');
  const [activeSubTab, setActiveSubTab] = useState<string | undefined>(undefined);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const last10Days = useMemo(() => {
    const end = new Date();
    const start = subDays(end, 9);
    return eachDayOfInterval({ start, end });
  }, []);

  const [lastViewedAnnouncements, setLastViewedAnnouncements] = useState<Date>(() => {
    const saved = localStorage.getItem('lastViewedAnnouncements');
    return saved ? new Date(saved) : new Date(0);
  });

  useEffect(() => {
    if (activeTab === 'announcements') {
      const now = new Date();
      setLastViewedAnnouncements(now);
      localStorage.setItem('lastViewedAnnouncements', now.toISOString());
    }
  }, [activeTab]);

  const unreadAnnouncementsCount = useMemo(() => {
    return announcements.filter(ann => {
      const createdAt = ann.createdAt?.toDate ? ann.createdAt.toDate() : new Date(ann.createdAt);
      return createdAt > lastViewedAnnouncements;
    }).length;
  }, [announcements, lastViewedAnnouncements]);

  const handleNavigate = (tabPath: string) => {
    const [tab, sub] = tabPath.split(':');
    setActiveTab(tab);
    setActiveSubTab(sub);
  };
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const savedMode = localStorage.getItem('darkMode') === 'true';
    setIsDarkMode(savedMode);
    if (savedMode) {
      document.documentElement.classList.add('dark');
    }
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

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, component: OverviewTab },
    { id: 'announcements', label: 'Announcements', icon: Megaphone, component: AnnouncementsTab },
    { id: 'expenses', label: 'Expenses', icon: Receipt, component: ExpensesTab },
    { id: 'chores', label: 'Chores', icon: CheckSquare, component: ChoresTab },
    { id: 'participants', label: 'Participants', icon: Users2, component: ParticipantsTab },
    { id: 'shopping', label: 'Shopping', icon: ShoppingCart, component: ShoppingTab },
    { id: 'calendar', label: 'Calendar', icon: CalendarIcon, component: CalendarTab },
    { id: 'settings', label: 'Settings', icon: Settings, component: SettingsTab },
  ];

  const handleLogout = () => signOut(auth);

  const SidebarContent = () => (
    <div className="flex flex-col h-full py-6 px-4">
      <div className="flex items-start justify-between gap-2 px-2 mb-8">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-primary rounded-xl p-2 shrink-0">
            <Home className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-xl tracking-tight truncate">{house?.name}</h1>
            <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
              Code: {house?.inviteCode}
            </p>
          </div>
        </div>
        <NotificationsCenter onNavigate={handleNavigate} />
      </div>

      <nav className="flex-1 space-y-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              handleNavigate(tab.id);
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.id 
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' 
                : 'text-muted-foreground hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-3">
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </div>
            {tab.id === 'announcements' && unreadAnnouncementsCount > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {unreadAnnouncementsCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto pt-6 border-t space-y-4">
        <div className="flex items-center gap-3 px-2">
          <Avatar className="h-10 w-10 border-2 border-slate-100">
            <AvatarImage src={profile?.photoURL} />
            <AvatarFallback>{profile?.displayName?.[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{profile?.displayName}</p>
            <p className="text-xs text-muted-foreground truncate capitalize">{profile?.role}</p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleDarkMode}
            className="h-8 w-8 text-muted-foreground"
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  const ActiveComponent = tabs.find(t => t.id === activeTab)?.component || OverviewTab;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-72 bg-white border-r sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden bg-white border-b px-4 py-3 flex items-center justify-between gap-2 sticky top-0 z-50">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="bg-primary rounded-lg p-1.5 shrink-0">
              <Home className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold truncate">{house?.name}</span>
          </div>
          <NotificationsCenter onNavigate={handleNavigate} />
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger nativeButton={true} render={<Button variant="ghost" size="icon" />}>
              <Menu className="h-6 w-6" />
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <SidebarContent />
            </SheetContent>
          </Sheet>
        </header>

        <div className="p-4 lg:p-8 max-w-7xl mx-auto w-full">
          <ActiveComponent onNavigate={handleNavigate} activeSubTab={activeSubTab} />
        </div>
      </main>
    </div>
  );
}
