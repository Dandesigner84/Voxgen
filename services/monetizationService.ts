
import { PremiumCode, UserStatus } from "../types";
import { db, auth, handleFirestoreError, OperationType } from "./firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  runTransaction,
  deleteDoc
} from "firebase/firestore";

const FREE_LIMITS = {
  NARRATIONS_PER_DAY: 3,
};

// --- Admin Logic ---

export const generateCode = async (days: number): Promise<string> => {
  const code = 'VOX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const path = `premiumCodes/${code}`;
  
  try {
    await setDoc(doc(db, 'premiumCodes', code), {
      code,
      days,
      isRedeemed: false,
      createdAt: Date.now()
    });
    return code;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return '';
  }
};

export const getStoredCodes = async (): Promise<PremiumCode[]> => {
  const path = 'premiumCodes';
  try {
    const q = query(collection(db, path));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as PremiumCode);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const deleteCode = async (codeStr: string): Promise<void> => {
  const path = `premiumCodes/${codeStr}`;
  try {
    await deleteDoc(doc(db, 'premiumCodes', codeStr));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

// --- User Logic ---

const resolveUserIdAndEmail = async (userEmail?: string): Promise<{ userId: string | null; email: string }> => {
  const currentAuthUser = auth.currentUser;
  if (currentAuthUser?.uid) {
    return { userId: currentAuthUser.uid, email: currentAuthUser.email || userEmail || '' };
  }

  const targetEmail = userEmail?.trim() || '';
  if (!targetEmail) {
    return { userId: null, email: '' };
  }

  try {
    const q = query(collection(db, 'users'), where('email', '==', targetEmail));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { userId: snap.docs[0].id, email: targetEmail };
    }
  } catch {
    // Fallback to sanitized email identifier
  }

  const sanitized = targetEmail.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
  return { userId: sanitized, email: targetEmail };
};

export const getUserStatus = async (userEmail?: string): Promise<UserStatus> => {
  const { userId } = await resolveUserIdAndEmail(userEmail);
  
  if (!userId) {
    return { plan: 'free', expiryDate: null, narrationsToday: 0 };
  }

  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return { plan: 'free', expiryDate: null, narrationsToday: 0 };
    }
    const data = userDoc.data();
    const today = new Date().toDateString();
    
    const narrationsToday = data.lastUsageDate === today ? (data.narrationsToday || 0) : 0;
    let plan: 'free' | 'premium' = 'free';
    
    if (data.expiryDate && data.expiryDate > Date.now()) {
      plan = 'premium';
    }

    return {
      plan,
      expiryDate: data.expiryDate || null,
      narrationsToday
    };
  } catch (error) {
    console.warn("Status do usuário indisponível no momento", error);
    return { plan: 'free', expiryDate: null, narrationsToday: 0 };
  }
};

export const redeemCode = async (codeStr: string, userEmail?: string): Promise<{ success: boolean; message: string; days?: number }> => {
  const cleanCode = codeStr.trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, message: "Por favor, informe o código do cupom." };
  }

  const { userId, email } = await resolveUserIdAndEmail(userEmail);
  if (!userId) {
    return { success: false, message: "Você precisa estar logado para resgatar um código." };
  }

  const codePath = `premiumCodes/${cleanCode}`;
  const userPath = `users/${userId}`;

  try {
    const result = await runTransaction(db, async (transaction) => {
      const codeDoc = await transaction.get(doc(db, codePath));
      if (!codeDoc.exists()) {
        throw new Error("Código promocional inválido ou não encontrado.");
      }
      
      const codeData = codeDoc.data();
      if (codeData.isRedeemed) {
        throw new Error("Este código promocional já foi utilizado.");
      }

      const userDoc = await transaction.get(doc(db, userPath));
      const userData = userDoc.exists() ? userDoc.data() : { plan: 'free', expiryDate: 0 };
      
      const currentExpiry = (userData.expiryDate && userData.expiryDate > Date.now()) 
        ? userData.expiryDate 
        : Date.now();
      
      const addedDays = codeData.days || 30;
      const newExpiry = currentExpiry + (addedDays * 24 * 60 * 60 * 1000);

      transaction.update(doc(db, codePath), {
        isRedeemed: true,
        redeemedAt: Date.now(),
        redeemedBy: email
      });

      transaction.set(doc(db, userPath), {
        ...userData,
        plan: 'premium',
        expiryDate: newExpiry,
        email: email || userData.email || '',
        role: userData.role || 'user'
      }, { merge: true });

      return addedDays;
    });

    return { success: true, message: `Sucesso! ${result} dias de acesso Premium adicionados.`, days: result };
  } catch (error: any) {
    return { success: false, message: error.message || "Erro ao resgatar código promocional." };
  }
};

export const incrementUsage = async (userEmail?: string): Promise<number> => {
  const { userId } = await resolveUserIdAndEmail(userEmail);
  if (!userId) return 0;

  const path = `users/${userId}`;
  const today = new Date().toDateString();

  try {
    const userDoc = await getDoc(doc(db, path));
    const userData = userDoc.exists() ? userDoc.data() : { narrationsToday: 0, lastUsageDate: '' };
    
    const currentCount = userData.lastUsageDate === today ? (userData.narrationsToday || 0) : 0;
    const newCount = currentCount + 1;

    await setDoc(doc(db, path), {
      narrationsToday: newCount,
      lastUsageDate: today
    }, { merge: true });
    
    return newCount;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return 0;
  }
};

export const canGenerateNarration = async (userEmail?: string): Promise<{ allowed: boolean; message?: string }> => {
  const status = await getUserStatus(userEmail);
  
  if (status.plan === 'premium') {
    return { allowed: true };
  }

  if (status.narrationsToday >= FREE_LIMITS.NARRATIONS_PER_DAY) {
    return { 
      allowed: false, 
      message: `Limite diário do plano Free atingido (${FREE_LIMITS.NARRATIONS_PER_DAY}/${FREE_LIMITS.NARRATIONS_PER_DAY}). Insira um Código Premiado para continuar.` 
    };
  }

  return { allowed: true };
};

export const getFormatExpiryDate = (timestamp?: number | null): string => {
  if (!timestamp) return '---';
  return new Date(timestamp).toLocaleDateString('pt-BR');
};

export const isSmartPlayerUnlocked = async (userEmail?: string): Promise<boolean> => {
  const status = await getUserStatus(userEmail);
  return status.plan === 'premium';
};
