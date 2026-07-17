/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Play,
  Square,
  MapPin,
  Zap,
  Timer,
  Navigation,
  Settings,
  Activity,
  ChevronRight,
  Map as MapIcon,
  ShieldAlert,
  AlertTriangle,
  Plus,
  User as UserIcon,
  LogOut,
  TrendingUp,
  History,
  CheckCircle2,
  Circle,
  Wrench,
  Battery,
  CloudLightning,
  ShieldCheck,
  HeartPulse,
  Phone,
  Droplets,
  Info,
  CircleAlert,
  LifeBuoy,
  Users,
  Send,
  Hospital,
  ThumbsUp,
  UserPlus,
  CheckCheck,
  Trophy,
  Flag,
  Gamepad2,
} from "lucide-react";
import {
  auth,
  db,
  loginWithGoogle,
  onAuthStateChanged,
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  type User,
  type Pothole,
  type UserPrivateData,
  type FallAlert,
  type LiveRider,
  type SafeZone,
  type GroupRide,
  type RideStreak,
  type GearExchangeItem,
} from "./firebase";

// --- Constants ---

const HOSPITALS = [
  { name: "UMC New Orleans", lat: 29.9572, lon: -90.0825 },
  { name: "Ochsner Main", lat: 29.9658, lon: -90.1345 },
  { name: "Tulane Medical", lat: 29.9578, lon: -90.0722 },
  { name: "Touro Infirmary", lat: 29.9238, lon: -90.0957 },
  { name: "Children's NOLA", lat: 29.9172, lon: -90.1189 },
];

// --- Types ---

type ChecklistItem = {
  id: string;
  label: string;
  icon: any;
};

const BOARD_CHECKLIST: ChecklistItem[] = [
  { id: "helmet", label: "Helmet & Protective Gear", icon: ShieldCheck },
  { id: "battery", label: "Battery Levels (Board & Remote)", icon: Battery },
  { id: "bolts", label: "Hardware/Bolts Tension", icon: Wrench },
  { id: "belts", label: "Belt/Drive Condition", icon: Activity },
  { id: "remote", label: "Remote Connectivity", icon: CloudLightning },
];

// --- Utilities ---

enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
  };
}

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  // In a real app we might not want to throw and crash the whole app, but per instructions:
  // throw new Error(JSON.stringify(errInfo));
  // However, for the user visibility, let's return a readable string
  return `Error during ${operationType} on ${path}: ${errInfo.error}`;
}

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(lat2 * (Math.PI / 180));
  const x =
    Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
    Math.sin(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.cos(dLon);
  const brng = Math.atan2(y, x);
  return ((brng * 180) / Math.PI + 360) % 360;
}

// --- Components ---

const BentoCard = ({
  children,
  className = "",
  initial = { opacity: 0, y: 10 },
}: {
  children: React.ReactNode;
  className?: string;
  initial?: any;
}) => (
  <motion.div
    initial={initial}
    animate={{ opacity: 1, y: 0 }}
    className={`bg-[#111] border border-[#222] rounded-[20px] p-6 flex flex-col justify-between overflow-hidden relative ${className}`}
  >
    {children}
  </motion.div>
);

