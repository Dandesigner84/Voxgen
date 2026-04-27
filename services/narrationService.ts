
import { db, handleFirestoreError, OperationType } from "./firebase";
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  setDoc, 
  doc, 
  orderBy,
  limit,
  deleteDoc 
} from "firebase/firestore";
import { AudioItem } from "../types";
import { decodeAudioData } from "../utils/audioUtils";

const COLLECTION = 'narrations';

export interface SavedNarration {
  id: string;
  userId: string;
  text: string;
  voice: string;
  audioBase64: string;
  createdAt: number;
  duration: number;
  tone?: string;
}

export const saveNarration = async (userId: string, item: AudioItem, base64: string, tone?: string): Promise<void> => {
  const path = `${COLLECTION}/${item.id}`;
  try {
    const data: SavedNarration = {
      id: item.id,
      userId,
      text: item.text,
      voice: item.voice,
      audioBase64: base64,
      createdAt: item.createdAt.getTime(),
      duration: item.duration,
      tone: tone || 'Neutral'
    };
    await setDoc(doc(db, COLLECTION, item.id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const getUserNarrations = async (userId: string, audioContext: AudioContext): Promise<AudioItem[]> => {
  try {
    const q = query(
        collection(db, COLLECTION), 
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(20)
    );
    const snapshot = await getDocs(q);
    
    const results: AudioItem[] = [];
    for (const d of snapshot.docs) {
        const data = d.data() as SavedNarration;
        try {
            const buffer = await decodeAudioData(data.audioBase64, audioContext);
            results.push({
                id: data.id,
                text: data.text,
                voice: data.voice,
                audioData: buffer,
                createdAt: new Date(data.createdAt),
                duration: data.duration
            });
        } catch (err) {
            console.error("Error decoding persisted audio:", err);
        }
    }
    return results;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, COLLECTION);
    return [];
  }
};

export const deleteNarration = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, COLLECTION, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${COLLECTION}/${id}`);
  }
};
