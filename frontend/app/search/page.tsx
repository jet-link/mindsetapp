import { Suspense } from "react";
import SearchPage from "./search-page";
import TranslatedMessage from "@/components/TranslatedMessage";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main>
          <TranslatedMessage ns="common" k="loading" className="muted page-status" />
        </main>
      }
    >
      <SearchPage />
    </Suspense>
  );
}
