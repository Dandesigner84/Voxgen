
import { db, handleFirestoreError, OperationType } from "./firebase";
import { 
  setDoc, 
  doc, 
  getDoc,
  collection,
  getDocs,
  query,
  where,
  deleteDoc
} from "firebase/firestore";

export interface CorporateTrack {
  id: string;
  type: 'file' | 'youtube' | 'spotify';
  name: string;
  src: string;
  thumbnail?: string;
}

export interface CorporateAccount {
  email: string;
  password: string;
  name: string;
  createdAt: number;
}

const COLLECTION = 'corporateContent';

export const saveCorporatePlaylist = async (companyId: string, tracks: CorporateTrack[]): Promise<void> => {
  const path = `${COLLECTION}/${companyId}`;
  try {
    await setDoc(doc(db, COLLECTION, companyId), { tracks }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const getCorporatePlaylist = async (companyId: string): Promise<CorporateTrack[]> => {
  const path = `${COLLECTION}/${companyId}`;
  try {
    const docSnap = await getDoc(doc(db, COLLECTION, companyId));
    if (docSnap.exists()) {
      return docSnap.data().tracks || [];
    }
    return [];
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
};

export const setCorporateVignetteStatus = async (companyId: string, enabled: boolean): Promise<void> => {
  const path = `${COLLECTION}/${companyId}`;
  try {
    await setDoc(doc(db, COLLECTION, companyId), { vignetteEnabled: enabled }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const isCorporateVignetteEnabled = async (companyId: string): Promise<boolean> => {
  const path = `${COLLECTION}/${companyId}`;
  try {
    const docSnap = await getDoc(doc(db, COLLECTION, companyId));
    if (docSnap.exists()) {
      return docSnap.data().vignetteEnabled !== false;
    }
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return true;
  }
};

// --- Team Management (Employees) ---
// These are stored in the 'users' collection with a 'company' field

export const getCorporateAccounts = async (companyId: string): Promise<CorporateAccount[]> => {
  try {
    const q = query(collection(db, 'users'), where("companyName", "==", companyId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      email: doc.data().email,
      name: doc.data().name || '',
      password: '', // Password is not stored in Firestore, handled by Firebase Auth
      createdAt: doc.data().createdAt || 0
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
    return [];
  }
};

export const removeCorporateAccount = async (email: string): Promise<void> => {
  // Finding user by email is harder without UID. Usually we'd use UID.
  // In Firebase Auth we delete the user, and then the doc.
  // This is a placeholder for actual cross-service logic.
};
