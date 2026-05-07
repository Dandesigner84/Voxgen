
import { db, handleFirestoreError, OperationType } from './firebase';
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
  
  try {
    const docRef = await addDoc(collection(db, SESSIONS_COLLECTION), sessionData);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, SESSIONS_COLLECTION);
    return "";
  }
};

export const updateSessionToolUsage = async (
  sessionId: string, 
  toolName: string, 
  durationIncreaseSeconds: number
) => {
  try {
    const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
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
    handleFirestoreError(e, OperationType.UPDATE, `${SESSIONS_COLLECTION}/${sessionId}`);
  }
};

export const endSession = async (sessionId: string) => {
  try {
    const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
    await updateDoc(sessionRef, {
      logoutAt: Date.now()
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `${SESSIONS_COLLECTION}/${sessionId}`);
  }
};

export const submitFeedback = async (feedback: Omit<UserFeedback, 'id' | 'isHighlighted' | 'createdAt'>) => {
  const feedbackData: UserFeedback = {
    ...feedback,
    isHighlighted: false,
    createdAt: Date.now()
  };
  try {
    return await addDoc(collection(db, FEEDBACKS_COLLECTION), feedbackData);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, FEEDBACKS_COLLECTION);
  }
};

export const getAllFeedbacks = async (): Promise<UserFeedback[]> => {
  try {
    const q = query(collection(db, FEEDBACKS_COLLECTION), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserFeedback));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, FEEDBACKS_COLLECTION);
    return [];
  }
};

export const toggleFeedbackHighlight = async (feedbackId: string, isHighlighted: boolean) => {
  try {
    const feedbackRef = doc(db, FEEDBACKS_COLLECTION, feedbackId);
    await updateDoc(feedbackRef, { isHighlighted });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${FEEDBACKS_COLLECTION}/${feedbackId}`);
  }
};

export const getSessionsMetrics = async (days: number = 7): Promise<AnalyticsSession[]> => {
  try {
    const q = query(
      collection(db, SESSIONS_COLLECTION), 
      orderBy('loginAt', 'desc'),
      limit(500) // Practical limit
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AnalyticsSession));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, SESSIONS_COLLECTION);
    return [];
  }
};

export const deleteFeedback = async (id: string) => {
  try {
    await deleteDoc(doc(db, FEEDBACKS_COLLECTION, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${FEEDBACKS_COLLECTION}/${id}`);
  }
};
