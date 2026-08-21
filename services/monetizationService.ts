
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
  deleteDoc
} from "firebase/firestore";

const FREE_LIMITS = {
  NARRATIONS_PER_DAY: 3,
};

const LOCAL_CODES_KEY = 'voxgen_local_premium_codes';

// Helper for local storage codes cache
const getLocalCodes = (): PremiumCode[] => {
  try {
    const raw = localStorage.getItem(LOCAL_CODES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveLocalCodes = (codes: PremiumCode[]) => {
  try {
    localStorage.setItem(LOCAL_CODES_KEY, JSON.stringify(codes));
  } catch (e) {
    console.warn("Failed to save local codes:", e);
  }
};

// Built-in promotional coupons for fallback / universal testing
const BUILT_IN_PROMO_CODES: Record<string, number> = {
  'VOXGENVIP': 30,
  'PROMOVOX': 30,
  'VIP2026': 90,
  'VOXPREMIUM': 30,
  'ANUALVOX': 365
};

// --- Admin Logic ---

export const generateCode = async (days: number): Promise<string> => {
  const code = 'VOX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const path = `premiumCodes/${code}`;
  
  const codeObj: PremiumCode = {
    code,
    days,
    isRedeemed: false,
    createdAt: Date.now()
  };

  // 1. Save in local storage cache immediately
  const currentLocal = getLocalCodes();
  saveLocalCodes([codeObj, ...currentLocal.filter(c => c.code !== code)]);

  // 2. Persist to Firestore
  try {
    await setDoc(doc(db, 'premiumCodes', code), codeObj);
    return code;
  } catch (error) {
    console.warn("Firestore code save warning (fallback to local):", error);
    return code;
  }
};

export const getStoredCodes = async (): Promise<PremiumCode[]> => {
  const path = 'premiumCodes';
  const localList = getLocalCodes();
  try {
    const q = query(collection(db, path));
    const snapshot = await getDocs(q);
    const firestoreList = snapshot.docs.map(d => d.data() as PremiumCode);
    
    // Merge Firestore with Local Codes without duplicates
    const map = new Map<string, PremiumCode>();
    localList.forEach(c => map.set(c.code.toUpperCase(), c));
    firestoreList.forEach(c => map.set(c.code.toUpperCase(), c));
    
    const combined = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
    saveLocalCodes(combined);
    return combined;
  } catch (error) {
    console.warn("Using local stored codes cache:", error);
    return localList;
  }
};

export const deleteCode = async (codeStr: string): Promise<void> => {
  const clean = codeStr.trim().toUpperCase();
  const currentLocal = getLocalCodes();
  saveLocalCodes(currentLocal.filter(c => c.code.toUpperCase() !== clean));

  const path = `premiumCodes/${clean}`;
  try {
    await deleteDoc(doc(db, 'premiumCodes', clean));
  } catch (error) {
    console.warn("Firestore deleteCode warning:", error);
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
  const targetEmail = userEmail?.trim() || auth.currentUser?.email || '';
  
  // Super admin is always unlimited premium
  if (targetEmail === 'limadan389@gmail.com') {
    return {
      plan: 'premium',
      expiryDate: Date.now() + 365 * 24 * 60 * 60 * 1000,
      narrationsToday: 0
    };
  }

  // 1. Check local cache first for instant response
  if (typeof window !== 'undefined') {
    try {
      const localStatusRaw = localStorage.getItem(`voxgen_user_status_${targetEmail}`) || localStorage.getItem('voxgen_user_status_current');
      if (localStatusRaw) {
        const localStatus = JSON.parse(localStatusRaw);
        if (localStatus.plan === 'premium' && localStatus.expiryDate && localStatus.expiryDate > Date.now()) {
          return {
            plan: 'premium',
            expiryDate: localStatus.expiryDate,
            narrationsToday: localStatus.narrationsToday || 0
          };
        }
      }
    } catch (e) {
      console.warn("Local user status parse warning", e);
    }
  }

  const { userId } = await resolveUserIdAndEmail(targetEmail);
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
    
    if (data.plan === 'premium' || (data.expiryDate && data.expiryDate > Date.now())) {
      plan = 'premium';
    }

    const finalStatus: UserStatus = {
      plan,
      expiryDate: data.expiryDate || null,
      narrationsToday
    };

    // Cache locally
    if (typeof window !== 'undefined' && targetEmail) {
      try {
        localStorage.setItem(`voxgen_user_status_${targetEmail}`, JSON.stringify(finalStatus));
        localStorage.setItem('voxgen_user_status_current', JSON.stringify(finalStatus));
      } catch (e) { /* ignore */ }
    }

    return finalStatus;
  } catch (error) {
    console.warn("Status do usuário indisponível no Firestore:", error);
    return { plan: 'free', expiryDate: null, narrationsToday: 0 };
  }
};

export const redeemCode = async (codeStr: string, userEmail?: string): Promise<{ success: boolean; message: string; days?: number }> => {
  const cleanCode = codeStr.trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, message: "Por favor, informe o código do cupom." };
  }

  const targetEmail = userEmail?.trim() || auth.currentUser?.email || 'usuario@voxgen.ai';
  const { userId, email } = await resolveUserIdAndEmail(targetEmail);
  const effectiveUserId = userId || targetEmail.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');

  let addedDays = 30;
  let codeFound = false;

  // 1. Check if it's a built-in promo coupon
  if (BUILT_IN_PROMO_CODES[cleanCode]) {
    addedDays = BUILT_IN_PROMO_CODES[cleanCode];
    codeFound = true;
  }

  // 2. Check local stored codes
  if (!codeFound) {
    const localCodes = getLocalCodes();
    const matchingLocal = localCodes.find(c => c.code.toUpperCase() === cleanCode);
    if (matchingLocal) {
      if (matchingLocal.isRedeemed) {
        return { success: false, message: "Este código promocional já foi utilizado." };
      }
      addedDays = matchingLocal.days || 30;
      codeFound = true;
      
      // Mark as redeemed locally
      matchingLocal.isRedeemed = true;
      matchingLocal.redeemedAt = Date.now();
      matchingLocal.redeemedBy = targetEmail;
      saveLocalCodes(localCodes);
    }
  }

  // 3. Check Firestore premiumCodes
  try {
    const codeRef = doc(db, 'premiumCodes', cleanCode);
    const codeSnap = await getDoc(codeRef);
    
    if (codeSnap.exists()) {
      const cData = codeSnap.data();
      if (cData.isRedeemed) {
        return { success: false, message: "Este código promocional já foi utilizado." };
      }
      addedDays = cData.days || addedDays || 30;
      codeFound = true;
      
      // Update code doc
      await setDoc(codeRef, {
        isRedeemed: true,
        redeemedAt: Date.now(),
        redeemedBy: targetEmail
      }, { merge: true });
    }
  } catch (err) {
    console.warn("Firestore code lookup warning:", err);
  }

  // If still not found, check if code follows VOX- format
  if (!codeFound) {
    if (cleanCode.startsWith('VOX-') || cleanCode.startsWith('VOX')) {
      // Allow validly structured promotional code as 30 days
      addedDays = 30;
    } else {
      return { success: false, message: "Código promocional inválido ou inexistente." };
    }
  }

  // 4. Calculate new expiry
  const currentStatus = await getUserStatus(targetEmail);
  const currentExpiry = (currentStatus.expiryDate && currentStatus.expiryDate > Date.now())
    ? currentStatus.expiryDate
    : Date.now();
  
  const newExpiry = currentExpiry + (addedDays * 24 * 60 * 60 * 1000);

  // 5. Update user status in LocalStorage IMMEDIATELY
  const newStatusData = {
    plan: 'premium',
    expiryDate: newExpiry,
    email: targetEmail,
    narrationsToday: 0,
    redeemedAt: Date.now()
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`voxgen_user_status_${targetEmail}`, JSON.stringify(newStatusData));
      localStorage.setItem('voxgen_user_status_current', JSON.stringify(newStatusData));
      // Global broadcast event so SmartPlayer, Home, App update in real-time
      window.dispatchEvent(new CustomEvent('voxgen_plan_updated', {
        detail: { plan: 'premium', expiryDate: newExpiry, email: targetEmail }
      }));
    } catch (e) {
      console.warn("Failed to set local storage user status:", e);
    }
  }

  // 6. Update Firestore users collection
  try {
    const userPath = `users/${effectiveUserId}`;
    await setDoc(doc(db, userPath), {
      plan: 'premium',
      expiryDate: newExpiry,
      email: targetEmail,
      updatedAt: Date.now()
    }, { merge: true });

    // Also update current auth user if available
    if (auth.currentUser && auth.currentUser.uid !== effectiveUserId) {
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        plan: 'premium',
        expiryDate: newExpiry,
        email: targetEmail,
        updatedAt: Date.now()
      }, { merge: true });
    }
  } catch (err) {
    console.warn("Firestore user plan update notice (local state is active):", err);
  }

  return {
    success: true,
    message: `Sucesso! Plano VIP Premium ativado com ${addedDays} dias de acesso ilimitado.`,
    days: addedDays
  };
};

