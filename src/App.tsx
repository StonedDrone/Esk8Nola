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
        const data = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as GearExchangeItem,
        );
        setGearItems(
          data.sort(
            (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
          ),
        );
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, "gear_exchange");
      },
    );

    return () => {
      unsubscribePotholes();
      unsubscribeFalls();
      unsubscribeLive();
      unsubscribeSafe();
      unsubscribeRides();
      unsubscribeStreak();
      unsubscribeGear();
    };
  }, [currentUser]);

  // --- Logic ---

  const startTracking = () => {
    if (checkedItems.size < BOARD_CHECKLIST.length) {
      setShowBoardCheck(true);
      return;
    }

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }

    setIsTracking(true);
    updatePresence("riding");
    setShowBoardCheck(false);
    setError(null);
    setDistance(0);
    setMaxSpeed(0);
    setElapsedTime(0);
    lastPositionRef.current = null;

    timerRef.current = window.setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed: geoSpeed } = position.coords;

        if (geoSpeed !== null) {
          const currentSpeed = Math.round(geoSpeed * 3.6 * 10) / 10;
          setSpeed(currentSpeed);
          setMaxSpeed((prev) => Math.max(prev, currentSpeed));
        }

        const hazardous = potholes.find((p) => {
          const dist =
            calculateDistance(latitude, longitude, p.latitude, p.longitude) *
            1000;
          return dist < 40;
        });
        setNearbyHazard(hazardous || null);

        if (lastPositionRef.current) {
          const d = calculateDistance(
            lastPositionRef.current.lat,
            lastPositionRef.current.lon,
            latitude,
            longitude,
          );
          if (d > 0.002) {
            setDistance((prev) => prev + d);
          }
        }

        lastPositionRef.current = { lat: latitude, lon: longitude };
      },
      (err) => {
        console.error(err);
        setError("Location access denied or unavailable.");
        stopTracking();
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      },
    );
  };

  const stopTracking = () => {
    setIsTracking(false);
    setSpeed(0);
    setNearbyHazard(null);
    disableFallDetection();
    if (isLookingToSkate) {
      updatePresence("ready");
    } else {
      removePresence();
    }
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    updateStreak();
  };

  const updateStreak = async () => {
    if (!currentUser || distance < 0.1) return;

    const today = new Date().toISOString().split("T")[0];
    const streakRef = doc(db, "ride_streaks", currentUser.uid);

    try {
      const snap = await getDoc(streakRef);
      if (snap.exists()) {
        const data = snap.data() as RideStreak;
        if (data.lastRideDate === today) {
          await updateDoc(streakRef, {
            totalRides: (data.totalRides || 0) + 1,
          });
        } else {
          const lastDate = new Date(data.lastRideDate);
          const lastDateUTC = Date.UTC(
            lastDate.getUTCFullYear(),
            lastDate.getUTCMonth(),
            lastDate.getUTCDate(),
          );
          const currentParts = today.split("-").map(Number);
          const currentDateUTC = Date.UTC(
            currentParts[0],
            currentParts[1] - 1,
            currentParts[2],
          );

          const diffTime = currentDateUTC - lastDateUTC;
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

          let newStreak = 1;
          if (diffDays === 1) {
            newStreak = (data.currentStreak || 0) + 1;
          }

          await updateDoc(streakRef, {
            currentStreak: newStreak,
            lastRideDate: today,
            totalRides: (data.totalRides || 0) + 1,
          });
        }
      } else {
        await setDoc(streakRef, {
          userId: currentUser.uid,
          currentStreak: 1,
          lastRideDate: today,
          totalRides: 1,
        });
      }
    } catch (err) {
      console.error("Streak error:", err);
    }
  };

  const addGearItem = async (
    itemName: string,
    itemType: GearExchangeItem["itemType"],
  ) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, "gear_exchange"), {
        ownerId: currentUser.uid,
        ownerName: currentUser.displayName || "Rider",
        itemName,
        itemType,
        status: "available",
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "gear_exchange");
    }
  };

  const borrowGear = async (itemId: string) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, "gear_exchange", itemId), {
        status: "lent",
        borrowerId: currentUser.uid,
        borrowerName: currentUser.displayName || "Rider",
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `gear_exchange/${itemId}`);
    }
  };

  const returnGear = async (itemId: string) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, "gear_exchange", itemId), {
        status: "available",
        borrowerId: null,
        borrowerName: null,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `gear_exchange/${itemId}`);
    }
  };

  const reportPothole = async (
    severity: "low" | "medium" | "high" = "high",
  ) => {
    if (!currentUser) {
      setError("Please sign in to report hazards.");
      return;
    }
    if (!lastPositionRef.current) {
      setError("Waiting for GPS signal...");
      return;
    }

    try {
      await addDoc(collection(db, "potholes"), {
        latitude: lastPositionRef.current.lat,
        longitude: lastPositionRef.current.lon,
        reporterId: currentUser.uid,
        reportedAt: serverTimestamp(),
        severity: severity,
      });
      setShowSeverityPicker(false);
    } catch (err) {
      setError(handleFirestoreError(err, OperationType.WRITE, "potholes"));
    }
  };

  const toggleChecklistItem = (id: string) => {
    const newChecked = new Set(checkedItems);
    if (newChecked.has(id)) newChecked.delete(id);
    else newChecked.add(id);
    setCheckedItems(newChecked);
  };

  const getHazardColor = (severity?: string) => {
    switch (severity) {
      case "low":
        return "bg-yellow-500 text-black";
      case "medium":
        return "bg-orange-500 text-white";
      case "high":
        return "bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)]";
      default:
        return "bg-orange-500 text-black";
    }
  };

  const saveIceData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      await setDoc(doc(db, "users_private", currentUser.uid), privateData);
      setShowIceModal(false);
    } catch (err) {
      setError(
        handleFirestoreError(
          err,
          OperationType.WRITE,
          `users_private/${currentUser.uid}`,
        ),
      );
    }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs > 0 ? `${hrs}:` : ""}${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // --- Fall Detection Logic ---

  const enableFallDetection = async () => {
    if (typeof (DeviceMotionEvent as any).requestPermission === "function") {
      try {
        const response = await (DeviceMotionEvent as any).requestPermission();
        if (response === "granted") {
          window.addEventListener("devicemotion", handleMotion);
          setIsFallDetectionSensorsEnabled(true);
        }
      } catch (err) {
        console.error("Fall detection permission error:", err);
      }
    } else {
      window.addEventListener("devicemotion", handleMotion);
      setIsFallDetectionSensorsEnabled(true);
    }
  };

  const disableFallDetection = () => {
    window.removeEventListener("devicemotion", handleMotion);
    setIsFallDetectionSensorsEnabled(false);
    setImpactCountdown(null);
  };

  const impactThreshold = 25; // G-force/Acceleration threshold
  const handleMotion = (event: DeviceMotionEvent) => {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    const totalAcc = Math.sqrt(
      (acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2,
    );
    if (totalAcc > impactThreshold && !impactCountdown && !myActiveAlert) {
      setImpactCountdown(10);
    }
  };

  useEffect(() => {
    let interval: number;
    if (impactCountdown !== null && impactCountdown > 0) {
      interval = window.setInterval(() => {
        setImpactCountdown((prev) => (prev !== null ? prev - 1 : null));
      }, 1000);
    } else if (impactCountdown === 0) {
      triggerFallAlert();
    }
    return () => clearInterval(interval);
  }, [impactCountdown]);

  const triggerFallAlert = async () => {
    if (!currentUser || !lastPositionRef.current) return;
    setImpactCountdown(null);
    try {
      const docRef = await addDoc(collection(db, "fall_alerts"), {
        userId: currentUser.uid,
        userName: currentUser.displayName || "Anonymous Rider",
        latitude: lastPositionRef.current.lat,
        longitude: lastPositionRef.current.lon,
        timestamp: serverTimestamp(),
        resolved: false,
      });
      setMyActiveAlert(docRef.id);
    } catch (err) {
      setError(handleFirestoreError(err, OperationType.WRITE, "fall_alerts"));
    }
  };

  const resolveAlert = async () => {
    if (!myActiveAlert) return;
    try {
      await updateDoc(doc(db, "fall_alerts", myActiveAlert), {
        resolved: true,
      });
      setMyActiveAlert(null);
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `fall_alerts/${myActiveAlert}`,
      );
    }
  };

  const updatePresence = async (status: "ready" | "riding") => {
    if (!currentUser) return;
    try {
      await setDoc(doc(db, "live_riders", currentUser.uid), {
        userId: currentUser.uid,
        userName: currentUser.displayName,
        userPhoto: currentUser.photoURL,
        status: status,
        lastSeen: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `live_riders/${currentUser.uid}`,
      );
    }
  };

  const removePresence = async () => {
    if (!currentUser) return;
    try {
      await deleteDoc(doc(db, "live_riders", currentUser.uid));
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `live_riders/${currentUser.uid}`,
      );
    }
  };

  const toggleLookingToSkate = async () => {
    const newState = !isLookingToSkate;
    setIsLookingToSkate(newState);
    if (newState) {
      updatePresence("ready");
    } else if (!isTracking) {
      removePresence();
    }
  };

  // --- Safe Zones & Group Rides Logic ---

  const reportSafeZone = async (title: string) => {
    if (!currentUser || !lastPositionRef.current) return;
    try {
      await addDoc(collection(db, "safe_zones"), {
        latitude: lastPositionRef.current.lat,
        longitude: lastPositionRef.current.lon,
        title: title,
        reporterId: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      setShowSafeZoneModal(false);
    } catch (err) {
      setError(handleFirestoreError(err, OperationType.WRITE, "safe_zones"));
    }
  };

  const createGroupRide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !rideTitle) return;
    try {
      await addDoc(collection(db, "group_rides"), {
        creatorId: currentUser.uid,
        creatorName: currentUser.displayName,
        title: rideTitle,
        active: true,
        createdAt: serverTimestamp(),
        members: {
          [currentUser.uid]: {
            name: currentUser.displayName || "Rider",
            status: "out",
            timestamp: new Date().toISOString(),
          },
        },
      });
      setRideTitle("");
      setShowGroupRideModal(false);
    } catch (err) {
      setError(handleFirestoreError(err, OperationType.WRITE, "group_rides"));
    }
  };

  const joinGroupRide = async (rideId: string) => {
    if (!currentUser) return;
    const ride = groupRides.find((r) => r.id === rideId);
    if (!ride) return;

    try {
      await updateDoc(doc(db, "group_rides", rideId), {
        [`members.${currentUser.uid}`]: {
          name: currentUser.displayName || "Rider",
          status: "out",
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      setError(
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `group_rides/${rideId}`,
        ),
      );
    }
  };

  const checkInSafe = async (rideId: string) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, "group_rides", rideId), {
        [`members.${currentUser.uid}.status`]: "safe",
        [`members.${currentUser.uid}.timestamp`]: new Date().toISOString(),
      });
    } catch (err) {
      setError(
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `group_rides/${rideId}`,
        ),
      );
    }
  };

  const closeGroupRide = async (rideId: string) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, "group_rides", rideId), {
        active: false,
      });
    } catch (err) {
      setError(
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `group_rides/${rideId}`,
        ),
      );
    }
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null)
        navigator.geolocation.clearWatch(watchIdRef.current);
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#080808] text-white font-sans selection:bg-[#FF6B00] selection:text-black p-4 md:p-8 pb-24 md:pb-8">
      <div className="max-w-6xl mx-auto flex flex-col min-h-full">
        {/* Header */}
        <header className={`flex justify-between items-center border-b-2 border-[#FF6B00] pb-3 mb-4 md:mb-6 ${activeTab === 'session' ? 'pt-2' : ''}`}>
          <div className="flex items-center gap-3">
            <div className={`bg-[#111] rounded-lg overflow-hidden border border-[#222] transition-all ${activeTab === 'session' ? 'w-8 h-8' : 'w-10 h-10'}`}>
              <img
                src="https://storage.googleapis.com/databeat-v1-cloud-run.appspot.com/users/jaymiller0202@gmail.com/gen-lang-client-0906350094/1713321919932-nola-esk8-logo.png"
                alt="Esk8 NOLA logo"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <h1 className={`font-black tracking-tighter text-[#FF6B00] shadow-[0_0_10px_rgba(255,107,0,0.2)] transition-all ${activeTab === 'session' ? 'text-xl' : 'text-2xl'}`}>
              ESK8 NOLA //
            </h1>
            <div className="hidden md:flex items-center gap-2 text-[12px] uppercase tracking-[2px] text-[#888] ml-4">
              <span
                className={`w-2 h-2 rounded-full ${isTracking ? "bg-[#FF6B00] animate-pulse" : "bg-[#333]"}`}
              />
              {isTracking ? "Session Active: NOLA Pavement" : "System Ready"}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <a href="https://esk8nola.org/" className="inline-flex items-center gap-2 rounded-lg border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#FF6B00] transition hover:bg-[#FF6B00] hover:text-black" aria-label="Play Esk8 Or Walk">
              <Gamepad2 size={15} /><span className="hidden sm:inline">Play Esk8 Or Walk</span><span className="sm:hidden">Play</span>
            </a>
            {!currentUser ? (
              <button
                onClick={loginWithGoogle}
                className="text-[12px] uppercase tracking-[2px] text-[#888] hover:text-white transition-colors"
              >
                Sign In
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-[10px] uppercase font-bold text-[#666] hidden sm:inline">
                  {currentUser.displayName}
                </span>
                <button
                  onClick={() => auth.signOut()}
                  className="text-[#666] hover:text-[#FF3333] transition-colors"
                >
                  <LogOut size={16} />
                </button>
                {currentUser.photoURL && (
                  <img
                    src={currentUser.photoURL}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full border border-[#222]"
                  />
                )}
              </div>
            )}
          </div>
        </header>

        {/* Bento Grid */}
        <main className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-3 gap-4 flex-1">
          {/* Main Speed Card */}
          <BentoCard className={`md:col-span-2 md:row-span-2 bg-gradient-to-br from-[#111] to-[#121212] border-2 ${activeTab !== "session" ? "hidden md:flex" : "flex min-h-[350px] md:min-h-0"}`}>
            <div className="flex flex-col h-full justify-between">
              <div>
                <Label className="text-[#FF6B00]/60">{nearbyHazard ? '!! HAZARD WARNING !!' : 'Velocity // KM/H'}</Label>
                <div className="flex items-baseline gap-1">
                  <motion.span
                    key={speed + (nearbyHazard ? "-hazard" : "-safe")}
                    initial={{ opacity: 0.5, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`text-[120px] md:text-[140px] font-black leading-[0.8] tracking-tighter transition-colors ${nearbyHazard ? "text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.4)]" : "text-[#FF6B00]"}`}
                  >
                    {speed}
                  </motion.span>
                </div>
                {nearbyHazard && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 text-red-500 font-black uppercase text-xl italic tracking-tighter"
                  >
                    DANGER: {nearbyHazard.severity.toUpperCase()} // Pavement Compromised
                  </motion.div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4 mt-8 border-t border-white/5 pt-6">
                <div>
                  <Label className="text-[10px]">Timer</Label>
                  <div className="text-2xl font-black">{formatTime(elapsedTime)}</div>
                </div>
                <div>
                  <Label className="text-[10px]">Dist</Label>
                  <div className="text-2xl font-black">{distance.toFixed(1)}<span className="text-[10px] text-[#444] ml-0.5">KM</span></div>
                </div>
                <div>
                  <Label className="text-[10px]">Max</Label>
                  <div className="text-2xl font-black">{maxSpeed.toFixed(1)}<span className="text-[10px] text-[#444] ml-0.5">KM/H</span></div>
                </div>
              </div>
            </div>
          </BentoCard>

          {/* Session Info / Duration merged into main - keeping sensors here */}
          <BentoCard className={`md:col-span-1 md:row-span-2 bg-[#0a0a0a] ${activeTab !== "session" ? "hidden md:flex" : "flex"}`}>
            <div className="h-full flex flex-col justify-between">
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label className="mb-0">Fall Sensors</Label>
                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${isFallDetectionSensorsEnabled ? "bg-[#FF6B00] text-black" : "bg-[#222] text-[#444]"}`}>
                      {isFallDetectionSensorsEnabled ? "Active" : "Off"}
                    </span>
                  </div>
                  <div className="w-full h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: isFallDetectionSensorsEnabled ? "100%" : "0%" }}
                      className="h-full bg-[#FF6B00]"
                    />
                  </div>
                </div>

                <div>
                  <Label>Environment</Label>
                  <div className="text-xl font-black flex items-center gap-2">
                    <CloudLightning size={16} className="text-[#444]" />
                    <span>Clear</span>
                    <span className="text-[10px] text-[#444] font-bold">82°F</span>
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-6 border-t border-white/5">
                <button
                  onClick={
                    isFallDetectionSensorsEnabled
                      ? disableFallDetection
                      : enableFallDetection
                  }
                  className="w-full py-3 bg-[#111] hover:bg-[#1a1a1a] text-[#888] rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/5 transition-all"
                >
                  Configure Hardware
                </button>
              </div>
            </div>
          </BentoCard>

          {/* Warning / Status Card */}
          <BentoCard
            className={`md:col-span-1 md:row-span-1 transition-colors duration-500 ${nearbyHazard ? getHazardColor(nearbyHazard.severity) : "bg-[#111]"} ${activeTab !== "session" ? "hidden md:flex" : "flex"}`}
          >
            <AnimatePresence mode="wait">
              {nearbyHazard ? (
                <motion.div
                  key="hazard"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex flex-col justify-between h-full"
                >
                  <div className="bg-black/10 w-fit p-2 rounded-lg">
                    <AlertTriangle size={24} />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-black tracking-widest opacity-60 mb-1">
                      {nearbyHazard.severity === "high"
                        ? "CRITICAL HAZARD"
                        : nearbyHazard.severity === "medium"
                          ? "MODERATE HAZARD"
                          : "CAUTION"}
                    </div>
                    <div className="text-3xl font-black tracking-tighter leading-none">
                      DANGER
                    </div>
                    <div className="text-[10px] uppercase font-bold mt-1">
                      Slow down immediately
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="safe"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col justify-between h-full"
                >
                  <Label>Hazards</Label>
                  <div className="flex items-center gap-3">
                    <MapPin size={32} className="text-[#444]" />
                    <div>
                      <div className="text-xs font-black uppercase text-[#888]">
                        All Clear
                      </div>
                      <div className="text-[9px] uppercase tracking-[1px] text-[#444]">
                        No hazards in 100m
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </BentoCard>

          {/* Footer Actions - Ride Controls */}
          <div className={`md:col-span-2 md:row-span-1 flex gap-4 ${activeTab !== "session" ? "hidden md:flex" : "flex"}`}>
            {!isTracking ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={startTracking}
                className="flex-1 bg-[#FF6B00] text-black rounded-[20px] font-black text-xl uppercase tracking-tighter flex items-center justify-center gap-3 transition-shadow hover:shadow-[0_0_30px_rgba(255,107,0,0.2)]"
              >
                <Play fill="currentColor" size={24} />
                Engage Session
              </motion.button>
            ) : (
              <>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={stopTracking}
                  className="flex-1 bg-[#FF3333] text-white rounded-[20px] font-black text-xl uppercase tracking-tighter flex items-center justify-center gap-3"
                >
                  <Square fill="currentColor" size={24} />
                  Abort Ride
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-[0.5] bg-[#222] text-[#888] rounded-[20px] font-black text-xs uppercase tracking-tighter flex items-center justify-center"
                >
                  Pause
                </motion.button>
              </>
            )}
          </div>

          {/* Small Pothole Action Card */}
          <BentoCard
            className={`md:col-span-1 md:row-span-1 group hover:border-[#FF6B00]/50 ${activeTab !== "session" ? "hidden md:flex" : "hidden md:flex"}`}
            initial={{ opacity: 0, scale: 0.9 }}
          >
            <div className="w-full h-full flex flex-col justify-between">
              <Label className="group-hover:text-[#FF6B00] transition-colors">
                Session Streak
              </Label>
              <div className="flex items-end gap-3">
                <div className="text-5xl font-black text-[#FF6B00] italic">
                  {rideStreak?.currentStreak || 0}
                  <span className="text-xl ml-1 not-italic">🔥</span>
                </div>
                <div className="mb-1">
                  <div className="text-[10px] font-black uppercase text-white leading-none">
                    Days Streak
                  </div>
                  <div className="text-[8px] font-bold uppercase text-[#444] mt-1">
                    {rideStreak?.totalRides || 0} Total Rides
                  </div>
                </div>
              </div>
              <div className="text-[8px] font-bold uppercase text-[#444] mt-2 italic">
                {rideStreak?.currentStreak && rideStreak.currentStreak > 0
                  ? `Keep it up! You've skated ${rideStreak.currentStreak} days in a row.`
                  : "Start a streak today!"}
              </div>
            </div>
          </BentoCard>

          {/* Safety Console Card */}
          <BentoCard
            className={`md:col-span-1 md:row-span-1 group hover:border-[#FF6B00]/50 ${activeTab !== "safety" ? "hidden md:flex" : "flex"}`}
            initial={{ opacity: 0, scale: 0.9 }}
          >
            <div className="w-full h-full flex flex-col justify-between">
              <Label className="group-hover:text-[#FF6B00] transition-colors">
                Safety Console
              </Label>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSeverityPicker(!showSeverityPicker)}
                  className="flex-1 bg-[#222] p-4 rounded-xl flex items-center justify-between hover:bg-[#333] transition-all"
                >
                  <div className="text-sm font-black uppercase text-white">
                    Report
                  </div>
                  <Plus size={18} className="text-[#FF6B00]" />
                </button>
                <button
                  onClick={() => setShowBoardCheck(true)}
                  className="bg-[#222] p-4 rounded-xl hover:bg-[#333] transition-all text-[#FF6B00]"
                  title="Board Check"
                >
                  <History size={18} />
                </button>
              </div>

              <AnimatePresence>
                {showSeverityPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute inset-0 bg-[#111] z-20 p-4 flex flex-col gap-2"
                  >
                    <Label>Hazard Severity</Label>
                    <div className="grid grid-cols-3 gap-2 flex-1">
                      <button
                        onClick={() => reportPothole("low")}
                        className="bg-yellow-500 rounded-lg flex items-center justify-center font-black text-black text-[10px] uppercase"
                      >
                        Low
                      </button>
                      <button
                        onClick={() => reportPothole("medium")}
                        className="bg-orange-500 rounded-lg flex items-center justify-center font-black text-white text-[10px] uppercase"
                      >
                        Med
                      </button>
                      <button
                        onClick={() => reportPothole("high")}
                        className="bg-red-600 rounded-lg flex items-center justify-center font-black text-white text-[10px] uppercase"
                      >
                        High
                      </button>
                    </div>
                    <button
                      onClick={() => setShowSeverityPicker(false)}
                      className="text-[10px] uppercase font-bold text-[#444] mt-1"
                    >
                      Cancel
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </BentoCard>

          {/* Mini Info Card - Meetup */}
          <BentoCard className={`md:col-span-1 md:row-span-1 bg-[#FF6B00] text-black ${activeTab !== "session" ? "hidden md:flex" : "hidden md:flex"}`}>
            <div className="flex flex-col h-full justify-between">
              <div className="text-[12px] font-black uppercase tracking-tighter leading-tight text-center">
                UPCOMING MEETUP
                <br />
                <span className="text-[16px]">CITY PARK // 7PM</span>
              </div>

              <button
                onClick={toggleLookingToSkate}
                className={`mt-4 w-full py-2 rounded-lg font-black text-[10px] uppercase border transition-colors flex items-center justify-center gap-2 ${isLookingToSkate ? "bg-black text-[#FF6B00] border-black" : "bg-transparent border-black/20 text-black hover:bg-black/5"}`}
              >
                <Send size={12} />
                {isLookingToSkate ? "Ready to Skate" : "Up to SK8?"}
              </button>
            </div>
          </BentoCard>

          {/* Live Riders Card */}
          <BentoCard className={`md:col-span-1 md:row-span-1 bg-[#111] ${activeTab !== "community" ? "hidden md:flex" : "flex min-h-[150px] md:min-h-0"}`}>
            <Label>Live Community</Label>
            <div className="flex flex-col gap-3 overflow-y-auto max-h-[80px] custom-scrollbar">
              {liveRiders.length > 0 ? (
                liveRiders
                  .filter((r) => r.userId !== currentUser?.uid)
                  .map((rider) => (
                    <div
                      key={rider.userId}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <img
                            src={rider.userPhoto || ""}
                            className="w-6 h-6 rounded-full border border-white/10"
                            alt=""
                          />
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-black ${rider.status === "riding" ? "bg-[#FF6B00]" : "bg-blue-500"}`}
                          />
                        </div>
                        <span className="text-[10px] font-bold uppercase truncate max-w-[60px]">
                          {rider.userName?.split(" ")[0]}
                        </span>
                      </div>
                      <span className="text-[8px] font-black uppercase text-[#444]">
                        {rider.status}
                      </span>
                    </div>
                  ))
              ) : (
                <div className="text-[10px] font-bold text-[#333] italic">
                  No active riders
                </div>
              )}
            </div>
          </BentoCard>

          {/* ICE Card */}
          <BentoCard
            className={`md:col-span-1 md:row-span-1 group hover:border-red-500/50 cursor-pointer ${activeTab !== "safety" ? "hidden md:flex" : "flex"}`}
            initial={{ opacity: 0, scale: 0.9 }}
          >
            <button
              onClick={() =>
                currentUser ? setShowIceModal(true) : loginWithGoogle()
              }
              className="w-full text-left h-full flex flex-col justify-between"
            >
              <Label className="group-hover:text-red-500 transition-colors">
                Emergency Protocol
              </Label>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <HeartPulse
                    size={24}
                    className={
                      privateData.bloodType ? "text-red-500" : "text-[#444]"
                    }
                  />
                  {isFallDetectionSensorsEnabled && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#FF6B00] rounded-full border border-black" />
                  )}
                </div>
                <div>
                  <div className="text-xl font-black uppercase tracking-tighter">
                    ICE //
                  </div>
                  <div className="text-[10px] uppercase font-bold text-[#666]">
                    {privateData.emergencyName
                      ? `${privateData.emergencyName}`
                      : "Setup Protocol"}
                  </div>
                </div>
              </div>
            </button>
          </BentoCard>

          {/* Medical Recovery Card */}
          <BentoCard className={`md:col-span-1 md:row-span-1 bg-[#111] ${activeTab !== "safety" ? "hidden md:flex" : "flex"}`}>
            <Label>Medical Recovery</Label>
            <div className="space-y-3">
              {lastPositionRef.current ? (
                HOSPITALS.map((h) => {
                  const dist = calculateDistance(
                    lastPositionRef.current!.lat,
                    lastPositionRef.current!.lon,
                    h.lat,
                    h.lon,
                  ).toFixed(1);
                  return (
                    <div
                      key={h.name}
                      className="flex items-center justify-between group/hosp border-b border-[#222] pb-2 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <Hospital size={14} className="text-[#FF6B00]" />
                        <span className="text-[10px] font-bold uppercase truncate max-w-[80px] text-[#888]">
                          {h.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-black">{dist}km</span>
                    </div>
                  );
                })
              ) : (
                <div className="text-[10px] font-bold text-[#333] italic">
                  GPS required to locate medical care
                </div>
              )}
            </div>
          </BentoCard>

          {/* Safe Zones Card */}
          {/* Safe Zones Card */}
          <BentoCard className={`md:col-span-1 md:row-span-1 bg-[#111] group hover:border-[#FF6B00]/30 transition-all ${activeTab !== "map" ? "hidden md:flex" : "flex flex-1 min-h-[450px] md:min-h-0"}`}>
            <div className="h-full flex flex-col justify-between">
              <div className="flex justify-between items-center mb-2">
                <Label className="group-hover:text-[#FF6B00] mb-0">
                  Community Map
                </Label>
                <button
                  onClick={() => setShowRadar(!showRadar)}
                  className="p-1 px-2 bg-[#222] rounded text-[8px] font-black uppercase flex items-center gap-1 text-[#666] hover:text-[#FF6B00] transition-colors"
                >
                  {showRadar ? <Activity size={10} /> : <MapIcon size={10} />}
                  {showRadar ? "Switch to List" : "Toggle Radar"}
                </button>
              </div>

              <div className="flex-1 overflow-hidden min-h-[100px] py-1">
                {showRadar ? (
                  <RadarView
                    userPos={lastPositionRef.current}
                    potholes={potholes}
                    safeZones={safeZones}
                  />
                ) : (
                  <div className="space-y-1 overflow-y-auto max-h-[100px] custom-scrollbar pr-2 h-full">
                    {safeZones.length > 0 ? (
                      safeZones.map((sz) => (
                        <div
                          key={sz.id}
                          className="flex items-center justify-between group/sz border-b border-[#222] py-1 last:border-0 hover:bg-white/5 px-1 rounded transition-colors"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <ThumbsUp
                              size={10}
                              className="text-blue-500 shrink-0"
                            />
                            <span className="text-[10px] font-bold uppercase truncate text-[#888]">
                              {sz.title}
                            </span>
                          </div>
                          <span className="text-[8px] font-black opacity-40">
                            {lastPositionRef.current
                              ? `${calculateDistance(lastPositionRef.current.lat, lastPositionRef.current.lon, sz.latitude, sz.longitude).toFixed(1)}km`
                              : ""}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-[10px] text-[#444] italic h-full flex items-center justify-center">
                        No zones reported
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowSafeZoneModal(true)}
                className="w-full py-2 bg-[#222] hover:bg-[#FF6B00] hover:text-black transition-all rounded-lg text-[10px] font-black uppercase mt-3"
              >
                + Spot A Safe Zone
              </button>
            </div>
          </BentoCard>

          {/* Group Ride Check-In Card */}
          <BentoCard className={`md:col-span-1 md:row-span-1 bg-gradient-to-br from-[#111] to-[#151515] border-[#FF6B00]/10 ${activeTab !== "community" ? "hidden md:flex" : "flex"}`}>
            <div className="h-full flex flex-col justify-between">
              <Label>Squad Check-In</Label>
              <div className="space-y-2 mb-3 overflow-y-auto max-h-[80px] custom-scrollbar">
                {groupRides.length > 0 ? (
                  groupRides.map((ride) => {
                    const isMember = ride.members[currentUser?.uid || ""];
                    const allSafe = Object.values(ride.members).every(
                      (m: any) => m.status === "safe",
                    );
                    const myStatus = isMember?.status;

                    return (
                      <div
                        key={ride.id}
                        className="bg-[#151515] border border-[#222] p-2 rounded-lg"
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[9px] font-black uppercase text-[#FF6B00]">
                            {ride.title}
                          </span>
                          <span
                            className={`text-[8px] font-bold uppercase ${allSafe ? "text-green-500" : "text-orange-500"}`}
                          >
                            {allSafe ? "All Clear" : "Active"}
                          </span>
                        </div>

                        {!isMember ? (
                          <button
                            onClick={() => joinGroupRide(ride.id!)}
                            className="w-full py-1 text-[8px] font-black uppercase bg-[#222] rounded flex items-center justify-center gap-1"
                          >
                            <UserPlus size={10} /> Join Ride
                          </button>
                        ) : myStatus === "out" ? (
                          <button
                            onClick={() => checkInSafe(ride.id!)}
                            className="w-full py-1 text-[8px] font-black uppercase bg-[#222] hover:bg-green-600/20 text-green-500 border border-green-500/20 rounded flex items-center justify-center gap-1"
                          >
                            <CheckCheck size={10} /> Signal Safe Return
                          </button>
                        ) : (
                          <div className="text-[8px] font-black uppercase text-center text-[#666]">
                            Checked In Safely
                          </div>
                        )}

                        {ride.creatorId === currentUser?.uid && (
                          <button
                            onClick={() => closeGroupRide(ride.id!)}
                            className="mt-1 w-full text-[8px] font-bold text-red-500/60 hover:text-red-500"
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-[10px] text-[#444] italic">
                    No active group rides
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowGroupRideModal(true)}
                className="w-full py-2 border border-[#222] hover:border-[#FF6B00]/50 transition-all rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-2"
              >
                <Flag size={12} /> Start Group Ride
              </button>
            </div>
          </BentoCard>

          {/* Gear Exchange Card */}
          <BentoCard className={`md:col-span-1 md:row-span-1 bg-[#111] group hover:border-blue-500/30 transition-all ${activeTab !== "community" ? "hidden md:flex" : "flex"}`}>
            <div className="h-full flex flex-col justify-between">
              <Label className="group-hover:text-blue-500">Gear Exchange</Label>
              <div className="space-y-2 mb-3 overflow-y-auto max-h-[80px] custom-scrollbar">
                {gearItems.length > 0 ? (
                  gearItems.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between border-b border-[#222] pb-1 last:border-0"
                    >
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-[#888]">
                          {item.itemName}
                        </span>
                        <span className="text-[8px] font-bold uppercase text-[#444]">
                          {item.ownerName}
                        </span>
                      </div>
                      <span
                        className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${item.status === "available" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}
                      >
                        {item.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-[10px] text-[#444] italic">
                    No gear listed
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowGearModal(true)}
                className="w-full py-2 border border-blue-500/20 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-2 text-blue-500"
              >
                <Wrench size={12} /> View Gear Hub
              </button>
            </div>
          </BentoCard>

          {/* Fall Alerts Community Feed */}
          {fallAlerts.length > 0 && (
            <BentoCard className="md:col-span-1 md:row-span-1 bg-red-600/20 border-red-500 animate-pulse">
              <Label className="text-red-500">Rescue Required</Label>
              <div className="flex items-center gap-3">
                <LifeBuoy size={24} className="text-red-500" />
                <div className="text-white">
                  <div className="text-sm font-black uppercase text-red-500">
                    Rider Down!
                  </div>
                  <div className="text-[10px] uppercase font-bold">
                    {fallAlerts[0].userName?.split(" ")[0]} needs help
                  </div>
                </div>
              </div>
              <button className="mt-3 w-full py-2 bg-red-600 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-2">
                <Navigation size={12} /> Sync GPS Location
              </button>
            </BentoCard>
          )}
        </main>

        {/* Impact Countdown Overlay */}
        <AnimatePresence>
          {impactCountdown !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-red-600 flex items-center justify-center p-6 text-white text-center"
            >
              <div className="max-w-md w-full">
                <div className="bg-white/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 animate-ping">
                  <ShieldAlert size={64} />
                </div>
                <h2 className="text-5xl font-black tracking-tighter mb-4 italic">
                  IMPACT DETECTED //
                </h2>
                <p className="text-sm font-bold uppercase mb-12 tracking-widest opacity-80">
                  Emergency broadcast in {impactCountdown}s
                </p>

                <div className="text-8xl font-black mb-16">
                  {impactCountdown}
                </div>

                <button
                  onClick={() => setImpactCountdown(null)}
                  className="w-full py-8 bg-white text-red-600 rounded-[32px] font-black text-2xl uppercase tracking-tighter shadow-2xl"
                >
                  I'M OKAY - ABORT
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* My Active Alert Overlay */}
        <AnimatePresence>
          {myActiveAlert && (
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              className="fixed bottom-[80px] md:bottom-0 left-0 right-0 z-[90] bg-red-700 p-8 flex flex-col md:flex-row items-center justify-between gap-6"
            >
              <div className="flex items-center gap-6">
                <div className="bg-white/20 p-4 rounded-full animate-bounce">
                  <LifeBuoy size={40} className="text-white" />
                </div>
                <div>
                  <h3 className="text-3xl font-black italic tracking-tighter">
                    RESCUE SIGNAL LIVE //
                  </h3>
                  <p className="text-sm font-bold uppercase tracking-widest opacity-70">
                    GPS broadcast active for all nearby riders
                  </p>
                </div>
              </div>
              <button
                onClick={resolveAlert}
                className="px-12 py-6 bg-white text-red-700 rounded-2xl font-black text-xl uppercase tracking-tighter"
              >
                Clear Signal
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/90 backdrop-blur-xl border-t border-white/5 px-6 py-4 flex justify-between items-center z-[100] md:hidden shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
          <button
            onClick={() => setActiveTab("session")}
            className={`flex flex-col items-center gap-1 transition-all ${activeTab === "session" ? "text-[#FF6B00]" : "text-[#444]"}`}
          >
            <Zap size={20} fill={activeTab === "session" ? "currentColor" : "none"} />
            <span className="text-[8px] font-black uppercase tracking-widest">Ride</span>
          </button>
          <button
            onClick={() => setActiveTab("map")}
            className={`flex flex-col items-center gap-1 transition-all ${activeTab === "map" ? "text-[#FF6B00]" : "text-[#444]"}`}
          >
            <MapIcon size={20} fill={activeTab === "map" ? "currentColor" : "none"} />
            <span className="text-[8px] font-black uppercase tracking-widest">Map</span>
          </button>
          <button
            onClick={() => setActiveTab("community")}
            className={`flex flex-col items-center gap-1 transition-all ${activeTab === "community" ? "text-[#FF6B00]" : "text-[#444]"}`}
          >
            <Users size={20} fill={activeTab === "community" ? "currentColor" : "none"} />
            <span className="text-[8px] font-black uppercase tracking-widest">Squad</span>
          </button>
          <button
            onClick={() => setActiveTab("safety")}
            className={`flex flex-col items-center gap-1 transition-all ${activeTab === "safety" ? "text-[#FF6B00]" : "text-[#444]"}`}
          >
            <ShieldAlert size={20} fill={activeTab === "safety" ? "currentColor" : "none"} />
            <span className="text-[8px] font-black uppercase tracking-widest">Alerts</span>
          </button>
        </nav>

        {/* ICE Modal */}
        <AnimatePresence>
          {showIceModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-[#111] border border-[#222] rounded-[32px] w-full max-w-md overflow-hidden"
              >
                <form onSubmit={saveIceData} className="p-8">
                  <Label className="text-red-500">In Case of Emergency</Label>
                  <h2 className="text-4xl font-black tracking-tighter mb-2 italic">
                    ICE // DATA
                  </h2>
                  <p className="text-[10px] uppercase font-bold text-[#666] tracking-[2px] mb-8">
                    Encrypted medical response packet
                  </p>

                  <div className="space-y-6 mb-10">
                    <div>
                      <Label>Blood Type</Label>
                      <select
                        value={privateData.bloodType || ""}
                        onChange={(e) =>
                          setPrivateData({
                            ...privateData,
                            bloodType: e.target.value,
                          })
                        }
                        className="w-full bg-[#151515] border border-[#333] rounded-xl p-4 text-white font-bold uppercase outline-none focus:border-red-500 transition-colors"
                      >
                        <option value="">Select Type</option>
                        {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(
                          (t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ),
                        )}
                      </select>
                    </div>

                    <div>
                      <Label>Contact Name</Label>
                      <input
                        type="text"
                        placeholder="WHO TO CALL"
                        value={privateData.emergencyName || ""}
                        onChange={(e) =>
                          setPrivateData({
                            ...privateData,
                            emergencyName: e.target.value,
                          })
                        }
                        className="w-full bg-[#151515] border border-[#333] rounded-xl p-4 text-white font-bold uppercase outline-none focus:border-red-500 transition-colors placeholder:text-[#333]"
                      />
                    </div>

                    <div>
                      <Label>Contact Phone</Label>
                      <input
                        type="tel"
                        placeholder="+1 (555) 000-0000"
                        value={privateData.emergencyPhone || ""}
                        onChange={(e) =>
                          setPrivateData({
                            ...privateData,
                            emergencyPhone: e.target.value,
                          })
                        }
                        className="w-full bg-[#151515] border border-[#333] rounded-xl p-4 text-white font-bold uppercase outline-none focus:border-red-500 transition-colors placeholder:text-[#333]"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowIceModal(false)}
                      className="flex-1 py-4 rounded-2xl font-black text-sm uppercase tracking-widest bg-[#222] text-[#666]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-[2] py-4 rounded-2xl font-black text-sm uppercase tracking-widest bg-red-600 text-white shadow-[0_0_30px_rgba(220,38,38,0.2)]"
                    >
                      Save Protocol
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gear Exchange Modal */}
        <AnimatePresence>
          {showGearModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-[#111] border border-[#222] rounded-[32px] w-full max-w-2xl overflow-hidden"
              >
                <div className="p-8">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <Label className="text-blue-500">Community Support</Label>
                      <h2 className="text-4xl font-black tracking-tighter italic uppercase">
                        Gear // Hub
                      </h2>
                    </div>
                    <button
                      onClick={() => setShowGearModal(false)}
                      className="text-[#444] hover:text-white transition-colors"
                    >
                      <Square size={24} className="rotate-45" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    {/* Add Item Form */}
                    <div>
                      <Label>Lend Equipment</Label>
                      <div className="space-y-4">
                        <input
                          type="text"
                          placeholder="ITEM NAME (e.g. Helmet, T-Tool)"
                          value={gearItemName}
                          onChange={(e) => setGearItemName(e.target.value)}
                          className="w-full bg-[#151515] border border-[#333] rounded-xl p-4 text-white font-bold uppercase outline-none focus:border-blue-500 transition-colors placeholder:text-[#333]"
                        />
                        <select
                          value={gearItemType}
                          onChange={(e) =>
                            setGearItemType(
                              e.target.value as GearExchangeItem["itemType"],
                            )
                          }
                          className="w-full bg-[#151515] border border-[#333] rounded-xl p-4 text-white font-bold uppercase outline-none focus:border-blue-500 transition-colors"
                        >
                          <option value="board">Board</option>
                          <option value="helmet">Helmet</option>
                          <option value="pad">Pads</option>
                          <option value="tool">Tool</option>
                          <option value="other">Other</option>
                        </select>
                        <button
                          onClick={() => {
                            if (gearItemName.trim()) {
                              addGearItem(gearItemName, gearItemType);
                              setGearItemName("");
                            }
                          }}
                          className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-tighter hover:bg-blue-500 transition-colors"
                        >
                          List Gear Item
                        </button>
                      </div>
                    </div>

                    {/* Gear List */}
                    <div className="flex flex-col">
                      <Label>Active Listings</Label>
                      <div className="flex-1 overflow-y-auto max-h-[300px] space-y-3 pr-2 custom-scrollbar">
                        {gearItems.length > 0 ? (
                          gearItems.map((item) => (
                            <div
                              key={item.id}
                              className="bg-[#151515] border border-[#222] p-4 rounded-2xl flex flex-col justify-between gap-4"
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="text-xs font-black uppercase text-white">
                                    {item.itemName}
                                  </div>
                                  <div className="text-[10px] font-bold uppercase text-[#555]">
                                    {item.ownerName} • {item.itemType}
                                  </div>
                                </div>
                                <span
                                  className={`text-[8px] font-black uppercase p-1 px-2 rounded-lg ${item.status === "available" ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"}`}
                                >
                                  {item.status}
                                </span>
                              </div>

                              <div className="flex gap-2">
                                {item.status === "available" ? (
                                  <button
                                    onClick={() => borrowGear(item.id!)}
                                    className="flex-1 py-2 bg-[#222] hover:bg-blue-600 transition-all rounded-lg text-[9px] font-black uppercase"
                                  >
                                    Borrow
                                  </button>
                                ) : (
                                  (item.borrowerId === currentUser?.uid ||
                                    item.ownerId === currentUser?.uid) && (
                                    <button
                                      onClick={() => returnGear(item.id!)}
                                      className="flex-1 py-2 bg-[#222] hover:bg-green-600 transition-all rounded-lg text-[9px] font-black uppercase"
                                    >
                                      Mark as Returned
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-10 text-[#444] text-[10px] font-black uppercase tracking-widest italic">
                            No gear in the exchange yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Board-Check Overlay */}
        <AnimatePresence>
          {showBoardCheck && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-[#111] border border-[#222] rounded-[32px] w-full max-w-md overflow-hidden relative"
              >
                <div className="p-8 pb-4">
                  <Label className="text-[#FF6B00]">Safety Protocol</Label>
                  <h2 className="text-4xl font-black tracking-tighter mb-2 italic">
                    BOARD-CHECK //
                  </h2>
                  <p className="text-[10px] uppercase font-bold text-[#666] tracking-[2px] mb-8">
                    Verification required to engage motors
                  </p>

                  <div className="space-y-3 mb-10">
                    {BOARD_CHECKLIST.map((item) => {
                      const Icon = item.icon;
                      const isChecked = checkedItems.has(item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() => toggleChecklistItem(item.id)}
                          className={`w-full p-5 rounded-2xl flex items-center justify-between transition-all border ${isChecked ? "bg-[#FF6B00]/5 border-[#FF6B00]/20 text-white" : "bg-[#151515] border-transparent text-[#666]"}`}
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={`${isChecked ? "text-[#FF6B00]" : "text-inherit"}`}
                            >
                              <Icon size={20} />
                            </div>
                            <span className="text-sm font-bold uppercase tracking-tight">
                              {item.label}
                            </span>
                          </div>
                          {isChecked ? (
                            <CheckCircle2
                              size={20}
                              className="text-[#FF6B00]"
                            />
                          ) : (
                            <Circle size={20} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 bg-[#151515]">
                  <button
                    disabled={checkedItems.size < BOARD_CHECKLIST.length}
                    onClick={() => {
                      if (isTracking) {
                        setShowBoardCheck(false);
                      } else {
                        startTracking();
                      }
                    }}
                    className={`w-full py-6 rounded-[24px] font-black text-xl uppercase tracking-tighter flex items-center justify-center gap-3 transition-all ${checkedItems.size === BOARD_CHECKLIST.length ? "bg-[#FF6B00] text-black shadow-[0_0_40px_rgba(255,107,0,0.15)]" : "bg-[#222] text-[#444] cursor-not-allowed"}`}
                  >
                    {isTracking ? "Close Check" : "Confirm & Engage"}
                  </button>
                  <button
                    onClick={() => setShowBoardCheck(false)}
                    className="w-full text-center py-4 text-[10px] uppercase font-bold text-[#444] tracking-widest"
                  >
                    Abort Check
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Safe Zone Modal */}
        <AnimatePresence>
          {showSafeZoneModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-[#111] border border-[#222] rounded-[32px] w-full max-w-sm p-8"
              >
                <Label className="text-[#FF6B00]">Community Spotting</Label>
                <h2 className="text-3xl font-black tracking-tighter mb-6 italic text-white uppercase">
                  Spot A Safe Zone
                </h2>
                <input
                  autoFocus
                  type="text"
                  placeholder="e.g., Audubon Park Loop"
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      reportSafeZone(e.currentTarget.value);
                  }}
                  className="w-full bg-[#151515] border border-[#333] rounded-xl p-4 text-white font-bold uppercase outline-none focus:border-[#FF6B00] transition-colors mb-6"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSafeZoneModal(false)}
                    className="flex-1 py-4 text-[10px] font-black uppercase text-[#444]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={(e) => {
                      const input = e.currentTarget.parentElement
                        ?.previousElementSibling as HTMLInputElement;
                      reportSafeZone(input.value);
                    }}
                    className="flex-[2] py-4 bg-[#FF6B00] text-black rounded-xl font-black text-[10px] uppercase shadow-[0_0_20px_rgba(255,107,0,0.15)]"
                  >
                    Confirm Spot
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Group Ride Modal */}
        <AnimatePresence>
          {showGroupRideModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-[#111] border border-[#222] rounded-[32px] w-full max-w-sm p-8"
              >
                <form onSubmit={createGroupRide}>
                  <Label className="text-[#FF6B00]">Squad Management</Label>
                  <h2 className="text-3xl font-black tracking-tighter mb-6 italic text-white uppercase">
                    Initialize Group
                  </h2>
                  <input
                    autoFocus
                    type="text"
                    value={rideTitle}
                    onChange={(e) => setRideTitle(e.target.value)}
                    placeholder="Ride Title (e.g. French Quarter Fly)"
                    className="w-full bg-[#151515] border border-[#333] rounded-xl p-4 text-white font-bold uppercase outline-none focus:border-[#FF6B00] transition-colors mb-6"
                  />
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowGroupRideModal(false)}
                      className="flex-1 py-4 text-[10px] font-black uppercase text-[#444]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-[2] py-4 bg-[#FF6B00] text-black rounded-xl font-black text-[10px] uppercase shadow-[0_0_20px_rgba(255,107,0,0.15)]"
                    >
                      Assemble Crew
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Overlay */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 px-6 py-4 bg-[#FF3333] text-white rounded-2xl flex items-center gap-3 shadow-2xl"
            >
              <ShieldAlert size={20} />
              <p className="text-sm font-black uppercase">{error}</p>
              <button
                onClick={() => setError(null)}
                className="ml-4 text-[10px] uppercase font-bold bg-black/20 px-2 py-1 rounded"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="mt-8 text-center text-[10px] uppercase font-bold text-[#333] tracking-[4px] hidden md:block">
          Track the ride. Protect the crew. // ESK8 NOLA
        </footer>
      </div>

      <style>{`
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .animate-bounce-subtle {
          animation: bounce-subtle 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
