
import { 
  collection, 
  getDocs, 
  updateDoc, 
  doc, 
  query, 
  where, 
  orderBy,
  deleteDoc,
  getDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { UserProfile, UserRole } from '../types';

export const listAllUsers = async (): Promise<UserProfile[]> => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ 
      uid: d.id, 
      ...d.data() 
    } as UserProfile));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
    return [];
  }
};

export const updateUserPlan = async (uid: string, plan: 'free' | 'premium', days?: number) => {
  try {
    const userRef = doc(db, 'users', uid);
    const updates: any = { plan };
    
    if (plan === 'premium' && days) {
      updates.expiryDate = Date.now() + (days * 24 * 60 * 60 * 1000);
    } else if (plan === 'free') {
      updates.expiryDate = null;
    }
    
    await updateDoc(userRef, updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
};

export const resetUserUsage = async (uid: string) => {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      narrationsToday: 0
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
};

export const deleteUserAccount = async (uid: string) => {
  try {
    const userRef = doc(db, 'users', uid);
    await deleteDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
  }
};

export const getPlatformStats = async () => {
    try {
        const users = await listAllUsers();
        const premiumUsers = users.filter(u => u.plan === 'premium');
        const totalNarrations = users.reduce((acc, curr) => acc + (curr.narrationsToday || 0), 0);
        
        return {
            totalUsers: users.length,
            premiumUsers: premiumUsers.length,
            totalNarrationsToday: totalNarrations
        };
    } catch (error) {
        console.error("Error fetching platform stats", error);
        return { totalUsers: 0, premiumUsers: 0, totalNarrationsToday: 0 };
    }
};
