import { Feather } from "@expo/vector-icons";
import { FontAwesome } from "@expo/vector-icons";
import { useAuth, useSignIn, useSignUp, useSSO } from "@clerk/expo";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as AuthSession from "expo-auth-session";
import { Redirect, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  useWindowDimensions,
  Easing,
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
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedBrandMark } from "@/components/AnimatedBrandMark";
import { LandingShowcase } from "@/components/LandingShowcase";
import { BRAND_COLORS, BRAND_GRADIENT, PRODUCT_NAME, PRODUCT_TAGLINE, SPLIT_MARK_COLORS } from "@/constants/brand";

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

function GoogleIcon() {
  return (
    <Svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      accessibilityLabel="Google"
    >
      <Path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.14 3.57-8.85z"
      />
      <Path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.93l-3.87-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.1-6.72-4.94H1.3v3.1A12 12 0 0 0 12 24z"
      />
      <Path
        fill="#FBBC05"
        d="M5.28 14.28a7.22 7.22 0 0 1 0-4.56v-3.1H1.3a12 12 0 0 0 0 10.76l3.98-3.1z"
      />
      <Path
        fill="#EA4335"
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.3 6.62l3.98 3.1C6.23 6.87 8.88 4.77 12 4.77z"
      />
    </Svg>
  );
}

function AppleIcon() {
  return <FontAwesome name="apple" size={21} color="#FFFFFF" />;
}

/** A generic, user-safe message for unexpected auth failures. */
const GENERIC_ERROR = "Something went wrong. Please try again.";
const OAUTH_TIMEOUT_MS = 30000;

// Google and Apple need their own credentials in Clerk Production before they can work.
// Flip this to true once both are set up there.
const SOCIAL_SIGN_IN_ENABLED = false;

function getOAuthRedirectUrl() {
  if (Platform.OS === "web") {
    return AuthSession.makeRedirectUri();
  }

  // Expo Go cannot receive a custom app scheme. Standalone/development builds
  // use the scheme declared in app.json so the browser can return to the app.
  const isExpoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  return isExpoGo
    ? AuthSession.makeRedirectUri({ path: "oauth" })
    : AuthSession.makeRedirectUri({ scheme: "mobile", path: "oauth" });
}