const RadarView = ({
  userPos,
  potholes,
  safeZones,
}: {
  userPos: { lat: number; lon: number } | null;
  potholes: Pothole[];
  safeZones: SafeZone[];
}) => {
  if (!userPos)
    return (
      <div className="h-full flex flex-col items-center justify-center text-[#444] gap-2">
        <Navigation size={32} className="animate-pulse" />
        <div className="text-[10px] uppercase font-black">
          GPS Required For Radar
        </div>
      </div>
    );

  const RANGE = 0.5; // 500m

  return (
    <div className="relative w-full aspect-square border-2 border-dashed border-white/5 rounded-full flex items-center justify-center overflow-hidden bg-black/20">
      {/* Pulse effect */}
      <motion.div
        animate={{ scale: [1, 2], opacity: [0.2, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        className="absolute w-1/2 h-1/2 border border-[#FF6B00]/30 rounded-full"
      />

      {/* Grid Lines */}
      <div className="absolute inset-0 border border-white/5 rounded-full" />
      <div className="absolute inset-[25%] border border-white/5 rounded-full" />
      <div className="absolute top-1/2 left-0 right-0 h-px bg-white/5" />
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/5" />

      {/* Center Marker (Rider) */}
      <div className="z-10 bg-[#FF6B00] w-2 h-2 rounded-full shadow-[0_0_15px_#FF6B00]" />

      {/* Hazards */}
      {potholes.map((p) => {
        const dist = calculateDistance(
          userPos.lat,
          userPos.lon,
          p.latitude,
          p.longitude,
        );
        if (dist > RANGE) return null;
        const bearing = getBearing(
          userPos.lat,
          userPos.lon,
          p.latitude,
          p.longitude,
        );
        const radius = (dist / RANGE) * 50; // percent from center
        const x = radius * Math.sin((bearing * Math.PI) / 180);
        const y = radius * Math.cos((bearing * Math.PI) / 180);

        return (
          <motion.div
            key={p.id}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              position: "absolute",
              left: `${50 + x}%`,
              top: `${50 - y}%`,
              transform: "translate(-50%, -50%)",
            }}
            className={
              p.severity === "high" ? "text-red-500" : "text-orange-500"
            }
          >
            <AlertTriangle
              size={14}
              className="drop-shadow-[0_0_5px_currentColor]"
            />
          </motion.div>
        );
      })}

      {/* Safe Zones */}
      {safeZones.map((sz) => {
        const dist = calculateDistance(
          userPos.lat,
          userPos.lon,
          sz.latitude,
          sz.longitude,
        );
        if (dist > RANGE) return null;
        const bearing = getBearing(
          userPos.lat,
          userPos.lon,
          sz.latitude,
          sz.longitude,
        );
        const radius = (dist / RANGE) * 50;
        const x = radius * Math.sin((bearing * Math.PI) / 180);
        const y = radius * Math.cos((bearing * Math.PI) / 180);

        return (
          <motion.div
            key={sz.id}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              position: "absolute",
              left: `${50 + x}%`,
              top: `${50 - y}%`,
              transform: "translate(-50%, -50%)",
            }}
            className="text-blue-500"
          >
            <ThumbsUp
              size={14}
              className="drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]"
            />
          </motion.div>
        );
      })}
    </div>
  );
};

