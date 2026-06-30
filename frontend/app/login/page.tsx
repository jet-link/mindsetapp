"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  LoginError,
  RegisterError,
  RegisterFieldErrors,
  login,
  register,
} from "@/lib/api";
import { setPageTitle } from "@/components/RouteTitle";
import GoogleIcon from "@/components/GoogleIcon";

type AuthErrorKind = "user_not_found" | "password_incorrect" | null;
type RegisterField = keyof RegisterFieldErrors;

export default function LoginPage() {
  const { t } = useTranslation("auth");
  useEffect(() => {
    setPageTitle(t("login"));
    // Из CTA-баннера гостя ведём сразу в режим регистрации (?mode=signup).
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "signup" || mode === "register") setMode("register");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [authErrorKind, setAuthErrorKind] = useState<AuthErrorKind>(null);
  const [registerErrors, setRegisterErrors] = useState<RegisterFieldErrors>({});
  const [showEmptyErrors, setShowEmptyErrors] = useState(false);
  const router = useRouter();

  const usernameMissing = showEmptyErrors && !username.trim();
  const emailMissing = showEmptyErrors && mode === "register" && !email.trim();
  const passwordMissing = showEmptyErrors && !password;

  // Текст ошибки для каждого поля — показывается строго под своим input.
  const usernameError = usernameMissing
    ? t("fieldRequired")
    : mode === "login" && authErrorKind === "user_not_found"
      ? error
      : mode === "register"
        ? registerErrors.username ?? ""
        : "";
  const emailError =
    mode !== "register"
      ? ""
      : emailMissing
        ? t("fieldRequired")
        : registerErrors.email ?? "";
  const passwordError = passwordMissing
    ? t("fieldRequired")
    : mode === "login" && authErrorKind === "password_incorrect"
      ? error
      : mode === "register"
        ? registerErrors.password ?? ""
        : "";

  const usernameInvalid = !!usernameError;
  const emailInvalid = !!emailError;
  const passwordInvalid = !!passwordError;

  // Общая (не привязанная к полю) ошибка: сеть, «что-то пошло не так» и т.п.
  // В login она появляется, только если это не ошибка конкретного поля.
  const genericError = mode === "login" && authErrorKind ? "" : error;

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
        setError(err instanceof Error ? err.message : t("somethingWrong"));
      }
    }
  }

  return (
    <form className="form-page" onSubmit={submit} noValidate>
      <h1>{mode === "login" ? t("login") : t("signup")}</h1>

      <div className="form-field">
        <label className="sr-only" htmlFor="login-username">
          {t("username")}
        </label>
        <input
          id="login-username"
          name="username"
          placeholder={t("username")}
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          autoComplete="username"
          className={usernameInvalid ? "input-error" : ""}
          aria-invalid={usernameInvalid}
          aria-describedby={usernameError ? "login-username-error" : undefined}
        />
        {usernameError && (
          <p className="field-error" id="login-username-error" role="alert">
            {usernameError}
          </p>
        )}
      </div>

      {mode === "register" && (
        <div className="form-field">
          <label className="sr-only" htmlFor="login-email">
            {t("email")}
          </label>
          <input
            id="login-email"
            name="email"
            placeholder={t("email")}
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            autoComplete="email"
            className={emailInvalid ? "input-error" : ""}
            aria-invalid={emailInvalid}
            aria-describedby={emailError ? "login-email-error" : undefined}
          />
          {emailError && (
            <p className="field-error" id="login-email-error" role="alert">
              {emailError}
            </p>
          )}
        </div>
      )}

      <div className="form-field">
        <div className={`password-field${passwordInvalid ? " password-field--error" : ""}`}>
          <label className="sr-only" htmlFor="login-password">
            {t("password")}
          </label>
          <input
            id="login-password"
            name="password"
            placeholder={t("password")}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className={passwordInvalid ? "input-error" : ""}
            aria-invalid={passwordInvalid}
            aria-describedby={passwordError ? "login-password-error" : undefined}
          />
          <button
            type="button"
            className="password-field__toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            title={showPassword ? t("hidePassword") : t("showPassword")}
          >
            <i
              key={showPassword ? "hide" : "show"}
              className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`}
              aria-hidden="true"
            />
          </button>
        </div>
        {passwordError && (
          <p className="field-error" id="login-password-error" role="alert">
            {passwordError}
          </p>
        )}
      </div>

      {mode === "login" && (
        <p className="form-page__forgot">
          <a href="#">{t("forgotPassword")}</a>
        </p>
      )}

      {/* Remember me — скрыто
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
      */}

      {genericError && (
        <div className="error" role="alert">
          {genericError}
        </div>
      )}

      <button className="btn" type="submit" style={{ alignSelf: "stretch", textAlign: "center" }}>
        {mode === "login" ? t("login") : t("createAccount")}
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        style={{ alignSelf: "stretch", textAlign: "center" }}
        onClick={toggleMode}
      >
        {mode === "login" ? t("noAccountSignup") : t("haveAccountLogin")}
      </button>

      <div className="auth-divider" aria-hidden="true">
        <span>{t("or")}</span>
      </div>

      <button
        type="button"
        className="btn btn--ghost btn--google"
        aria-label={mode === "login" ? t("loginWithGoogle") : t("signupWithGoogle")}
      >
        <GoogleIcon />
        {mode === "login" ? t("loginWithGoogle") : t("signupWithGoogle")}
      </button>
    </form>
  );
}
