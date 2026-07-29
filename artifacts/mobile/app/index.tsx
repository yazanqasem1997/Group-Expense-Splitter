import { Feather } from "@expo/vector-icons";
import { useAuth, useSignIn, useSignUp, useSSO } from "@clerk/expo";
import * as AuthSession from "expo-auth-session";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Path,
  Stop,
} from "react-native-svg";

// Complete any pending web browser auth session (required for OAuth).
WebBrowser.maybeCompleteAuthSession();

// Preload the browser on Android to reduce OAuth latency.
function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

type Mode = "landing" | "signin" | "signup" | "verify" | "mfa";

function ForkIcon({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <SvgGradient id="stem" x1="32" y1="48" x2="32" y2="24" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#8BBAD4" />
          <Stop offset="1" stopColor="#2B7BE0" />
        </SvgGradient>
        <SvgGradient id="lb" x1="32" y1="24" x2="14" y2="8" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#2B7BE0" />
          <Stop offset="1" stopColor="#1A6FD8" />
        </SvgGradient>
        <SvgGradient id="rb" x1="32" y1="24" x2="50" y2="8" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#18C4AC" />
          <Stop offset="1" stopColor="#14B09A" />
        </SvgGradient>
      </Defs>
      <Path d="M32 48 L32 26" stroke="url(#stem)" strokeWidth="4.5" strokeLinecap="round" />
      <Path d="M32 26 Q32 20 14 10" stroke="url(#lb)" strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <Path d="M32 26 Q32 20 50 10" stroke="url(#rb)" strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <Circle cx="14" cy="9" r="5.5" fill="#2B7BE0" />
      <Circle cx="50" cy="9" r="5.5" fill="#18C4AC" />
      <Circle cx="32" cy="50" r="4" fill="#7AAAC8" />
      <Circle cx="32" cy="26" r="3" fill="#7AAAC8" opacity="0.7" />
    </Svg>
  );
}

function GoogleIcon() {
  return (
    <View style={styles.googleIconWrap}>
      <Text style={styles.googleGlyph}>G</Text>
    </View>
  );
}

