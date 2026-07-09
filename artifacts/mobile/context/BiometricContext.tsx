import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";

const BIOMETRIC_KEY = "@spliteasy_biometric";

interface BiometricContextType {
  biometricEnabled: boolean;
  setBiometricEnabled: (val: boolean) => Promise<void>;
  isLocked: boolean;
  unlock: () => Promise<boolean>;
  biometricAvailable: boolean;
  biometricType: string;
}

const BiometricContext = createContext<BiometricContextType>({
  biometricEnabled: false,
  setBiometricEnabled: async () => {},
  isLocked: false,
  unlock: async () => true,
  biometricAvailable: false,
  biometricType: "",
});

export function BiometricProvider({ children }: { children: React.ReactNode }) {
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
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
    } catch {}
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

  const unlock = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web") {
      setIsLocked(false);
      return true;
    }
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock SplitEasy",
        fallbackLabel: "Use Passcode",
        disableDeviceFallback: false,
      });
      if (result.success) {
        setIsLocked(false);
        return true;
      }
      return false;
    } catch {
      setIsLocked(false);
      return true;
    }
  }, []);

  return (
    <BiometricContext.Provider value={{ biometricEnabled, setBiometricEnabled, isLocked, unlock, biometricAvailable, biometricType }}>
      {children}
    </BiometricContext.Provider>
  );
}

export function useBiometric() {
  return useContext(BiometricContext);
}
