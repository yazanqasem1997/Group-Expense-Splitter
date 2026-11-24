import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const settledChime = require("../assets/audio/settled-chime.wav");
const addedPop = require("../assets/audio/expense-added.wav");
const removedSwish = require("../assets/audio/expense-removed.wav");

type SoundEffects = {
  /** Payment recorded / group settled. */
  playSettled: () => void;
  /** Sounds switched off in Settings. */
  muted: boolean;
  setMuted: (m: boolean) => void;
  /** An expense was added on this device. */
  playAdded: () => void;
  /** An expense was deleted on this device. */
  playRemoved: () => void;
};

const SoundEffectsContext = createContext<SoundEffects | null>(null);

export function SoundEffectsProvider({ children }: { children: React.ReactNode }) {
  const settledPlayer = useAudioPlayer(settledChime);
  const addedPlayer = useAudioPlayer(addedPop);
  const removedPlayer = useAudioPlayer(removedSwish);
  const [muted, setMutedState] = useState(false);
  const mutedRef = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem("soundsMuted:v1").then(v => { mutedRef.current = v === "1"; setMutedState(v === "1"); }).catch(() => {});
  }, []);
  const setMuted = useCallback((m: boolean) => {
    mutedRef.current = m;
    setMutedState(m);
    AsyncStorage.setItem("soundsMuted:v1", m ? "1" : "0").catch(() => {});
  }, []);

  useEffect(() => {
    void setAudioModeAsync({
      // UI sounds must respect the iPhone silent switch (the old setting made
      // the app chime even when the phone was on silent).
      playsInSilentMode: false,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
    }).catch(() => {
      // Sound is a non-blocking enhancement; auth and settlement flows must work
      // even when the device audio session is unavailable.
    });
  }, []);

  const play = useCallback((player: typeof settledPlayer, volume: number) => {
    if (mutedRef.current) return;
    void player.seekTo(0).then(() => {
      player.volume = volume;
      player.play();
    }).catch(() => {
      // Ignore unsupported audio environments such as older web previews.
    });
  }, []);

  const value = useMemo<SoundEffects>(() => ({
    playSettled: () => play(settledPlayer, 0.3),
    playAdded: () => play(addedPlayer, 0.22),
    playRemoved: () => play(removedPlayer, 0.18),
    muted,
    setMuted,
  }), [play, settledPlayer, addedPlayer, removedPlayer, muted, setMuted]);

  return (
    <SoundEffectsContext.Provider value={value}>
      {children}
    </SoundEffectsContext.Provider>
  );
}

export function useSoundEffects(): SoundEffects {
  const value = useContext(SoundEffectsContext);
  if (!value) throw new Error("useSoundEffects must be used inside SoundEffectsProvider");
  return value;
}
