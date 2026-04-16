export interface House {
  id: string;
  name: string;
  inviteCode: string;
  rentSplitType: 'equal' | 'custom';
  settings: {
    rules: string;
    quietHours: string;
    guestPolicy: string;
  };
  createdAt: any;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  houseId?: string;
  role: 'admin' | 'member';
  rentPercentage?: number;
  chorePreferences: string[];
  phoneNumber?: string;
  timezone?: string;
  defaultCurrency?: string;
  joinedAt?: any;
  notificationSettings?: {
    expenses: boolean;
    chores: boolean;
    inventory: boolean;
    announcements: boolean;
  };
}

export interface ExpenseSplit {
  userId: string;
  amount: number;
  percentage?: number;
  shares?: number;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  currency: string;
  category: 'rent' | 'groceries' | 'utilities' | 'entertainment' | 'other';
  description: string;
  paidBy: string;
  splitType: 'equal' | 'amount' | 'percentage' | 'shares';
  splits: ExpenseSplit[];
  date: any;
  houseId: string;
  isRecurring: boolean;
  recurringInterval?: 'monthly' | 'weekly' | 'custom';
  customIntervalDays?: number;
  receiptImage?: string;
}

export interface ChoreHistory {
  completedBy: string;
  completedAt: any;
  wasOnBehalfOf?: string;
  status: 'completed' | 'skipped' | 'vacation';
  note?: string;
}

export interface Chore {
  id: string;
  name: string;
  description: string;
  assignedTo: string; // Current person responsible
  dueDate: any;
  startDate: any;
  completed: boolean;
  houseId: string;
  frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'custom' | 'rotation' | 'completion-based';
  customIntervalDays?: number;
  rotationOrder: string[]; // Array of UIDs
  history: ChoreHistory[];
  lastCompletedAt?: any;
}

export interface ShoppingItem {
  id: string;
  name: string;
  houseId: string;
  addedBy: string;
  assignedTo: string; // Current person responsible for buying
  rotationOrder: string[]; // Array of UIDs for rotation
  status: 'In Stock' | 'Low' | 'Out';
  isBought: boolean;
  price?: number;
  boughtBy?: string;
  boughtAt?: any;
}

export interface Responsibility {
  id: string;
  title: string;
  description?: string;
  assignedTo: string; // UID of responsible person
  amount: number;
  currency: string;
  frequency: 'monthly' | 'weekly' | 'custom';
  dayOfMonth?: number; // 1-31
  dueDate: any;
  houseId: string;
  status: 'pending' | 'confirmed' | 'skipped';
  lastExpenseId?: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  authorId: string;
  createdAt: any;
  houseId: string;
  isPinned: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startDate: any;
  endDate?: any;
  startTime?: string;
  endTime?: string;
  houseId: string;
  authorId: string;
  completed?: boolean;
}

export interface HouseActivity {
  id: string;
  type: string;
  description: string;
  timestamp: any;
  houseId: string;
  userId: string;
}

export interface FairnessScore {
  userId: string;
  score: number;
  insight: string;
}

/** In-app notification document in `notifications` collection */
export interface HouseNotification {
  id: string;
  userId: string;
  message: string;
  /** Firestore Timestamp or client Date */
  timestamp: unknown;
  read?: boolean;
  type?: 'chore_assignment' | 'announcement' | 'rules' | 'expense' | string;
  houseId?: string;
  title?: string;
  /** Dashboard tab id to open, e.g. `expenses` or `announcements` */
  link?: string;
  choreId?: string;
}
