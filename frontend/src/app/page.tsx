"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";

type HealthState =
  | { status: "checking" }
  | { status: "ok" }
  | { status: "error"; message: string };

export default function Home() {
  const [health, setHealth] = useState<HealthState>({ status: "checking" });

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE_URL}/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(() => {
        if (!cancelled) setHealth({ status: "ok" });
      })
      .catch((err: Error) => {
        if (!cancelled) setHealth({ status: "error", message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Company Brain</h1>
      <p className="text-sm text-gray-500">API: {API_BASE_URL}</p>
      <div className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm">
        <span
          className={`h-2 w-2 rounded-full ${
            health.status === "ok"
              ? "bg-green-500"
              : health.status === "error"
                ? "bg-red-500"
                : "bg-gray-400"
          }`}
        />
        {health.status === "checking" && "Checking backend..."}
        {health.status === "ok" && "Backend healthy"}
        {health.status === "error" && `Backend unreachable: ${health.message}`}
      </div>
    </main>
  );
}
