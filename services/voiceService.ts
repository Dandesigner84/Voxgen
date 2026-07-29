
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
    const q = query(collection(db, COLLECTION));
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
  const voices = await getCustomVoices();
  return voices.filter(v => v.category.startsWith('official'));
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
