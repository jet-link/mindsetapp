"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LoginError,
  RegisterError,
  RegisterFieldErrors,
  login,
  register,
} from "@/lib/api";

type AuthErrorKind = "user_not_found" | "password_incorrect" | null;
type RegisterField = keyof RegisterFieldErrors;

export default function LoginPage() {
  useEffect(() => {
    document.title = "Log in | Mindset";
    // Из CTA-баннера гостя ведём сразу в режим регистрации (?mode=signup).
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "signup" || mode === "register") setMode("register");
  }, []);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [authErrorKind, setAuthErrorKind] = useState<AuthErrorKind>(null);
  const [registerErrors, setRegisterErrors] = useState<RegisterFieldErrors>({});
  const [showEmptyErrors, setShowEmptyErrors] = useState(false);
  const router = useRouter();

  const usernameMissing = showEmptyErrors && !username.trim();
  const emailMissing = showEmptyErrors && mode === "register" && !email.trim();
  const passwordMissing = showEmptyErrors && !password;

  const usernameInvalid =
    usernameMissing ||
    (mode === "login" && authErrorKind === "user_not_found") ||
    (mode === "register" && !!registerErrors.username);
  const emailInvalid =
    emailMissing || (mode === "register" && !!registerErrors.email);
  const passwordInvalid =
    passwordMissing ||
    (mode === "login" &&
      (authErrorKind === "user_not_found" || authErrorKind === "password_incorrect")) ||
    (mode === "register" && !!registerErrors.password);

  const registerMessages = Object.values(registerErrors).filter(Boolean);
  const errorText =
    mode === "register"
      ? registerMessages.length
        ? registerMessages.join("\n")
        : error
      : error;

  function clearAllErrors() {
    setAuthErrorKind(null);
    setRegisterErrors({});
    setError("");
    setShowEmptyErrors(false);
  }

  function clearRegisterField(field: RegisterField) {
    setRegisterErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function onUsernameChange(value: string) {
    setUsername(value);
    if (mode === "register") {
      clearRegisterField("username");
      return;
    }
    if (authErrorKind === "password_incorrect") {
      clearAllErrors();
      return;
    }
    if (authErrorKind === "user_not_found" && value.trim()) {
      clearAllErrors();
    }
  }

  function onEmailChange(value: string) {
    setEmail(value);
    clearRegisterField("email");
  }

  function onPasswordChange(value: string) {
    setPassword(value);
    if (mode === "register") {
      clearRegisterField("password");
      return;
    }
    if (authErrorKind === "password_incorrect") {
      clearAllErrors();
      return;
    }
    if (authErrorKind === "user_not_found" && value) {
      clearAllErrors();
    }
  }

  function toggleMode() {
    // Каждый переход login <-> register должен быть чистым.
    setMode(mode === "login" ? "register" : "login");
    setUsername("");
    setEmail("");
    setPassword("");
    clearAllErrors();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAuthErrorKind(null);
    setRegisterErrors({});
    setError("");
    setShowEmptyErrors(true);
    if (!username.trim() || !password || (mode === "register" && !email.trim())) {
      return;
    }
    try {
      if (mode === "register") {
        await register(username, email, password);
      }
      await login(username, password, remember);
      router.push("/");
    } catch (err) {
      if (mode === "login" && err instanceof LoginError) {
        setAuthErrorKind(err.code);
        setError(err.message);
        setShowEmptyErrors(false);
      } else if (mode === "register" && err instanceof RegisterError) {
        setRegisterErrors(err.fields);
        setShowEmptyErrors(false);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    }
  }

  return (
    <form className="form-page" onSubmit={submit} noValidate>
      <h1>{mode === "login" ? "Log in" : "Sign up"}</h1>

      <label className="sr-only" htmlFor="login-username">
        Username
      </label>
      <input
        id="login-username"
        name="username"
        placeholder="Username"
        value={username}
        onChange={(e) => onUsernameChange(e.target.value)}
        autoComplete="username"
        className={usernameInvalid ? "input-error" : ""}
        aria-invalid={usernameInvalid}
      />

      {mode === "register" && (
        <>
          <label className="sr-only" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            name="email"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            autoComplete="email"
            className={emailInvalid ? "input-error" : ""}
            aria-invalid={emailInvalid}
          />
        </>
      )}

      <label className="sr-only" htmlFor="login-password">
        Password
      </label>
      <input
        id="login-password"
        name="password"
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        className={passwordInvalid ? "input-error" : ""}
        aria-invalid={passwordInvalid}
      />

      {mode === "login" && (
        <label className="remember-me">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>Remember me</span>
        </label>
      )}

      {errorText && (
        <div className="error" role="alert">
          {errorText}
        </div>
      )}

      <button className="btn" type="submit" style={{ alignSelf: "stretch", textAlign: "center" }}>
        {mode === "login" ? "Log in" : "Create account"}
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        style={{ alignSelf: "stretch", textAlign: "center" }}
        onClick={toggleMode}
      >
        {mode === "login" ? "No account? Sign up" : "Already have an account? Log in"}
      </button>
    </form>
  );
}
