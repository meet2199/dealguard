export type DealStatus =
  | "Lead"
  | "Negotiating"
  | "Confirmed"
  | "Content Due"
  | "Submitted"
  | "Published"
  | "Payment Pending"
  | "Paid"
  | "Completed";

export type PaymentStatus = "Pending" | "Partially Paid" | "Paid" | "Overdue";

export type Deal = {
  id: string;
  brandId?: string;
  brand: string;
  campaign: string;
  value: number;
  currency: string;
  status: DealStatus;
  platform: string;
  dueDate: string;
  paymentDue: string;
  paymentStatus: PaymentStatus;
  rightsEnd: string;
  rightsType: string;
  deliverable: string;
  email?: string;
  notes?: string;
  createdAt?: string;
};

export type NewDealInput = Omit<Deal, "id" | "paymentStatus" | "rightsType" | "createdAt"> & {
  paymentTerms: string;
  rightsType?: string;
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
};


export type NotificationPreferences = {
  emailEnabled: boolean;
  paymentDueDays: number[];
  paymentOverdueDays: number[];
  rightsExpiryDays: number[];
  deliverableDueDays: number[];
};

export type ReminderSummary = {
  pendingCount: number;
  failedCount: number;
  nextReminderAt?: string;
};
