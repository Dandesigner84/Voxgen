
import { CustomVoice, VoiceCategory } from "../types";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  setDoc, 
  doc, 
  updateDoc, 
  deleteDoc 
} from "firebase/firestore";

const COLLECTION = 'customVoices';

export const getCustomVoices = async (): Promise<CustomVoice[]> => {
  try {
    // Only fetch official approved voices by default if no user is specified
    // to avoid listing private voices of other users which triggers permission errors
    const q = query(
      collection(db, COLLECTION), 
      where("category", "==", "official_approved")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CustomVoice));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, COLLECTION);
    return [];
  }
};

export const getVoicesByUser = async (userId: string): Promise<CustomVoice[]> => {
  try {
    const q = query(collection(db, COLLECTION), where("userId", "==", userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CustomVoice));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, COLLECTION);
    return [];
  }
};

export const getApprovedVoices = async (): Promise<CustomVoice[]> => {
  try {
    const q = query(collection(db, COLLECTION), where("category", "==", "official_approved" as VoiceCategory));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CustomVoice));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, COLLECTION);
    return [];
  }
};

export const getAllOfficialVoices = async (): Promise<CustomVoice[]> => {
  try {
    // Querying both approved and candidates might be needed for admin, 
    // but for general users we should only get approved.
    const q = query(
      collection(db, COLLECTION), 
      where("category", "in", ["official_approved", "official_candidate"])
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CustomVoice));
  } catch (error) {
    console.warn("Error fetching official voices:", error);
    // Fallback to just approved if "in" query fails or has no access
    return getApprovedVoices();
  }
};

export const saveCustomVoice = async (voice: CustomVoice): Promise<void> => {
  const path = `${COLLECTION}/${voice.id}`;
  try {
    await setDoc(doc(db, COLLECTION, voice.id), voice);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const updateVoiceStatus = async (voiceId: string, status: VoiceCategory, feedback?: string): Promise<void> => {
  const path = `${COLLECTION}/${voiceId}`;
  try {
    const updateData: any = { category: status };
    if (feedback) {
        updateData['aiAnalysis.feedback'] = feedback;
    }
    await updateDoc(doc(db, COLLECTION, voiceId), updateData);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const deleteCustomVoice = async (voiceId: string): Promise<void> => {
  const path = `${COLLECTION}/${voiceId}`;
  try {
    await deleteDoc(doc(db, COLLECTION, voiceId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};