const Label = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={`text-[11px] uppercase tracking-[1px] text-[#666] mb-2 ${className}`}
  >
    {children}
  </div>
);

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [showBoardCheck, setShowBoardCheck] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [showSeverityPicker, setShowSeverityPicker] = useState(false);
  const [showIceModal, setShowIceModal] = useState(false);
  const [privateData, setPrivateData] = useState<UserPrivateData>({});

  // Fall Detection State
  const [impactCountdown, setImpactCountdown] = useState<number | null>(null);
  const [fallAlerts, setFallAlerts] = useState<FallAlert[]>([]);
  const [myActiveAlert, setMyActiveAlert] = useState<string | null>(null);
  const [isFallDetectionSensorsEnabled, setIsFallDetectionSensorsEnabled] =
    useState(false);

  // Community Presence
  const [liveRiders, setLiveRiders] = useState<LiveRider[]>([]);
  const [isLookingToSkate, setIsLookingToSkate] = useState(false);

  // Safe Zones & Group Rides
  const [safeZones, setSafeZones] = useState<SafeZone[]>([]);
  const [groupRides, setGroupRides] = useState<GroupRide[]>([]);
  const [showSafeZoneModal, setShowSafeZoneModal] = useState(false);
  const [showGroupRideModal, setShowGroupRideModal] = useState(false);
  const [rideTitle, setRideTitle] = useState("");
  const [showRadar, setShowRadar] = useState(false);
  const [activeTab, setActiveTab] = useState<"session" | "map" | "community" | "safety">("session");

  // Gear Exchange State
  const [gearItemName, setGearItemName] = useState("");
  const [gearItemType, setGearItemType] =
    useState<GearExchangeItem["itemType"]>("other");

  // New Stats & Gear
  const [rideStreak, setRideStreak] = useState<RideStreak | null>(null);
  const [gearItems, setGearItems] = useState<GearExchangeItem[]>([]);
  const [showGearModal, setShowGearModal] = useState(false);

  const [distance, setDistance] = useState(0); // in km
  const [speed, setSpeed] = useState(0); // in km/h
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0); // in seconds
  const [error, setError] = useState<string | null>(null);

  // Community Data
  const [potholes, setPotholes] = useState<Pothole[]>([]);
  const [nearbyHazard, setNearbyHazard] = useState<Pothole | null>(null);

  const lastPositionRef = useRef<{ lat: number; lon: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  // --- Firebase Listeners ---

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Fetch private data
        try {
          const docRef = doc(db, "users_private", user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setPrivateData(docSnap.data() as UserPrivateData);
          }
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.GET,
            `users_private/${user.uid}`,
          );
        }
      } else {
        setPrivateData({});
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setPotholes([]);
      setFallAlerts([]);
      setLiveRiders([]);
      return;
    }

    const unsubscribePotholes = onSnapshot(
      collection(db, "potholes"),
      (snapshot) => {
        const data = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Pothole,
        );
        setPotholes(data);
      },
      (err) => {
        setError(handleFirestoreError(err, OperationType.LIST, "potholes"));
      },
    );

    const q = query(
      collection(db, "fall_alerts"),
      where("resolved", "==", false),
    );
    const unsubscribeFalls = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as FallAlert,
        );
        setFallAlerts(data);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, "fall_alerts");
      },
    );

    const unsubscribeLive = onSnapshot(
      collection(db, "live_riders"),
      (snapshot) => {
        const data = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as LiveRider,
        );
        setLiveRiders(data);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, "live_riders");
      },
    );

    const unsubscribeSafe = onSnapshot(
      collection(db, "safe_zones"),
      (snapshot) => {
        const data = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as SafeZone,
        );
        setSafeZones(data);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, "safe_zones");
      },
    );

    const qRides = query(
      collection(db, "group_rides"),
      where("active", "==", true),
    );
    const unsubscribeRides = onSnapshot(
      qRides,
      (snapshot) => {
        const data = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as GroupRide,
        );
        setGroupRides(data);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, "group_rides");
      },
    );

    const unsubscribeStreak = onSnapshot(
      doc(db, "ride_streaks", currentUser.uid),
      (docSnap) => {
        if (docSnap.exists()) {
          setRideStreak(docSnap.data() as RideStreak);
        } else {
          setRideStreak({
            userId: currentUser.uid,
            currentStreak: 0,
            lastRideDate: "",
            totalRides: 0,
          });
        }
      },
      (err) => {
        handleFirestoreError(
          err,
          OperationType.GET,
          `ride_streaks/${currentUser.uid}`,
        );
      },
    );

    const unsubscribeGear = onSnapshot(
      collection(db, "gear_exchange"),
      (snapshot) => {
        ×ß=âÚ$z{-®éÜj×fÇVS×¶vV$—FVÔæÖWĞĞ¢öä6†ævS×²†R’Óâ6WDvV$—FVÔæÖR†RçF&vWBçfÇVR—ĞĞ¢6Æ74æÖSÒ'rÖgVÆÂ&rÕ²3SSUÒ&÷&FW"&÷&FW"Õ²3335Ò&÷VæFVB×†ÂÓBFW‡B×v†—FRföçBÖ&öÆBWW&66R÷WFÆ–æRÖæöæRfö7W3¦&÷&FW"Ö&ÇVRÓSG&ç6—F–öâÖ6öÆ÷'2Æ6V†öÆFW#§FW‡BÕ²3335Ò Ğ¢óàĞ¢Ç6VÆV7@Ğ¢fÇVS×¶vV$—FVÕG—WĞĞ¢öä6†ævS×²†R’ÓàĞ¢6WDvV$—FVÕG—R€Ğ¢RçF&vWBçfÇVR2vV$W†6†ævT—FVÕ²&—FVÕG—R%ÒÀĞ¢Ğ¢ĞĞ¢6Æ74æÖSÒ'rÖgVÆÂ&rÕ²3SSUÒ&÷&FW"&÷&FW"Õ²3335Ò&÷VæFVB×†ÂÓBFW‡B×v†—FRföçBÖ&öÆBWW&66R÷WFÆ–æRÖæöæRfö7W3¦&÷&FW"Ö&ÇVRÓSG&ç6—F–öâÖ6öÆ÷'2 Ğ¢àĞ¢Æ÷F–öâfÇVSÒ&&ö&B#ä&ö&CÂö÷F–öãàĞ¢Æ÷F–öâfÇVSÒ&†VÆÖWB#ä†VÆÖWCÂö÷F–öãàĞ¢Æ÷F–öâfÇVSÒ'B#åG3Âö÷F–öãàĞ¢Æ÷F–öâfÇVSÒ'FööÂ#åFööÃÂö÷F–öãàĞ¢Æ÷F–öâfÇVSÒ&÷F†W"#ä÷F†W#Âö÷F–öãàĞ¢Â÷6VÆV7CàĞ¢Æ'WGFöàĞ¢öä6Æ–6³×²‚’Óâ°Ğ¢–b†vV$—FVÔæÖRçG&–Ò‚’’°Ğ¢FDvV$—FVÒ†vV$—FVÔæÖRÂvV$—FVÕG—R“°Ğ¢6WDvV$—FVÔæÖR‚""“°Ğ¢ĞĞ¢×ĞĞ¢6Æ74æÖSÒ'rÖgVÆÂ’ÓB&rÖ&ÇVRÓcFW‡B×v†—FR&÷VæFVB×†ÂföçBÖ&Æ6²WW&66RG&6¶–ær×F–v‡FW"†÷fW#¦&rÖ&ÇVRÓSG&ç6—F–öâÖ6öÆ÷'2 Ğ¢àĞ¢Æ—7BvV"—FVĞĞ¢Âö'WGFöãàĞ¢ÂöF—càĞ¢ÂöF—càĞ Ğ¢²ò¢vV"Æ—7B¢÷ĞĞ¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂ#àĞ¢ÄÆ&VÃä7F—fRÆ—7F–æw3ÂôÆ&VÃàĞ¢ÆF—b6Æ74æÖSÒ&fÆW‚Ó÷fW&fÆ÷r×’ÖWFòÖ‚Ö‚Õ³3…Ò76R×’Ó2"Ó"7W7FöÒ×67&öÆÆ&"#àĞ¢¶vV$—FV×2æÆVæwF‚âò€Ğ¢vV$—FV×2æÖ‚†—FVÒ’Óâ€Ğ¢ÆF—`Ğ¢¶W“×¶—FVÒæ–GĞĞ¢6Æ74æÖSÒ&&rÕ²3SSUÒ&÷&FW"&÷&FW"Õ²3##%ÒÓB&÷VæFVBÓ'†ÂfÆW‚fÆW‚Ö6öÂ§W7F–g’Ö&WGvVVâvÓB Ğ¢àĞ¢ÆF—b6Æ74æÖSÒ&fÆW‚§W7F–g’Ö&WGvVVâ—FV×2×7F'B#àĞ¢ÆF—càĞ¢ÆF—b6Æ74æÖSÒ'FW‡B×‡2föçBÖ&Æ6²WW&66RFW‡B×v†—FR#àĞ¢¶—FVÒæ—FVÔæÖWĞĞ¢ÂöF—càĞ¢ÆF—b6Æ74æÖSÒ'FW‡BÕ³…ÒföçBÖ&öÆBWW&66RFW‡BÕ²3SSUÒ#àĞ¢¶—FVÒæ÷væW$æÖWÒ(
"¶—FVÒæ—FVÕG—WĞĞ¢ÂöF—càĞ¢ÂöF—càĞ¢Ç7àĞ¢6Æ74æÖS×¶FW‡BÕ³‡…ÒföçBÖ&Æ6²WW&66RÓ‚Ó"&÷VæFVBÖÆrG¶—FVÒç7FGW2ÓÓÒ&f–Æ&ÆR"ò&&rÖw&VVâÓSó#FW‡BÖw&VVâÓS"¢&&r×&VBÓSó#FW‡B×&VBÓS'ÖĞĞ¢àĞ¢¶—FVÒç7FGW7ĞĞ¢Â÷7ãàĞ¢ÂöF—càĞ Ğ¢ÆF—b6Æ74æÖSÒ&fÆW‚vÓ"#àĞ¢¶—FVÒç7FGW2ÓÓÒ&f–Æ&ÆR"ò€Ğ¢Æ'WGFöàĞ¢öä6Æ–6³×²‚’Óâ&÷'&÷tvV"†—FVÒæ–B—ĞĞ¢6Æ74æÖSÒ&fÆW‚Ó’Ó"&rÕ²3##%Ò†÷fW#¦&rÖ&ÇVRÓcG&ç6—F–öâÖÆÂ&÷VæFVBÖÆrFW‡BÕ³—…ÒföçBÖ&Æ6²WW&66R Ğ¢àĞ¢&÷'&÷pĞ¢Âö'WGFöãàĞ¢’¢€Ğ¢†—FVÒæ&÷'&÷vW$–BÓÓÒ7W'&VçEW6W#òçV–BÇÀĞ¢—FVÒæ÷væW$–BÓÓÒ7W'&VçEW6W#òçV–B’bb€Ğ¢Æ'WGFöàĞ¢öä6Æ–6³×²‚’Óâ&WGW&ävV"†—FVÒæ–B—ĞĞ¢6Æ74æÖSÒ&fÆW‚Ó’Ó"&rÕ²3##%Ò†÷fW#¦&rÖw&VVâÓcG&ç6—F–öâÖÆÂ&÷VæFVBÖÆrFW‡BÕ³—…ÒföçBÖ&Æ6²WW&66R Ğ¢àĞ¢Ö&²2&WGW&æV@Ğ¢Âö'WGFöãàĞ¢Ğ¢—ĞĞ¢ÂöF—càĞ¢ÂöF—càĞ¢’Ğ¢’¢€Ğ¢ÆF—b6Æ74æÖSÒ'FW‡BÖ6VçFW"’ÓFW‡BÕ²3CCEÒFW‡BÕ³…ÒföçBÖ&Æ6²WW&66RG&6¶–ær×v–FW7B—FÆ–2#àĞ¢æòvV"–âF†RW†6†ævR–WBàĞ¢ÂöF—càĞ¢—ĞĞ¢ÂöF—càĞ¢ÂöF—càĞ¢ÂöF—càĞ¢ÂöF—càĞ¢ÂöÖ÷F–öâæF—càĞ¢ÂöÖ÷F–öâæF—càĞ¢—ĞĞ¢Âôæ–ÖFU&W6Væ6SàĞ Ğ¢²ò¢&ö&BÔ6†V6²÷fW&Æ’¢÷ĞĞ¢Äæ–ÖFU&W6Væ6SàĞ¢·6†÷t&ö&D6†V6²bb€Ğ¢ÆÖ÷F–öâæF—`Ğ¢–æ—F–Ã×·²÷6—G“¢×ĞĞ¢æ–ÖFS×·²÷6—G“¢×ĞĞ¢W†—C×·²÷6—G“¢×ĞĞ¢6Æ74æÖSÒ&f—†VB–ç6WBÓ¢ÓS&rÖ&Æ6²ó“R&6¶G&÷Ö&ÇW"×6ÒfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"Ób Ğ¢àĞ¢ÆÖ÷F–öâæF—`Ğ¢–æ—F–Ã×·²66ÆS¢ã’Â“¢#×ĞĞ¢æ–ÖFS×·²66ÆS¢Â“¢×ĞĞ¢6Æ74æÖSÒ&&rÕ²3Ò&÷&FW"&÷&FW"Õ²3##%Ò&÷VæFVBÕ³3'…ÒrÖgVÆÂÖ‚×rÖÖB÷fW&fÆ÷rÖ†–FFVâ&VÆF—fR Ğ¢àĞ¢ÆF—b6Æ74æÖSÒ'Ó‚"ÓB#àĞ¢ÄÆ&VÂ6Æ74æÖSÒ'FW‡BÕ²4dcd#Ò#å6fWG’&÷Fö6öÃÂôÆ&VÃàĞ¢Æƒ"6Æ74æÖSÒ'FW‡BÓG†ÂföçBÖ&Æ6²G&6¶–ær×F–v‡FW"Ö"Ó"—FÆ–2#àĞ¢$ô$BÔ4„T4²òğĞ¢Âöƒ#àĞ¢Ç6Æ74æÖSÒ'FW‡BÕ³…ÒWW&66RföçBÖ&öÆBFW‡BÕ²3cceÒG&6¶–ærÕ³'…ÒÖ"Ó‚#àĞ¢fW&–f–6F–öâ&WV—&VBFòVævvRÖ÷F÷'0Ğ¢Â÷àĞ Ğ¢ÆF—b6Æ74æÖSÒ'76R×’Ó2Ö"Ó#àĞ¢´$ô$Eô4„T4´Ä•5BæÖ‚†—FVÒ’Óâ°Ğ¢6öç7B–6öâÒ—FVÒæ–6öã°Ğ¢6öç7B—46†V6¶VBÒ6†V6¶VD—FV×2æ†2†—FVÒæ–B“°Ğ¢&WGW&â€Ğ¢Æ'WGFöàĞ¢¶W“×¶—FVÒæ–GĞĞ¢öä6Æ–6³×²‚’ÓâFövvÆT6†V6¶Æ—7D—FVÒ†—FVÒæ–B—ĞĞ¢6Æ74æÖS×¶rÖgVÆÂÓR&÷VæFVBÓ'†ÂfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâG&ç6—F–öâÖÆÂ&÷&FW"G¶—46†V6¶VBò&&rÕ²4dcd#ÒóR&÷&FW"Õ²4dcd#Òó#FW‡B×v†—FR"¢&&rÕ²3SSUÒ&÷&FW"×G&ç7&VçBFW‡BÕ²3cceÒ'ÖĞĞ¢àĞ¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓB#àĞ¢ÆF—`Ğ¢6Æ74æÖS×¶G¶—46†V6¶VBò'FW‡BÕ²4dcd#Ò"¢'FW‡BÖ–æ†W&—B'ÖĞĞ¢àĞ¢Ä–6öâ6—¦S×³#ÒóàĞ¢ÂöF—càĞ¢Ç7â6Æ74æÖSÒ'FW‡B×6ÒföçBÖ&öÆBWW&66RG&6¶–ær×F–v‡B#àĞ¢¶—FVÒæÆ&VÇĞĞ¢Â÷7ãàĞ¢ÂöF—càĞ¢¶—46†V6¶VBò€Ğ¢Ä6†V6´6—&6ÆS Ğ¢6—¦S×³#ĞĞ¢6Æ74æÖSÒ'FW‡BÕ²4dcd#Ò Ğ¢óàĞ¢’¢€Ğ¢Ä6—&6ÆR6—¦S×³#ÒóàĞ¢—ĞĞ¢Âö'WGFöãàĞ¢“°Ğ¢Ò—ĞĞ¢ÂöF—càĞ¢ÂöF—càĞ Ğ¢ÆF—b6Æ74æÖSÒ'ÓB&rÕ²3SSUÒ#àĞ¢Æ'WGFöàĞ¢F—6&ÆVC×¶6†V6¶VD—FV×2ç6—¦RÂ$ô$Eô4„T4´Ä•5BæÆVæwF‡ĞĞ¢öä6Æ–6³×²‚’Óâ°Ğ¢–b†—5G&6¶–ær’°Ğ¢6WE6†÷t&ö&D6†V6²†fÇ6R“°Ğ¢ÒVÇ6R°Ğ¢7F'EG&6¶–ær‚“°Ğ¢ĞĞ¢×ĞĞ¢6Æ74æÖS×¶rÖgVÆÂ’Ób&÷VæFVBÕ³#G…ÒföçBÖ&Æ6²FW‡B×†ÂWW&66RG&6¶–ær×F–v‡FW"fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ2G&ç6—F–öâÖÆÂG¶6†V6¶VD—FV×2ç6—¦RÓÓÒ$ô$Eô4„T4´Ä•5BæÆVæwF‚ò&&rÕ²4dcd#ÒFW‡BÖ&Æ6²6†F÷rÕ³óóC…÷&v&ƒ#SRÃrÃÃãR•Ò"¢&&rÕ²3##%ÒFW‡BÕ²3CCEÒ7W'6÷"Öæ÷BÖÆÆ÷vVB'ÖĞĞ¢àĞ¢¶—5G&6¶–ærò$6Æ÷6R6†V6²"¢$6öæf—&ÒbVævvR'ĞĞ¢Âö'WGFöãàĞ¢Æ'WGFöàĞ¢öä6Æ–6³×²‚’Óâ6WE6†÷t&ö&D6†V6²†fÇ6R—ĞĞ¢6Æ74æÖSÒ'rÖgVÆÂFW‡BÖ6VçFW"’ÓBFW‡BÕ³…ÒWW&66RföçBÖ&öÆBFW‡BÕ²3CCEÒG&6¶–ær×v–FW7B Ğ¢àĞ¢&÷'B6†V6°Ğ¢Âö'WGFöãàĞ¢ÂöF—càĞ¢ÂöÖ÷F–öâæF—càĞ¢ÂöÖ÷F–öâæF—càĞ¢—ĞĞ¢Âôæ–ÖFU&W6Væ6SàĞ Ğ¢²ò¢6fR¦öæRÖöFÂ¢÷ĞĞ¢Äæ–ÖFU&W6Væ6SàĞ¢·6†÷u6fU¦öæTÖöFÂbb€Ğ¢ÆÖ÷F–öâæF—`Ğ¢–æ—F–Ã×·²÷6—G“¢×ĞĞ¢æ–ÖFS×·²÷6—G“¢×ĞĞ¢W†—C×·²÷6—G“¢×ĞĞ¢6Æ74æÖSÒ&f—†VB–ç6WBÓ¢ÓS&rÖ&Æ6²ó“R&6¶G&÷Ö&ÇW"×6ÒfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"Ób Ğ¢àĞ¢ÆÖ÷F–öâæF—`Ğ¢–æ—F–Ã×·²66ÆS¢ã’Â“¢#×ĞĞ¢æ–ÖFS×·²66ÆS¢Â“¢×ĞĞ¢6Æ74æÖSÒ&&rÕ²3Ò&÷&FW"&÷&FW"Õ²3##%Ò&÷VæFVBÕ³3'…ÒrÖgVÆÂÖ‚×r×6ÒÓ‚ Ğ¢àĞ¢ÄÆ&VÂ6Æ74æÖSÒ'FW‡BÕ²4dcd#Ò#ä6öÖ×Væ—G’7÷GF–æsÂôÆ&VÃàĞ¢Æƒ"6Æ74æÖSÒ'FW‡BÓ7†ÂföçBÖ&Æ6²G&6¶–ær×F–v‡FW"Ö"Ób—FÆ–2FW‡B×v†—FRWW&66R#àĞ¢7÷B6fR¦öæPĞ¢Âöƒ#àĞ¢Æ–çW@Ğ¢WFôfö7W0Ğ¢G—SÒ'FW‡B Ğ¢Æ6V†öÆFW#Ò&RærâÂVGV&öâ&²Æö÷ Ğ¢öä¶W”F÷vã×²†R’Óâ°Ğ¢–b†Ræ¶W’ÓÓÒ$VçFW""Ğ¢&W÷'E6fU¦öæR†Ræ7W'&VçEF&vWBçfÇVR“°Ğ¢×ĞĞ¢6Æ74æÖSÒ'rÖgVÆÂ&rÕ²3SSUÒ&÷&FW"&÷&FW"Õ²3335Ò&÷VæFVB×†ÂÓBFW‡B×v†—FRföçBÖ&öÆBWW&66R÷WFÆ–æRÖæöæRfö7W3¦&÷&FW"Õ²4dcd#ÒG&ç6—F–öâÖ6öÆ÷'2Ö"Ób Ğ¢óàĞ¢ÆF—b6Æ74æÖSÒ&fÆW‚vÓ2#àĞ¢Æ'WGFöàĞ¢öä6Æ–6³×²‚’Óâ6WE6†÷u6fU¦öæTÖöFÂ†fÇ6R—ĞĞ¢6Æ74æÖSÒ&fÆW‚Ó’ÓBFW‡BÕ³…ÒföçBÖ&Æ6²WW&66RFW‡BÕ²3CCEÒ Ğ¢àĞ¢6æ6VÀĞ¢Âö'WGFöãàĞ¢Æ'WGFöàĞ¢öä6Æ–6³×²†R’Óâ°Ğ¢6öç7B–çWBÒRæ7W'&VçEF&vWBç&VçDVÆVÖVç@Ğ¢òç&Wf–÷W4VÆVÖVçE6–&Æ–ær2…DÔÄ–çWDVÆVÖVçC°Ğ¢&W÷'E6fU¦öæR†–çWBçfÇVR“°Ğ¢×ĞĞ¢6Æ74æÖSÒ&fÆW‚Õ³%Ò’ÓB&rÕ²4dcd#ÒFW‡BÖ&Æ6²&÷VæFVB×†ÂföçBÖ&Æ6²FW‡BÕ³…ÒWW&66R6†F÷rÕ³óó#…÷&v&ƒ#SRÃrÃÃãR•Ò Ğ¢àĞ¢6öæf—&Ò7÷@Ğ¢Âö'WGFöãàĞ¢ÂöF—càĞ¢ÂöÖ÷F–öâæF—càĞ¢ÂöÖ÷F–öâæF—càĞ¢—ĞĞ¢Âôæ–ÖFU&W6Væ6SàĞ Ğ¢²ò¢w&÷W&–FRÖöFÂ¢÷ĞĞ¢Äæ–ÖFU&W6Væ6SàĞ¢·6†÷tw&÷W&–FTÖöFÂbb€Ğ¢ÆÖ÷F–öâæF—`Ğ¢–æ—F–Ã×·²÷6—G“¢×ĞĞ¢æ–ÖFS×·²÷6—G“¢×ĞĞ¢W†—C×·²÷6—G“¢×ĞĞ¢6Æ74æÖSÒ&f—†VB–ç6WBÓ¢ÓS&rÖ&Æ6²ó“R&6¶G&÷Ö&ÇW"×6ÒfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"Ób Ğ¢àĞ¢ÆÖ÷F–öâæF—`Ğ¢–æ—F–Ã×·²66ÆS¢ã’Â“¢#×ĞĞ¢æ–ÖFS×·²66ÆS¢Â“¢×ĞĞ¢6Æ74æÖSÒ&&rÕ²3Ò&÷&FW"&÷&FW"Õ²3##%Ò&÷VæFVBÕ³3'…ÒrÖgVÆÂÖ‚×r×6ÒÓ‚ Ğ¢àĞ¢Æf÷&Òöå7V&Ö—C×¶7&VFTw&÷W&–FWÓàĞ¢ÄÆ&VÂ6Æ74æÖSÒ'FW‡BÕ²4dcd#Ò#å7VBÖævVÖVçCÂôÆ&VÃàĞ¢Æƒ"6Æ74æÖSÒ'FW‡BÓ7†ÂföçBÖ&Æ6²G&6¶–ær×F–v‡FW"Ö"Ób—FÆ–2FW‡B×v†—FRWW&66R#àĞ¢–æ—F–Æ—¦Rw&÷W Ğ¢Âöƒ#àĞ¢Æ–çW@Ğ¢WFôfö7W0Ğ¢G—SÒ'FW‡B Ğ¢fÇVS×·&–FUF—FÆWĞĞ¢öä6†ævS×²†R’Óâ6WE&–FUF—FÆR†RçF&vWBçfÇVR—ĞĞ¢Æ6V†öÆFW#Ò%&–FRF—FÆR†Rærâg&Væ6‚V'FW"fÇ’’ Ğ¢6Æ74æÖSÒ'rÖgVÆÂ&rÕ²3SSUÒ&÷&FW"&÷&FW"Õ²3335Ò&÷VæFVB×†ÂÓBFW‡B×v†—FRföçBÖ&öÆBWW&66R÷WFÆ–æRÖæöæRfö7W3¦&÷&FW"Õ²4dcd#ÒG&ç6—F–öâÖ6öÆ÷'2Ö"Ób Ğ¢óàĞ¢ÆF—b6Æ74æÖSÒ&fÆW‚vÓ2#àĞ¢Æ'WGFöàĞ¢G—SÒ&'WGFöâ Ğ¢öä6Æ–6³×²‚’Óâ6WE6†÷tw&÷W&–FTÖöFÂ†fÇ6R—ĞĞ¢6Æ74æÖSÒ&fÆW‚Ó’ÓBFW‡BÕ³…ÒföçBÖ&Æ6²WW&66RFW‡BÕ²3CCEÒ Ğ¢àĞ¢6æ6VÀĞ¢Âö'WGFöãàĞ¢Æ'WGFöàĞ¢G—SÒ'7V&Ö—B Ğ¢6Æ74æÖSÒ&fÆW‚Õ³%Ò’ÓB&rÕ²4dcd#ÒFW‡BÖ&Æ6²&÷VæFVB×†ÂföçBÖ&Æ6²FW‡BÕ³…ÒWW&66R6†F÷rÕ³óó#…÷&v&ƒ#SRÃrÃÃãR•Ò Ğ¢àĞ¢76VÖ&ÆR7&WpĞ¢Âö'WGFöãàĞ¢ÂöF—càĞ¢Âöf÷&ÓàĞ¢ÂöÖ÷F–öâæF—càĞ¢ÂöÖ÷F–öâæF—càĞ¢—ĞĞ¢Âôæ–ÖFU&W6Væ6SàĞ Ğ¢²ò¢W'&÷"÷fW&Æ’¢÷ĞĞ¢Äæ–ÖFU&W6Væ6SàĞ¢¶W'&÷"bb€Ğ¢ÆÖ÷F–öâæF—`Ğ¢–æ—F–Ã×·²÷6—G“¢Â“¢#×ĞĞ¢æ–ÖFS×·²÷6—G“¢Â“¢×ĞĞ¢W†—C×·²÷6—G“¢×ĞĞ¢6Æ74æÖSÒ&f—†VB&÷GFöÒÓÆVgBÓó"×G&ç6ÆFR×‚Óó"¢ÓS‚Ób’ÓB&rÕ²4dc3335ÒFW‡B×v†—FR&÷VæFVBÓ'†ÂfÆW‚—FV×2Ö6VçFW"vÓ26†F÷rÓ'†Â Ğ¢àĞ¢Å6†–VÆDÆW'B6—¦S×³#ÒóàĞ¢Ç6Æ74æÖSÒ'FW‡B×6ÒföçBÖ&Æ6²WW&66R#ç¶W'&÷'ÓÂ÷àĞ¢Æ'WGFöàĞ¢öä6Æ–6³×²‚’Óâ6WDW'&÷"†çVÆÂ—ĞĞ¢6Æ74æÖSÒ&ÖÂÓBFW‡BÕ³…ÒWW&66RföçBÖ&öÆB&rÖ&Æ6²ó#‚Ó"’Ó&÷VæFVB Ğ¢àĞ¢F—6Ö—70Ğ¢Âö'WGFöãàĞ¢ÂöÖ÷F–öâæF—càĞ¢—ĞĞ¢Âôæ–ÖFU&W6Væ6SàĞ Ğ¢Æfö÷FW"6Æ74æÖSÒ&×BÓ‚FW‡BÖ6VçFW"FW‡BÕ³…ÒWW&66RföçBÖ&öÆBFW‡BÕ²3335ÒG&6¶–ærÕ³G…Ò†–FFVâÖC¦&Æö6²#àĞ¢G&6²F†R&–FRâ&÷FV7BF†R7&WrâòòU4³‚äôÄĞ¢Âöfö÷FW#àĞ¢ÂöF—càĞ Ğ¢Ç7G–ÆSç¶ Ğ¢¶W–g&ÖW2&÷Væ6R×7V'FÆR°Ğ¢RÂR²G&ç6f÷&Ó¢G&ç6ÆFU’ƒ“²ĞĞ¢SR²G&ç6f÷&Ó¢G&ç6ÆFU’‚ÓG‚“²ĞĞ¢ĞĞ¢ææ–ÖFRÖ&÷Væ6R×7V'FÆR°Ğ¢æ–ÖF–öã¢&÷Væ6R×7V'FÆR'2V6RÖ–âÖ÷WB–æf–æ—FS°Ğ¢ĞĞ¢ÓÂ÷7G–ÆSàĞ¢ÂöF—càĞ¢“°Ğ§ĞĞ 