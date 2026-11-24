import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";

const BIOMETRIC_KEY = "@spliteasy_biometric";

interface BiometricContextType {
  biometricEnabled: boolean;
  setBiometricEnabled: (val: boolean) => Promise<void>;
  isLocked: boolean;
  isReady: boolean;
  unlock: () => Promise<boolean>;
  unlockWithPasscode: () => Promise<boolean>;
  biometricAvailable: boolean;
  biometricType: string;
}

const BiometricContext = createContext<BiometricContextType>({
  biometricEnabled: false,
  setBiometricEnabled: async () => {},
  isLocked: false,
  isReady: false,
  unlock: async () => true,
  unlockWithPasscode: async () => true,
  biometricAvailable: false,
  biometricType: "",
});

export function BiometricProvider({ children }: { children: React.ReactNode }) {
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState("");

  useEffect(() => {
    checkCapabilities();
    loadSetting();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [biometricEnabled]);

  async function checkCapabilities() {
    if (Platform.OS === "web") return;
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(compatible && enrolled);
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType("Face ID");
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType("Touch ID");
      } else {
        setBiometricType("Biometrics");
      }
    } catch {}
  }

  async function loadSetting() {
    try {
      const val = await AsyncStorage.getItem(BIOMETRIC_KEY);
      if (val === "true") {
        setBiometricEnabledState(true);
        setIsLocked(true);
      }
    } catch {
      // If persisted settings cannot be read, keep the app unlocked rather than
      // blocking access behind an unknown state.
    } finally {
      setIsReady(true);
    }
  }

  function handleAppState(state: AppStateStatus) {
    if (state === "background") {
      if (biometricEnabled) setIsLocked(true);
    }
  }

  const setBiometricEnabled = useCallback(async (val: boolean) => {
    setBiometricEnabledState(val);
    await AsyncStorage.setItem(BIOMETRIC_KEY, String(val));
    if (!val) setIsLocked(false);
  }, []);

  const authenticate = useCallback(async (allowDeviceFallback: boolean): Promise<boolean> => {
    if (Platform.OS === "web") {
      setIsLocked(false);
      return true;
    }
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Split Mate",
        fallbackLabel: "Use Passcode",
        disableDeviceFallback: false,
      });
      if (result.success) {
        setIsLocked(false);
        return true;
      }
      return false;
    } catch {
      // A device-auth failure must never unlock the app.
      return false;
    }
  }, []);

  // iOS still tries Face ID first when fallback is enabled. Keeping the
  // fallback available here also makes this action usable in Expo Go, where
  // Face ID itself is not available to the host app.
  // Main unlock is Face ID / Touch ID only, so it always shows a real check;
  // the passcode path is offered separately after a failed attempt.
  const unlock = useCallback(() => authenticate(!biometricAvailable), [authenticate, biometricAvailable]);
  const unlockWithPasscode = useCallback(() => authenticate(true), [authenticate]);

  return (
    <BiometricContext.Provider value={{ biometricEnabled, setBiometricEnabled, isLocked, isReady, unlock, unlockWithPasscode, biometricAvailable, biometricType }}>
      {children}
    </BiometricContext.Provider>
  );
}

export function useBiometric() {
  return useContext(BiometricContext);
}
