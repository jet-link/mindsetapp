"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { login, register } from "@/lib/api";

export default function LoginPage() {
  useEffect(() => {
    document.title = "Log in | Mindset";
  }, []);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const router = useRouter();

  const usernameMissing = touched && !username.trim();
  const emailMissing = touched && mode === "register" && !email.trim();
  const passwordMissing = touched && !password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError("");
    // Клиентская валидация: пустые поля только подсвечиваем красным,
    // без текстовой подсказки под полями.
    if (!username.trim() || !password || (mode === "register" && !email.trim())) {
      return;
    }
    try {
      if (mode === "register") {
        await register(username, email, password);
      }
      await login(username, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <form className="form-page" onSubmit={submit} noValidate>
      <h1>{mode === "login" ? "Log in" : "Sign up"}</h1>

      {/* sr-only: метки скрыты визуально, но доступны скринридерам и аудиту */}
      <label className="sr-only" htmlFor="login-username">
        Username
      </label>
      <input
        id="login-username"
        name="username"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        className={usernameMissing ? "input-error" : ""}
        aria-invalid={usernameMissing}
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
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className={emailMissing ? "input-error" : ""}
            aria-invalid={emailMissing}
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
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        className={passwordMissing ? "input-error" : ""}
        aria-invalid={passwordMissing}
      />

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <button className="btn" type="submit" style={{ alignSelf: "stretch", textAlign: "center" }}>
        {mode === "login" ? "Log in" : "Create account"}
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        style={{ alignSelf: "stretch", textAlign: "center" }}
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setTouched(false);
          setError("");
        }}
      >
        {mode === "login" ? "No account? Sign up" : "Already have an account? Log in"}
      </button>
    </form>
  );
}