/** A generic, user-safe message for unexpected auth failures. */
const GENERIC_ERROR = "Something went wrong. Please try again.";

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  useWarmUpBrowser();

  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signIn, errors: signInErrors, fetchStatus: signInFetch } = useSignIn();
  const { signUp, errors: signUpErrors, fetchStatus: signUpFetch } = useSignUp();
  const { startSSOFlow } = useSSO();

  const [mode, setMode] = useState<Mode>("landing");
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [ssoBusy, setSsoBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const busy =
    signInFetch === "fetching" ||
    signUpFetch === "fetching" ||
    ssoBusy ||
    finalizing;

  // ── Hero entrance animation ───────────────────────────────────────────
  const logoScale = useRef(new Animated.Value(0.25)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(28)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const pillsOpacity = useRef(new Animated.Value(0)).current;
  const btnsY = useRef(new Animated.Value(56)).current;
  const btnsOpacity = useRef(new Animated.Value(0)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = (delay: number, anims: Animated.CompositeAnimation[]) =>
      Animated.sequence([Animated.delay(delay), Animated.parallel(anims)]).start();

    run(180, [
      Animated.spring(logoScale, { toValue: 1, tension: 55, friction: 7, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]);
    run(420, [
      Animated.timing(titleOpacity, { toValue: 1, duration: 360, useNativeDriver: true }),
      Animated.spring(titleY, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
    ]);
    run(680, [Animated.timing(taglineOpacity, { toValue: 1, duration: 380, useNativeDriver: true })]);
    run(860, [Animated.timing(pillsOpacity, { toValue: 1, duration: 360, useNativeDriver: true })]);
    run(1020, [
      Animated.timing(btnsOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(btnsY, { toValue: 0, tension: 65, friction: 10, useNativeDriver: true }),
    ]);
    run(1500, [Animated.timing(footerOpacity, { toValue: 1, duration: 380, useNativeDriver: true })]);
  }, []);

  // ── Error surfacing (safe, user-facing) ───────────────────────────────
  const globalErrorFor = useCallback(
    (kind: "signin" | "signup"): string | null => {
      const errs = kind === "signin" ? signInErrors : signUpErrors;
      if (!errs) return null;
      const global = errs.global?.[0]?.message;
      if (global) return global;
      return null;
    },
    [signInErrors, signUpErrors],
  );

  const resetForm = useCallback((next: Mode) => {
    setFormError(null);
    setCode("");
    if (next === "landing" || next === "signin" || next === "signup") {
      // keep email between sign-in/up, but clear code
    }
    setMode(next);
  }, []);

  // ── Sign in ───────────────────────────────────────────────────────────
  const handleSignIn = useCallback(async () => {
    setFormError(null);
    try {
      const { error } = await signIn.password({ identifier: emailAddress, password });
      if (error) return; // field/global errors already surfaced via the errors object

      if (signIn.status === "complete") {
        setFinalizing(true);
        await signIn.finalize();
      } else if (signIn.status === "needs_second_factor") {
        // MFA (e.g. TOTP / SMS second factor) is required.
        setMode("mfa");
        setFormError(
          "This account has multi-factor authentication enabled, which isn't supported in the app yet. Please finish signing in on the web.",
        );
      } else if (signIn.status === "needs_client_trust") {
        // Client trust — verify this device with an email code.
        const emailCodeFactor = signIn.supportedSecondFactors?.find(
          (f) => f.strategy === "email_code",
        );
        if (emailCodeFactor) {
          await signIn.mfa.sendEmailCode();
          setMode("mfa");
        } else {
          setFormError(
            "This device needs to be verified, but no supported method is available. Please sign in on the web.",
          );
        }
      } else {
        setFormError(GENERIC_ERROR);
      }
    } catch {
      setFormError(GENERIC_ERROR);
    } finally {
      setFinalizing(false);
    }
  }, [signIn, emailAddress, password]);

  // ── MFA / client-trust email code verification ────────────────────────
  const handleVerifyMfa = useCallback(async () => {
    setFormError(null);
    try {
      await signIn.mfa.verifyEmailCode({ code });
      if (signIn.status === "complete") {
        setFinalizing(true);
        await signIn.finalize();
      }
    } catch {
      setFormError(GENERIC_ERROR);
    } finally {
      setFinalizing(false);
    }
  }, [signIn, code]);

  // ── Sign up ───────────────────────────────────────────────────────────
  const handleSignUp = useCallback(async () => {
    setFormError(null);
    try {
      const { error } = await signUp.password({ emailAddress, password });
      if (error) return;
      await signUp.verifications.sendEmailCode();
      setMode("verify");
    } catch {
      setFormError(GENERIC_ERROR);
    }
  }, [signUp, emailAddress, password]);

  const handleVerifySignUp = useCallback(async () => {
    setFormError(null);
    try {
      await signUp.verifications.verifyEmailCode({ code });
      if (signUp.status === "complete") {
        setFinalizing(true);
        await signUp.finalize();
      } else {
        setFormError(
          "We couldn't finish creating your account. Please double-check the code and try again.",
        );
      }
    } catch {
      setFormError(GENERIC_ERROR);
    } finally {
      setFinalizing(false);
    }
  }, [signUp, code]);

  const handleResendCode = useCallback(async () => {
    setFormError(null);
    try {
      await signUp.verifications.sendEmailCode();
    } catch {
      setFormError(GENERIC_ERROR);
    }
  }, [signUp]);

  // ── Google SSO (sign in + sign up) ────────────────────────────────────
  const handleGoogle = useCallback(async () => {
    setFormError(null);
    if (Platform.OS === "web") {
      setFormError("Google sign-in isn't available in the web preview. Use email instead.");
      return;
    }
    setSsoBusy(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      } else {
        // Missing requirements (e.g. MFA) — not supported in-app yet.
        setFormError(
          "We couldn't complete Google sign-in. Please finish signing in on the web.",
        );
      }
    } catch {
      // User likely cancelled the browser flow, or it failed.
      setFormError(null);
    } finally {
      setSsoBusy(false);
    }
  }, [startSSOFlow]);

  // ── Signed-in routing ─────────────────────────────────────────────────
  if (authLoaded && isSignedIn) {
    return <Redirect href="/(tabs)" />;
  }

  const emailFieldError =
    (mode === "signin" ? signInErrors?.fields?.identifier?.message : null) ??
    (mode === "signup" ? signUpErrors?.fields?.emailAddress?.message : null);
  const passwordFieldError =
    (mode === "signin" ? signInErrors?.fields?.password?.message : null) ??
    (mode === "signup" ? signUpErrors?.fields?.password?.message : null);
  const codeFieldError =
    mode === "verify"
      ? signUpErrors?.fields?.code?.message
      : mode === "mfa"
        ? signInErrors?.fields?.code?.message
        : null;
  const globalError =
    formError ??
    (mode === "signin" || mode === "mfa" ? globalErrorFor("signin") : null) ??
    (mode === "signup" || mode === "verify" ? globalErrorFor("signup") : null);

  // ── Render helpers ────────────────────────────────────────────────────
  const renderLanding = () => (
    <Animated.View
      style={[
        styles.authSection,
        { paddingBottom: insets.bottom + 20, opacity: btnsOpacity, transform: [{ translateY: btnsY }] },
      ]}
    >
      <Pressable
        style={({ pressed }) => [styles.btn, styles.googleBtn, pressed && styles.pressed]}
        onPress={handleGoogle}
        disabled={busy}
      >
        {ssoBusy ? (
          <ActivityIndicator color="#1F2937" />
        ) : (
          <>
            <GoogleIcon />
            <Text style={[styles.btnText, styles.googleBtnText]}>Continue with Google</Text>
          </>
        )}
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.btn, styles.emailBtn, pressed && styles.pressed]}
        onPress={() => resetForm("signin")}
        disabled={busy}
      >
        <Feather name="mail" size={18} color="rgba(255,255,255,0.85)" />
        <Text style={[styles.btnText, styles.emailBtnText]}>Continue with Email</Text>
      </Pressable>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerLabel}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <Pressable
        style={({ pressed }) => [styles.btn, styles.phoneBtn, pressed && styles.pressed]}
        onPress={() => resetForm("signup")}
        disabled={busy}
      >
        <Feather name="user-plus" size={18} color="rgba(255,255,255,0.85)" />
        <Text style={[styles.btnText, styles.emailBtnText]}>Create an account</Text>
      </Pressable>

      <Animated.Text style={[styles.footer, { opacity: footerOpacity }]}>
        By continuing you agree to our{" "}
        <Text style={styles.footerLink}>Terms of Service</Text>
        {"  "}and{"  "}
        <Text style={styles.footerLink}>Privacy Policy</Text>
      </Animated.Text>
    </Animated.View>
  );

  const renderField = (
    label: string,
    value: string,
    onChangeText: (t: string) => void,
    opts: {
      placeholder: string;
      secure?: boolean;
      keyboardType?: "email-address" | "numeric" | "default";
      error?: string | null;
      autoFocus?: boolean;
    },
  ) => (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, opts.error ? styles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={opts.placeholder}
        placeholderTextColor="rgba(255,255,255,0.5)"
        secureTextEntry={opts.secure}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={opts.keyboardType ?? "default"}
        autoFocus={opts.autoFocus}
        editable={!busy}
      />
      {opts.error ? <Text style={styles.fieldError}>{opts.error}</Text> : null}
    </View>
  );

  const renderForm = () => {
    const isSignin = mode === "signin";
    const isSignup = mode === "signup";
    const isVerify = mode === "verify";
    const isMfa = mode === "mfa";

    const title = isSignin
      ? "Welcome back"
      : isSignup
        ? "Create your account"
        : "Verify your email";
    const subtitle = isSignin
      ? "Sign in to keep splitting expenses"
      : isSignup
        ? "Start splitting expenses with your group"
        : `We sent a code to ${emailAddress || "your email"}`;

    const primaryDisabled =
      busy ||
      ((isSignin || isSignup) && (!emailAddress || !password)) ||
      ((isVerify || isMfa) && !code);

    const onPrimary = isSignin
      ? handleSignIn
      : isSignup
        ? handleSignUp
        : isVerify
          ? handleVerifySignUp
          : handleVerifyMfa;

    const primaryLabel = isSignin ? "Sign in" : isSignup ? "Sign up" : "Verify";

    return (
      <Animated.View
        style={[styles.formCard, { paddingBottom: insets.bottom + 16, opacity: btnsOpacity }]}
      >
        <View style={styles.formHeaderRow}>
          <Pressable
            hitSlop={12}
            onPress={() => resetForm(isVerify ? "signup" : isMfa ? "signin" : "landing")}
            disabled={busy}
            style={styles.backBtn}
          >
            <Feather name="chevron-left" size={24} color="#ffffff" />
          </Pressable>
        </View>

        <Text style={styles.formTitle}>{title}</Text>
        <Text style={styles.formSubtitle}>{subtitle}</Text>

        {(isSignin || isSignup) && (
          <>
            {renderField("Email", emailAddress, setEmailAddress, {
              placeholder: "you@example.com",
              keyboardType: "email-address",
              error: emailFieldError,
              autoFocus: true,
            })}
            {renderField("Password", password, setPassword, {
              placeholder: isSignup ? "Create a password" : "Enter your password",
              secure: true,
              error: passwordFieldError,
            })}
          </>
        )}

        {(isVerify || isMfa) &&
          renderField("Verification code", code, setCode, {
            placeholder: "123456",
            keyboardType: "numeric",
            error: codeFieldError,
            autoFocus: true,
          })}

        {globalError ? (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={16} color="#fff" />
            <Text style={styles.errorBannerText}>{globalError}</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.btn,
            styles.primaryBtn,
            primaryDisabled && styles.btnDisabled,
            pressed && styles.pressed,
          ]}
          onPress={onPrimary}
          disabled={primaryDisabled}
        >
          {busy ? (
            <ActivityIndicator color="#1763A6" />
          ) : (
            <Text style={[styles.btnText, styles.primaryBtnText]}>{primaryLabel}</Text>
          )}
        </Pressable>

        {(isVerify || isMfa) && (
          <Pressable
            onPress={isVerify ? handleResendCode : () => signIn.mfa.sendEmailCode()}
            disabled={busy}
            style={styles.linkBtn}
          >
            <Text style={styles.linkBtnText}>Resend code</Text>
          </Pressable>
        )}

        {isSignin && (
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>New to SplitEasy? </Text>
            <Pressable onPress={() => resetForm("signup")} disabled={busy}>
              <Text style={styles.switchLink}>Create an account</Text>
            </Pressable>
          </View>
        )}
        {isSignup && (
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Already have an account? </Text>
            <Pressable onPress={() => resetForm("signin")} disabled={busy}>
              <Text style={styles.switchLink}>Sign in</Text>
            </Pressable>
          </View>
        )}

        {/* Required for sign-up flows — Clerk's bot protection is enabled by default. */}
        <View nativeID="clerk-captcha" />
      </Animated.View>
    );
  };

  return (
    <LinearGradient colors={["#2B7BE0", "#1AAEC0", "#18C4AC"]} locations={[0, 0.52, 1]} style={styles.root}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.hero, { paddingTop: insets.top + 52 }]}>
            <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
              <View style={styles.logoContainer}>
                <View style={styles.logoBadge}>
                  <ForkIcon size={64} />
                </View>
                <View style={styles.logoGlow} />
              </View>
            </Animated.View>

            <Animated.View style={[styles.titleWrap, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}>
              <Text style={styles.appName}>SplitEasy</Text>
            </Animated.View>

            {mode === "landing" && (
              <>
                <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
                  Split expenses.{"\n"}No drama.
                </Animated.Text>
                <Animated.View style={[styles.pills, { opacity: pillsOpacity }]}>
                  {["Groups", "Settle Up", "Multi-Currency", "Recurring"].map((label) => (
                    <View key={label} style={styles.pill}>
                      <Text style={styles.pillText}>{label}</Text>
                    </View>
                  ))}
                </Animated.View>
              </>
            )}
          </View>

          {!authLoaded ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#ffffff" size="large" />
            </View>
          ) : mode === "landing" ? (
            renderLanding()
          ) : (
            renderForm()
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "space-between" },

  hero: { alignItems: "center", paddingHorizontal: 24 },

  logoContainer: { alignItems: "center", justifyContent: "center", marginBottom: 24 },
  logoBadge: {
    width: 112,
    height: 112,
    borderRadius: 32,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 18,
  },
  logoGlow: {
    position: "absolute",
    width: 144,
    height: 144,
    borderRadius: 72,
    backgroundColor: "rgba(255,255,255,0.18)",
    zIndex: -1,
  },

  titleWrap: { marginBottom: 10 },
  appName: {
    fontSize: 44,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
    letterSpacing: -1.4,
    textShadowColor: "rgba(0,0,0,0.1)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },

  tagline: {
    fontSize: 20,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.78)",
    textAlign: "center",
    lineHeight: 29,
    marginBottom: 24,
    marginTop: 4,
  },

  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  pill: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 5,
  },
  pillText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.9)" },

  loadingWrap: { paddingVertical: 60, alignItems: "center" },

  authSection: { paddingHorizontal: 20, gap: 10, paddingTop: 24 },

  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 54,
    borderRadius: 15,
    gap: 10,
  },
  pressed: { opacity: 0.82 },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },

  googleBtn: { backgroundColor: "#ffffff" },
  googleBtnText: { color: "#1F2937" },
  googleIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#4285F4",
    alignItems: "center",
    justifyContent: "center",
  },
  googleGlyph: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },

  emailBtn: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
  },
  emailBtnText: { color: "#ffffff" },

  phoneBtn: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },

  primaryBtn: { backgroundColor: "#ffffff", marginTop: 4 },
  primaryBtnText: { color: "#1763A6" },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  dividerLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)" },

  footer: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.38)",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },
  footerLink: { color: "rgba(255,255,255,0.65)", fontFamily: "Inter_500Medium" },

  // ── Form ──
  formCard: { paddingHorizontal: 20, paddingTop: 28, gap: 14 },
  formHeaderRow: { flexDirection: "row", alignItems: "center" },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  formTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#ffffff", letterSpacing: -0.5 },
  formSubtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
    marginTop: -6,
    marginBottom: 4,
  },

  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.85)" },
  input: {
    height: 52,
    borderRadius: 13,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.28)",
    color: "#ffffff",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  inputError: { borderColor: "#FECACA" },
  fieldError: { fontSize: 12.5, fontFamily: "Inter_500Medium", color: "#FECACA" },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(214,69,69,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 12,
    padding: 12,
  },
  errorBannerText: { flex: 1, fontSize: 13.5, fontFamily: "Inter_500Medium", color: "#ffffff", lineHeight: 19 },

  linkBtn: { alignItems: "center", paddingVertical: 6 },
  linkBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.9)" },

  switchRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 4 },
  switchText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" },
  switchLink: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#ffffff" },
});
