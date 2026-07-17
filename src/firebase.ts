import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, serverTimestamp, Timestamp, doc, getDoc, setDoc, updateDoc, where, deleteDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);

// Initialize Firestore with the named database from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Auth helper
export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);

export type Pothole = {
  id?: string;
  latitude: number;
  longitude: number;
  reporterId: string;
  reportedAt: Timestamp | any;
  severity: 'low' | 'medium' | 'high';
};

export type UserPrivateData = {
  bloodType?: string;
  emergencyName?: string;
  emergencyPhone?: string;
};

export type FallAlert = {
  id?: string;
  userId: string;
  userName?: string;
  latitude: number;
  longitude: number;
  timestamp: Timestamp | any;
  resolved?: boolean;
};

export type LiveRider = {
  id?: string;
  userId: string;
  userName?: string;
  userPhoto?: string;
  status: 'ready' | 'riding';
  lastSeen: Timestamp | any;
};

export type SafeZone = {
  id?: string;
  latitude: number;
  longitude: number;
  title: string;
  reporterId: string;
  createdAt: Timestamp | any;
};

export type GroupRide = {
  id?: string;
  creatorId: string;
  creatorName?: string;
  title: string;
  active: boolean;
  createdAt: Timestamp | any;
  rideStyle?: 'cruising' | 'fast' | 'chill';
  members: {
    [userId: string]: {
      name: string;
      status: 'out' | 'safe';
      timestamp: any;
    };
  };
};

export type UserPublicProfile = {
  userId: string;
  userName: string;
  userPhoto?: string;
  pacePreference?: 'cruising' | 'balanced' | 'speed';
  skateStyle?: 'street' | 'long-distance' | 'freestyle';
  boardType?: string;
  kudosCount?: number;
};

export type ChatMessage = {
  id?: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  text: string;
  timestamp: Timestamp | any;
};

export type RideRecap = {
  id?: string;
  creatorId: string;
  creatorName?: string;
  distance: number;
  maxSpeed: number;
  duration: number;
  participantIds: string[];
  timestamp: Timestamp | any;
  kudos: number;
};

export type RideStreak = {
  userId: string;
  currentStreak: number;
  lastRideDate: string; // YYYY-MM-DD
  totalRides: number;
};

export type GearExchangeItem = {
  id?: string;
  ownerId: string;
  ownerName: string;
  itemName: string;
  itemType: 'board' | 'helmet' | 'pad' | 'tool' | 'other';
  status: 'available' | 'lent' | 'unavailable';
  borrowerId?: string;
  borrowerName?: string;
  createdAt: Timestamp | any;
};

export { onAuthStateChanged, collection, addDoc, onSnapshot, query, serverTimestamp, doc, getDoc, setDoc, updateDoc, where, deleteDoc };
export type { User };
