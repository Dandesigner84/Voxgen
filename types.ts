
export enum VoiceName {
  Kore = 'Kore',
  Puck = 'Puck',
  Charon = 'Charon',
  Fenrir = 'Fenrir',
  Aoede = 'Aoede',
  // OpenAI Voices
  Alloy = 'Alloy-OI',
  Echo = 'Echo-OI',
  Fable = 'Fable-OI',
  Onyx = 'Onyx-OI',
  Nova = 'Nova-OI',
  Shimmer = 'Shimmer-OI',
}

export enum ToneType {
  Neutral = 'Neutral',
  Excited = 'Excited',
  Professional = 'Professional',
  Soothing = 'Soothing',
  Dramatic = 'Dramatic',
  Romantic = 'Romantic',
  Suspense = 'Suspense',
  Sales = 'Sales (Black Friday)',
  Preaching = 'Preaching',
  Storytelling = 'Storytelling',
  Meditation = 'Meditation',
  Advertising = 'Advertising',
  Motivation = 'Motivation',
  News = 'News',
  Review = 'Review',
}

export enum AppMode {
  Home = 'Home',
  Narration = 'Narration',
  Music = 'Music',
  Avatar = 'Avatar',
  SFX = 'SFX',
  SmartPlayer = 'SmartPlayer',
  Manga = 'Manga',
  Admin = 'Admin',
  VoiceCloning = 'VoiceCloning',
  PDFAudio = 'PDFAudio',
}

export interface AudioItem {
  id: string;
  text: string;
  voice: string;
  audioData: AudioBuffer;
  createdAt: Date;
  duration: number;
}

export interface AvatarItem {
  id: string;
  videoUrl: string;
  narrationId: string;
  createdAt: Date;
}

export interface ProcessingState {
  isEnhancing: boolean;
  isGeneratingAudio: boolean;
  error: string | null;
}

export interface MusicItem {
  id: string;
  title: string;
  lyrics: string;
  style: string;
  coverColor: string;
  audioData: AudioBuffer;
  createdAt: Date;
  duration: number;
  isRemix?: boolean;
}

export interface SFXItem {
  id: string;
  name: string;
  type: string;
  audioData: AudioBuffer;
  createdAt: Date;
}

export interface PremiumCode {
  code: string;
  days: number;
  isRedeemed: boolean;
  createdAt: number;
  redeemedAt?: number;
  redeemedBy?: string;
}

export interface UserStatus {
  plan: 'free' | 'premium';
  expiryDate: number | null;
  narrationsToday: number;
}

export type VoiceCategory = 'private' | 'official_candidate' | 'official_approved' | 'official_rejected';

export interface VoiceAnalysis {
  clarityScore: number;
  dictionScore: number;
  rhythmScore: number;
  feedback: string;
}

export interface CustomVoice {
  id: string;
  userId: string;
  name: string;
  category: VoiceCategory;
  audioSampleBase64: string;
  aiAnalysis?: VoiceAnalysis;
  createdAt: number;
}

export interface ComicPage {
  id: string;
  imageUrl: string;
  text: string;
  dialogue?: string;
  panelLayout: string;
  audioData?: AudioBuffer;
  panelNumber: number;
}

export type ComicStyle = 'Manga' | 'American Comic' | 'Pixar 3D' | 'Anime' | 'Sketch';

export type UserRole = 'user' | 'admin' | 'corporate-admin' | 'corporate-user';

export interface UserProfile {
  uid: string;
  email: string;
  name?: string;
  phoneNumber?: string;
  role: UserRole;
  plan: 'free' | 'premium';
  narrationsToday: number;
  createdAt: number;
  expiryDate?: number | null;
  companyName?: string;
  isProfileComplete?: boolean;
  segment?: string;
  goal?: string;
  referral?: string;
}

export interface UserSession {
  role: UserRole;
  email: string;
  companyName?: string;
  isProfileComplete?: boolean;
}

export interface AnalyticsSession {
  id: string;
  userId: string;
  loginAt: number;
  logoutAt?: number;
  duration?: number;
  toolsUsed: { [toolName: string]: number }; // name to seconds
  date: string; // YYYY-MM-DD
}

export interface UserFeedback {
  id?: string;
  userId: string;
  userName: string;
  userEmail: string;
  rating: number; // 1-5
  comment: string;
  isHighlighted: boolean;
  createdAt: number;
}
