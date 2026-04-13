import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '@/src/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore';
import { House, UserProfile, Expense, Chore, ShoppingItem, HouseActivity, Announcement, CalendarEvent, Responsibility } from '@/src/types';

interface HouseContextType {
  user: User | null;
  profile: UserProfile | null;
  house: House | null;
  members: UserProfile[];
  expenses: Expense[];
  chores: Chore[];
  shoppingList: ShoppingItem[];
  responsibilities: Responsibility[];
  activities: HouseActivity[];
  announcements: Announcement[];
  calendarEvents: CalendarEvent[];
  notifications: any[];
  loading: boolean;
  isAuthReady: boolean;
  getUserName: (uid: string) => string;
}

const HouseContext = createContext<HouseContextType | undefined>(undefined);

export function HouseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [house, setHouse] = useState<House | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [chores, setChores] = useState<Chore[]>([]);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([]);
  const [activities, setActivities] = useState<HouseActivity[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const getUserName = (uid: string) => {
    if (!uid) return 'Roommate';
    const member = members.find(m => m.uid === uid);
    if (member?.displayName) return member.displayName;
    if (uid === user?.uid && profile?.displayName) return profile.displayName;
    return 'Roommate';
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (!u) {
        setProfile(null);
        setHouse(null);
        setLoading(false);
      }
    });
    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!user || !isAuthReady) return;

    const unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const profileData = { ...docSnap.data(), uid: docSnap.id } as UserProfile;
        setProfile(profileData);
        
        if (profileData.houseId) {
          // Fetch house
          const unsubHouse = onSnapshot(doc(db, 'houses', profileData.houseId), (hSnap) => {
            if (hSnap.exists()) {
              setHouse({ id: hSnap.id, ...hSnap.data() } as House);
            }
          }, (err) => handleFirestoreError(err, OperationType.GET, `houses/${profileData.houseId}`));

          // Fetch members
          const unsubMembers = onSnapshot(query(collection(db, 'users'), where('houseId', '==', profileData.houseId)), (mSnap) => {
            const sortedMembers = mSnap.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile));
            sortedMembers.sort((a, b) => {
              // Admin first
              if (a.role === 'admin' && b.role !== 'admin') return -1;
              if (a.role !== 'admin' && b.role === 'admin') return 1;
              
              // Then by joinedAt
              const timeA = a.joinedAt?.toDate ? a.joinedAt.toDate().getTime() : 0;
              const timeB = b.joinedAt?.toDate ? b.joinedAt.toDate().getTime() : 0;
              return timeA - timeB;
            });
            setMembers(sortedMembers);
          }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

          // Fetch expenses
          const unsubExpenses = onSnapshot(query(collection(db, 'expenses'), where('houseId', '==', profileData.houseId)), (eSnap) => {
            const data = eSnap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));
            // Sort in memory
            data.sort((a, b) => {
              const dateA = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date as any).getTime();
              const dateB = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date as any).getTime();
              return dateB - dateA;
            });
            setExpenses(data);
          }, (err) => handleFirestoreError(err, OperationType.LIST, 'expenses'));

          // Fetch chores
          const unsubChores = onSnapshot(query(collection(db, 'chores'), where('houseId', '==', profileData.houseId)), (cSnap) => {
            setChores(cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Chore)));
          }, (err) => handleFirestoreError(err, OperationType.LIST, 'chores'));

          // Fetch shopping list
          const unsubShopping = onSnapshot(query(collection(db, 'shoppingList'), where('houseId', '==', profileData.houseId)), (sSnap) => {
            setShoppingList(sSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShoppingItem)));
          }, (err) => handleFirestoreError(err, OperationType.LIST, 'shoppingList'));

          // Fetch responsibilities
          const unsubResponsibilities = onSnapshot(query(collection(db, 'responsibilities'), where('houseId', '==', profileData.houseId)), (rSnap) => {
            setResponsibilities(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as Responsibility)));
          }, (err) => handleFirestoreError(err, OperationType.LIST, 'responsibilities'));

          // Fetch activities
          const unsubActivities = onSnapshot(query(collection(db, 'activities'), where('houseId', '==', profileData.houseId)), (aSnap) => {
            const data = aSnap.docs.map(d => ({ id: d.id, ...d.data() } as HouseActivity));
            // Sort in memory
            data.sort((a, b) => {
              const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
              const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
              return timeB - timeA;
            });
            setActivities(data);
          }, (err) => handleFirestoreError(err, OperationType.LIST, 'activities'));

          // Fetch announcements
          const unsubAnnouncements = onSnapshot(query(collection(db, 'announcements'), where('houseId', '==', profileData.houseId)), (annSnap) => {
            const data = annSnap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
            // Sort in memory
            data.sort((a, b) => {
              const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
              const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
              return timeB - timeA;
            });
            setAnnouncements(data);
          }, (err) => handleFirestoreError(err, OperationType.LIST, 'announcements'));

          // Fetch calendar events
          const unsubEvents = onSnapshot(query(collection(db, 'calendarEvents'), where('houseId', '==', profileData.houseId)), (evSnap) => {
            setCalendarEvents(evSnap.docs.map(d => ({ id: d.id, ...d.data() } as CalendarEvent)));
          }, (err) => handleFirestoreError(err, OperationType.LIST, 'calendarEvents'));

          // Fetch notifications
          const unsubNotifications = onSnapshot(query(collection(db, 'notifications'), where('userId', '==', user.uid)), (nSnap) => {
            const data = nSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            data.sort((a: any, b: any) => {
              const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
              const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
              return timeB - timeA;
            });
            setNotifications(data);
          }, (err) => handleFirestoreError(err, OperationType.LIST, 'notifications'));

          return () => {
            unsubHouse();
            unsubMembers();
            unsubExpenses();
            unsubChores();
            unsubShopping();
            unsubResponsibilities();
            unsubActivities();
            unsubAnnouncements();
            unsubEvents();
            unsubNotifications();
          };
        } else {
          setHouse(null);
          setLoading(false);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`));

    return unsubscribeProfile;
  }, [user, isAuthReady]);

  useEffect(() => {
    if (isAuthReady) {
      setLoading(false);
    }
  }, [isAuthReady, profile, house]);

  return (
    <HouseContext.Provider value={{ 
      user, profile, house, members, expenses, chores, shoppingList, responsibilities, activities, 
      announcements, calendarEvents, notifications, loading, isAuthReady, getUserName 
    }}>
      {children}
    </HouseContext.Provider>
  );
}

export function useHouse() {
  const context = useContext(HouseContext);
  if (context === undefined) {
    throw new Error('useHouse must be used within a HouseProvider');
  }
  return context;
}
