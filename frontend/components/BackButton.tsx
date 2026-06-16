"use client";

import { useRouter } from "next/navigation";

export default function BackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="back-btn"
      aria-label="Go back"
      title="Back"
      onClick={() => {
        // history.back() мгновенно восстанавливает позицию скролла
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push("/");
        }
      }}
    >
      <i className="fa fa-arrow-left" aria-hidden="true" />
    </button>
  );
}
