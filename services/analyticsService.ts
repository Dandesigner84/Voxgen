
import { db } from './firebase';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  Timestamp,
  serverTimestamp,
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { AnalyticsSession, UserFeedback } from '../types';

const SESSIONS_COLLECTION = 'sessions';
const FEEDBACKS_COLLECTION = 'feedbacks';

export const startSession = async (userId: string): Promise<string> => {
  const date = new Date().toISOString().split('T')[0];
  const sessionData = {
    userId,
    loginAt: Date.now(),
    toolsUsed: {},
    date,
    duration: 0
  };
  
  const docRef = await addDoc(collection(db, SESSIONS_COLLECTION), sessionData);
  return docRef.id;
};

export const updateSessionToolUsage = async (
  sessionId: string, 
  toolName: string, 
  durationIncreaseSeconds: number
) => {
  try {
    const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
    // Note: We'd normally use increment here but for nested objects we'll do a read-modify-write 
    // or just store as flat keys if possible. For simplicity here, flat update.
    const sessionDoc = await getDocs(query(collection(db, SESSIONS_COLLECTION), where("__name__", "==", sessionId)));
    if (!sessionDoc.empty) {
        const data = sessionDoc.docs[0].data();
        const toolsUsed = data.toolsUsed || {};
        toolsUsed[toolName] = (toolsUsed[toolName] || 0) + durationIncreaseSeconds;
        
        await updateDoc(sessionRef, {
            toolsUsed,
            duration: (data.duration || 0) + durationIncreaseSeconds,
            logoutAt: Date.now()
        });
    }
  } catch (e) {
    console.warn("Analytics update failed", e);
  }
};

export const endSession = async (sessionId: string) => {
  const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
  await updateDoc(sessionRef, {
    logoutAt: Date.now()
  });
};

export const submitFeedback = async (feedback: Omit<UserFeedback, 'id' | 'isHighlighted' | 'createdAt'>) => {
  const feedbackData: UserFeedback = {
    ...feedback,
    isHighlighted: false,
    createdAt: Date.now()
  };
  return await addDoc(collection(db, FEEDBACKS_COLLECTION), feedbackData);
};

export const getAllFeedbacks = async (): Promise<UserFeedback[]> => {
  const q = query(collection(db, FEEDBACKS_COLLECTION), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserFeedback));
};

export const toggleFeedbackHighlight = async (feedbackId: string, isHighlighted: boolean) => {
  const feedbackRef = doc(db, FEEDBACKS_COLLECTION, feedbackId);
  await updateDoc(feedbackRef, { isHighlighted });
};

export const getSessionsMetrics = async (days: number = 7): Promise<AnalyticsSession[]> => {
  const q = query(
    collection(db, SESSIONS_COLLECTION), 
    orderBy('loginAt', 'desc'),
    limit(500) // Practical limit
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AnalyticsSession));
};

export const deleteFeedback = async (id: string) => {
  await deleteDoc(doc(db, FEEDBACKS_COLLECTION, id));
};