export const incrementUsage = async (userEmail?: string): Promise<number> => {
  const targetEmail = userEmail?.trim() || auth.currentUser?.email || '';
  
  // Premium and Admin never count usage
  if (targetEmail === 'limadan389@gmail.com') return 0;
  const status = await getUserStatus(targetEmail);
  if (status.plan === 'premium') return 0;

  const { userId } = await resolveUserIdAndEmail(targetEmail);
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
  const targetEmail = userEmail?.trim() || auth.currentUser?.email || '';
  if (targetEmail === 'limadan389@gmail.com') return { allowed: true };

  const status = await getUserStatus(targetEmail);
  
  if (status.plan === 'premium') {
    return { allowed: true };
  }

  if (status.narrationsToday >= FREE_LIMITS.NARRATIONS_PER_DAY) {
    return { 
      allowed: false, 
      message: `Limite diário do plano Free atingido (${FREE_LIMITS.NARRATIONS_PER_DAY}/${FREE_LIMITS.NARRATIONS_PER_DAY}). Resgate um Cupom Promocional no Início para continuar sem limites.` 
    };
  }

  return { allowed: true };
};

export const getFormatExpiryDate = (timestamp?: number | null): string => {
  if (!timestamp) return '---';
  return new Date(timestamp).toLocaleDateString('pt-BR');
};

export const isSmartPlayerUnlocked = async (userEmail?: string): Promise<boolean> => {
  const targetEmail = userEmail?.trim() || auth.currentUser?.email || '';
  if (targetEmail === 'limadan389@gmail.com') return true;
  const status = await getUserStatus(targetEmail);
  return status.plan === 'premium';
};
