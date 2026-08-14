import { useEffect, useState, type FormEvent } from "react";

import { authClient } from "../auth/auth-client.ts";

type Status = { kind: "idle" | "success" | "error"; message: string };

const initialStatus: Status = {
  kind: "idle",
  message: "Use the controls below to exercise the real Better Auth client.",
};

export function TestbedDashboard() {
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<Status>(initialStatus);

  useEffect(() => setHydrated(true), []);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    if (typeof email !== "string" || typeof password !== "string") {
      setStatus({ kind: "error", message: "Email and password are required" });
      return;
    }
    const result = await authClient.signUp.email({ email, name: "Testbed Player", password });
    setStatus(
      result.error
        ? { kind: "error", message: result.error.message ?? "Sign-up failed" }
        : { kind: "success", message: `Signed in as ${result.data.user.email}` },
    );
  }

  async function checkSession() {
    const result = await authClient.getSession();
    setStatus(
      result.error || !result.data
        ? { kind: "error", message: result.error?.message ?? "No active session" }
        : { kind: "success", message: `Active session: ${result.data.user.email}` },
    );
  }

  async function signOut() {
    const result = await authClient.signOut();
    setStatus(
      result.error
        ? { kind: "error", message: result.error.message ?? "Sign-out failed" }
        : { kind: "success", message: "Signed out" },
    );
  }

  return (
    <main>
      <header className="hero">
        <p className="eyebrow">Real consumer application</p>
        <h1>Homestead Better Auth Testbed</h1>
        <p>
          TanStack Start, React, Bun, and every Homestead plugin running in one Better Auth
          instance.
        </p>
      </header>

      <section aria-label="Test status" className={`status status-${status.kind}`}>
        {status.message}
      </section>

      <section className="auth-panel">
        <div>
          <p className="eyebrow">Core authentication</p>
          <h2>Create a test player</h2>
        </div>
        <form onSubmit={createAccount}>
          <label>
            Email
            <input defaultValue="player@homestead.test" name="email" required type="email" />
          </label>
          <label>
            Password
            <input
              defaultValue="Testbed-password-123"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>
          <button disabled={!hydrated} type="submit">
            Create account
          </button>
        </form>
        <div className="actions">
          <button onClick={checkSession} type="button">
            Check session
          </button>
          <button className="secondary" onClick={signOut} type="button">
            Sign out
          </button>
        </div>
      </section>

      <section aria-label="Installed plugins" className="plugin-grid">
        <PluginCard
          description="OpenID sign-in, explicit account linking, profile synchronization, and safe unlinking."
          name="Steam"
          paths={["POST /sign-in/steam", "POST /link-social/steam"]}
        />
        <PluginCard
          description="CFX Discourse user API authentication, linking, encrypted credentials, and revocation."
          name="CFX"
          paths={["POST /cfx/initiate", "GET /cfx/status"]}
        />
        <PluginCard
          description="Catalog, checkout, signed webhooks, billing state, and durable entitlements."
          name="Tebex"
          paths={["GET /tebex/packages", "POST /tebex/checkout"]}
        />
      </section>
    </main>
  );
}

function PluginCard({
  description,
  name,
  paths,
}: {
  description: string;
  name: string;
  paths: string[];
}) {
  return (
    <article className="plugin-card">
      <div className="plugin-title">
        <span aria-hidden="true" className="plugin-dot" />
        <h2>{name}</h2>
      </div>
      <p>{description}</p>
      <ul>
        {paths.map((path) => (
          <li key={path}>
            <code>{path}</code>
          </li>
        ))}
      </ul>
    </article>
  );
}
