import { useState, useEffect, useCallback } from "react";
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { handleFirestoreError, OperationType } from "../lib/firestore-error-handler";
import { UserPersona, SecurityConfig } from "../types";

export const useAuthAndProfile = () => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // User Profile Traits (Personality, likes, dislikes, experiences, preferences)
  const [persona, setPersona] = useState<UserPersona>({
    personality: "",
    preferences: "",
    likes: "",
    dislikes: "",
    experiences: "",
  });

  // Startup Security Configurations
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>({
    securityEnabled: false,
    pin: "",
    voicePassphrase: "my voice is my password",
    firstName: "",
  });
  const [isAppLocked, setIsAppLocked] = useState<boolean>(false);

  // 1. Observe Firebase Authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);

      if (!user) {
        // Load local persona when guest user
        const savedPersona = localStorage.getItem("talker_persona_local");
        if (savedPersona) {
          try {
            setPersona(JSON.parse(savedPersona));
          } catch (e) {
            console.warn("Could not load local persona from localStorage", e);
          }
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Load startup Security settings from LocalStorage
  useEffect(() => {
    const savedSecurityEnabled = localStorage.getItem("talker_security_enabled") === "true";
    const savedPin = localStorage.getItem("talker_security_pin") || "";
    const savedVoicePassphrase =
      localStorage.getItem("talker_security_passphrase") || "my voice is my password";
    const savedFirstName = localStorage.getItem("talker_security_firstname") || "";

    setSecurityConfig({
      securityEnabled: savedSecurityEnabled,
      pin: savedPin,
      voicePassphrase: savedVoicePassphrase,
      firstName: savedFirstName,
    });

    if (savedSecurityEnabled) {
      setIsAppLocked(true);
    }
  }, []);

  // 3. Keep User Profile Persona & Security settings synced in real-time with Firestore when signed in
  useEffect(() => {
    if (authLoading || !currentUser) return;

    const userRef = doc(db, "users", currentUser.uid);
    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setPersona({
            personality: data.personality || "",
            preferences: data.preferences || "",
            likes: data.likes || "",
            dislikes: data.dislikes || "",
            experiences: data.experiences || "",
          });

          // Sync security settings from Firestore cleanly
          const updatedSecurity: SecurityConfig = {
            securityEnabled: data.securityEnabled ?? false,
            pin: data.pin ?? "",
            voicePassphrase: data.voicePassphrase ?? "my voice is my password",
            firstName: data.firstName ?? "",
          };

          setSecurityConfig(updatedSecurity);

          localStorage.setItem("talker_security_enabled", String(updatedSecurity.securityEnabled));
          localStorage.setItem("talker_security_pin", updatedSecurity.pin);
          localStorage.setItem("talker_security_passphrase", updatedSecurity.voicePassphrase);
          localStorage.setItem("talker_security_firstname", updatedSecurity.firstName);
        }
      },
      (err) => {
        console.warn("User persona listener issue:", err);
      }
    );

    return () => unsubscribe();
  }, [currentUser, authLoading]);

  // Handler: Save Persona details
  const savePersona = useCallback(async (newPersona: UserPersona) => {
    setPersona(newPersona);
    localStorage.setItem("talker_persona_local", JSON.stringify(newPersona));

    if (currentUser) {
      try {
        await setDoc(
          doc(db, "users", currentUser.uid),
          {
            ...newPersona,
            userId: currentUser.uid,
            email: currentUser.email || "",
            displayName: currentUser.displayName || "",
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
      }
    }
  }, [currentUser]);

  // Handler: Save Security configurations
  const saveSecurity = useCallback(async (securityData: SecurityConfig) => {
    setSecurityConfig(securityData);

    localStorage.setItem("talker_security_enabled", String(securityData.securityEnabled));
    localStorage.setItem("talker_security_pin", securityData.pin);
    localStorage.setItem("talker_security_passphrase", securityData.voicePassphrase);
    localStorage.setItem("talker_security_firstname", securityData.firstName);

    if (currentUser) {
      try {
        await setDoc(
          doc(db, "users", currentUser.uid),
          {
            securityEnabled: securityData.securityEnabled,
            pin: securityData.pin,
            voicePassphrase: securityData.voicePassphrase,
            firstName: securityData.firstName,
            userId: currentUser.uid,
            email: currentUser.email || "",
            displayName: currentUser.displayName || "",
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
      }
    }
  }, [currentUser]);

  // Handler: Trigger Google Account login
  const loginWithGoogle = useCallback(async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error("Google Authentication failed:", e);
      throw e;
    }
  }, []);

  // Handler: Log out current user
  const logoutOfApp = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Logout error:", e);
    }
  }, []);

  return {
    currentUser,
    authLoading,
    persona,
    securityConfig,
    isAppLocked,
    setIsAppLocked,
    savePersona,
    saveSecurity,
    loginWithGoogle,
    logoutOfApp,
  };
};
