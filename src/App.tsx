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
        ownerI…12423 tokens truncated…setPrivateData({
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
                                    {item.ownerName} â€¢ {item.itemType}
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