async function withOAuthTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("oauth_timeout")),
          OAUTH_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function getOAuthErrorMessage(provider: string, error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    message.includes("strategy") ||
    message.includes("provider") ||
    message.includes("not enabled")
  ) {
    return `${provider} sign-in is not enabled for this app yet.`;
  }
  if (message === "oauth_timeout") {
    return `${provider} sign-in did not return to the app. Please try again.`;
  }
  return GENERIC_ERROR;
}

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  useWarmUpBrowser();
  // The sign-in screen must fit on one screen: shrink spacing on shorter phones.
  const { height: screenH } = useWindowDimensions();
  const compact = screenH < 860;
  const tiny = screenH < 700;

  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signIn, errors: signInErrors, fetchStatus: signInFetch } = useSignIn();
  const { signUp, errors: signUpErrors, fetchStatus: signUpFetch } = useSignUp();
  const { startSSOFlow } = useSSO();

  const [mode, setMode] = useState<Mode>("landing");
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [ssoBusy, setSsoBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    if (!authLoaded || isSignedIn) return;
    setMode("landing");
    setFormError(null);
    setPassword("");
    setCode("");
  }, [authLoaded, isSignedIn]);

  const busy =
    !authLoaded ||
    signInFetch === "fetching" ||
    signUpFetch === "fetching" ||
    ssoBusy ||
    finalizing;

  // ── Hero entrance animation ───────────────────────────────────────────
  const isWeb = Platform.OS === "web";
  const logoScale = useRef(new Animated.Value(isWeb ? 1 : 1.4)).current;
  const logoLift = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const titleY = useRef(new Animated.Value(isWeb ? 0 : 28)).current;
  const titleOpacity = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const taglineOpacity = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const btnsY = useRef(new Animated.Value(isWeb ? 0 : 56)).current;
  const btnsOpacity = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const footerOpacity = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const ambientMotion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isWeb) return;

    const run = (delay: number, anims: Animated.CompositeAnimation[]) =>
      Animated.sequence([Animated.delay(delay), Animated.parallel(anims)]).start();

    // "Draw" intro: the logo draws itself in the middle of the screen (AnimatedBrandMark,
    // about 1.6s), then glides up into place while the sign-in page builds around it.
    const badge = compact ? 88 : 112;
    const heroTop = insets.top + (tiny ? 10 : compact ? 18 : 40);
    logoLift.setValue(Math.max(0, screenH / 2 - (heroTop + badge / 2)));
    run(0, [Animated.timing(logoOpacity, { toValue: 1, duration: 250, useNativeDriver: true })]);
    run(1750, [
      Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }),
      Animated.timing(logoLift, { toValue: 0, duration: 600, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }),
    ]);
    run(2100, [
      Animated.timing(titleOpacity, { toValue: 1, duration: 360, useNativeDriver: true }),
      Animated.spring(titleY, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
    ]);
    run(2250, [Animated.timing(taglineOpacity, { toValue: 1, duration: 380, useNativeDriver: true })]);
    run(2650, [
      Animated.timing(btnsOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(btnsY, { toValue: 0, tension: 65, friction: 10, useNativeDriver: true }),
    ]);
    run(2900, [Animated.timing(footerOpacity, { toValue: 1, duration: 380, useNativeDriver: true })]);
  }, [isWeb]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ambientMotion, {
          toValue: 1,
          duration: 16000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(ambientMotion, {
          toValue: 0,
          duration: 16000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [ambientMotion]);

  const ambientPrimaryStyle = {
    opacity: ambientMotion.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.12, 0.2, 0.12],
    }),
    transform: [
      { translateX: ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [0, 36] }) },
      { translateY: ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }) },
      { scale: ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
    ],
  };
  const ambientSecondaryStyle = {
    opacity: ambientMotion.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.08, 0.14, 0.08],
    }),
    transform: [
      { translateX: ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [0, -42] }) },
      { translateY: ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) },
      { scale: ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1.02] }) },
    ],
  };

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
    setSsoBusy(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: getOAuthRedirectUrl(),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      } else {
        // Missing requirements (e.g. MFA) — not supported in-app yet.
        setFormError(
          "We couldn't complete Google sign-in. Please finish signing in on the web.",
        );
      }
    } catch (error) {
      console.error("Google sign-in failed", error);
      setFormError(
        Platform.OS === "web"
          ? "Google sign-in was blocked. Allow pop-ups for this preview and try again."
          : getOAuthErrorMessage("Google", error),
      );
    } finally {
      setSsoBusy(false);
    }
  }, [startSSOFlow]);

  const handleApple = useCallback(async () => {
    setFormError(null);
    setSsoBusy(true);
    try {
      const { createdSessionId, setActive } = await withOAuthTimeout(
        startSSOFlow({
          strategy: "oauth_apple",
          redirectUrl: getOAuthRedirectUrl(),
        }),
      );
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      } else {
        setFormError(
          "We couldn't complete Apple sign-in. Please finish signing in on the web.",
        );
      }
    } catch (error) {
      console.error("Apple sign-in failed", error);
      setFormError(
        Platform.OS === "web"
          ? "Apple sign-in was blocked. Allow pop-ups for this preview and try again."
          : getOAuthErrorMessage("Apple", error),
      );
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
        { paddingTop: compact ? 10 : 20, paddingBottom: insets.bottom + (compact ? 10 : 20), opacity: btnsOpacity, transform: [{ translateY: btnsY }] },
      ]}
    >
      {!authLoaded ? (
        <View style={styles.authLoadingRow}>
          <ActivityIndicator color="#FFFFFF" size="small" />
          <Text style={styles.authLoadingText}>Preparing secure sign-in…</Text>
        </View>
      ) : null}

      {formError ? (
        <View style={styles.errorBanner}>
          <Feather name="alert-circle" size={16} color="#fff" />
          <Text style={styles.errorBannerText}>{formError}</Text>
        </View>
      ) : null}

      {SOCIAL_SIGN_IN_ENABLED ? (
        <>
      <Pressable
        style={({ pressed }) => [styles.btn, compact && styles.btnCompact, styles.appleBtn, pressed && styles.pressed]}
        onPress={handleApple}
        disabled={busy}
        testID="apple-sign-in-button"
        accessibilityRole="button"
        accessibilityLabel="Continue with Apple"
      >
        {ssoBusy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <AppleIcon />
            <Text style={[styles.btnText, styles.appleBtnText]}>Continue with Apple</Text>
          </>
        )}
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.btn, compact && styles.btnCompact, styles.googleBtn, pressed && styles.pressed]}
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
        </>
      ) : null}

      <Pressable
        style={({ pressed }) => [styles.btn, compact && styles.btnCompact, styles.emailBtn, pressed && styles.pressed]}
        onPress={() => resetForm("signin")}
        disabled={busy}
      >
        <Feather name="mail" size={18} color="rgba(255,255,255,0.85)" />
        <Text style={[styles.btnText, styles.emailBtnText]}>Continue with Email</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.signupLink, pressed && styles.pressed]}
        onPress={() => resetForm("signup")}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={styles.signupLinkText}>
          New to Split Mate? <Text style={styles.signupLinkStrong}>Create an account</Text>
        </Text>
      </Pressable>

      <Animated.Text style={[styles.footer, { opacity: footerOpacity }]}>
        By continuing you agree to our{" "}
        <Text
          style={styles.footerLink}
          onPress={() => router.push("/legal/terms")}
          accessibilityRole="link"
          testID="terms-of-service-link"
        >
          Terms of Service
        </Text>
        {"  "}and{"  "}
        <Text
          style={styles.footerLink}
          onPress={() => router.push("/legal/privacy")}
          accessibilityRole="link"
          testID="privacy-policy-link"
        >
          Privacy Policy
        </Text>
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
      <View style={[styles.inputRow, opts.error ? styles.inputError : null]}>
        <TextInput
          style={styles.inputInner}
          value={value}
          onChangeText={onChangeText}
          placeholder={opts.placeholder}
          placeholderTextColor="rgba(255,255,255,0.5)"
          secureTextEntry={opts.secure && !showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={opts.keyboardType ?? "default"}
          autoFocus={opts.autoFocus}
          editable={!busy}
        />
        {opts.secure && (
          <Pressable
            onPress={() => setShowPassword(v => !v)}
            hitSlop={10}
            style={styles.eyeBtn}
          >
            <Feather
              name={showPassword ? "eye-off" : "eye"}
              size={18}
              color="rgba(255,255,255,0.6)"
            />
          </Pressable>
        )}
      </View>
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
           accessibilityRole="button" accessibilityLabel="Back">
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
          <ActivityIndicator color="#3D4148" />
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
            <Text style={styles.switchText}>New to {PRODUCT_NAME}? </Text>
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
    <View style={styles.root}>
      <LinearGradient
        colors={BRAND_GRADIENT}
        locations={[0, 0.54, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.ambientLayer}>
        <Animated.View
          style={[styles.ambientOrbPrimary, { backgroundColor: BRAND_COLORS.silver }, ambientPrimaryStyle]}
        />
        <Animated.View
          style={[styles.ambientOrbSecondary, { backgroundColor: BRAND_COLORS.silverBright }, ambientSecondaryStyle]}
        />
        <View style={styles.ambientVignette} />
      </View>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          scrollEnabled={mode !== "landing"}
          bounces={mode !== "landing"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.hero, { paddingTop: insets.top + (mode !== "landing" ? 6 : tiny ? 10 : compact ? 18 : 40) }]}>
            <Animated.View style={{ opacity: logoOpacity, transform: [{ translateY: logoLift }, { scale: logoScale }], zIndex: 2 }}>
              <View style={[styles.logoContainer, (compact || mode !== "landing") && { marginBottom: 6 }]}>
                <View style={[styles.logoBadge, (compact || mode !== "landing") && styles.logoBadgeCompact]}>
                   <AnimatedBrandMark
                     size={mode !== "landing" ? 40 : compact ? 64 : 84}
                     primary={SPLIT_MARK_COLORS.primary}
                     secondary={SPLIT_MARK_COLORS.secondary}
                     detail={SPLIT_MARK_COLORS.seam}
                     outline={SPLIT_MARK_COLORS.outline}
                   />
                </View>
              </View>
            </Animated.View>

            <Animated.View style={[styles.titleWrap, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}>
               <Text style={[styles.appName, compact && { fontSize: 36 }, mode !== "landing" && { fontSize: 24 }]}>{PRODUCT_NAME}</Text>
            </Animated.View>

            {mode === "landing" && (
              <>
                <Animated.Text style={[styles.tagline, compact && styles.taglineCompact, { opacity: taglineOpacity }]}>
                   {PRODUCT_TAGLINE}
                </Animated.Text>
                {tiny ? null : <LandingShowcase count={compact ? 2 : 3} delay={isWeb ? 0 : 2400} />}
              </>
            )}
          </View>

          {mode === "landing" ? (
            renderLanding()
          ) : (
            renderForm()
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#04404A" },
  ambientLayer: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  ambientOrbPrimary: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 170,
    top: -170,
    right: -125,
    backgroundColor: "#8D929A",
  },
  ambientOrbSecondary: {
    position: "absolute",
    width: 290,
    height: 290,
    borderRadius: 145,
    top: 300,
    left: -165,
    backgroundColor: "#D2D5D9",
  },
  ambientVignette: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(20,10,80,0.10)",
  },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "space-between" },

  hero: { alignItems: "center", paddingHorizontal: 24 },

  logoContainer: { alignItems: "center", justifyContent: "center", marginBottom: 24 },
  logoBadge: {
    width: 112,
    height: 112,
    borderRadius: 30,
    backgroundColor: SPLIT_MARK_COLORS.tile,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 18,
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

  authLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 18,
  },
  authLoadingText: { color: "rgba(255,255,255,0.72)", fontSize: 13, fontFamily: "Inter_500Medium" },

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
  btnCompact: { height: 48 },
  logoBadgeCompact: { width: 88, height: 88, borderRadius: 24 },
  taglineCompact: { fontSize: 17, lineHeight: 24, marginBottom: 6 },
  signupLink: { alignItems: "center", paddingVertical: 8 },
  signupLinkText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
  signupLinkStrong: { fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },

  appleBtn: {
    backgroundColor: "#0B0C0D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  appleBtnText: { color: "#FFFFFF" },
  googleBtn: { backgroundColor: "#ffffff" },
  googleBtnText: { color: "#1F2937" },

  emailBtn: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.36)",
  },
  emailBtnText: { color: "#ffffff" },

  phoneBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },

  primaryBtn: { backgroundColor: "#ffffff", marginTop: 4 },
  primaryBtnText: { color: "#0A5A5E" },

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
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderRadius: 13,
    paddingLeft: 16,
    paddingRight: 8,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.28)",
  },
  inputInner: {
    flex: 1,
    color: "#ffffff",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    height: "100%",
  },
  eyeBtn: {
    padding: 8,
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
