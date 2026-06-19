import { Suspense } from "react";
import SearchPage from "./search-page";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main>
          <p className="muted page-status">Loading…</p>
        </main>
      }
    >
      <SearchPage />
    </Suspense>
  );
}
