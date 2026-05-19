
import { PremiumCode, UserStatus } from "../types";
import { db, auth, handleFirestoreError, OperationType } from "./firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  serverTimestamp,
  increment,
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

export const getUserStatus = async (userEmail?: string): Promise<UserStatus> => {
  const user = auth.currentUser;
  
  // Se não houver usuário logado, não adianta tentar ler do Firestore (as regras vão negar)
  if (!user) {
    return { plan: 'free', expiryDate: null, narrationsToday: 0 };
  }

  const userId = user.uid;
  const path = `users/${userId}`;

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
    // Retorna valores padrão em caso de erro de conexão ou permissão inicial
    console.warn("Status do usuário indisponível no momento", error);
    return { plan: 'free', expiryDate: null, narrationsToday: 0 };
  }
};

export const redeemCode = async (codeStr: string, userEmail: string): Promise<{ success: boolean; message: string; days?: number }> => {
  const user = auth.currentUser;
  if (!user) return { success: false, message: "Você precisa estar logado." };

  const codePath = `premiumCodes/${codeStr}`;
  const userPath = `users/${user.uid}`;

  try {
    const result = await runTransaction(db, async (transaction) => {
      const codeDoc = await transaction.get(doc(db, codePath));
      if (!codeDoc.exists() || codeDoc.data().isRedeemed) {
        throw new Error("Código inválido ou já utilizado.");
      }

      const userDoc = await transaction.get(doc(db, userPath));
      const userData = userDoc.exists() ? userDoc.data() : { plan: 'free', expiryDate: 0 };
      
      const codeData = codeDoc.data();
      const currentExpiry = (userData.expiryDate && userData.expiryDate > Date.now()) 
        ? userData.expiryDate 
        : Date.now();
      
      const newExpiry = currentExpiry + (codeData.days * 24 * 60 * 60 * 1000);

      transaction.update(doc(db, codePath), {
        isRedeemed: true,
        redeemedAt: Date.now(),
        redeemedBy: userEmail
      });

      transaction.set(doc(db, userPath), {
        ...userData,
        plan: 'premium',
        expiryDate: newExpiry,
        email: userEmail,
        role: userData.role || 'user'
      }, { merge: true });

      return codeData.days;
    });

    return { success: true, message: `Sucesso! ${result} dias de Premium adicionados.`, days: result };
  } catch (error: any) {
    return { success: false, message: error.message || "Erro ao resgatar código." };
  }
};

export const incrementUsage = async (): Promise<number> => {
  const user = auth.currentUser;
  if (!user) return 0;

  const path = `users/${user.uid}`;
  const today = new Date().toDateString();

  try {
    const userDoc = await getDoc(doc(db, path));
    const userData = userDoc.exists() ? userDoc.data() : { narrationsToday: 0, lastUsageDate: '' };
    
    let currentCount = userData.lastUsageDate === today ? (userData.narrationsToday || 0) : 0;
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

export const canGenerateNarration = async (): Promise<{ allowed: boolean; message?: string }> => {
  const status = await getUserStatus();
  
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

export const isSmartPlayerUnlocked = async (): Promise<boolean> => {
  const status = await getUserStatus();
  return status.plan === 'premium';
};
