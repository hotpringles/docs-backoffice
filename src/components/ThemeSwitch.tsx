"use client";

import { useSyncExternalStore } from "react";
import { PREFERENCE_OPTIONS, parsePreference, type ThemePreference } from "@/lib/theme";
import { readStoredPreference, savePreference, subscribeTheme } from "@/lib/theme-dom";

const serverPreference = (): ThemePreference => "system";

/** 머리글의 테마 고르기(시스템, 라이트, 다크, Gruvbox). 고른 값은 이 기기에 저장된다. */
export function ThemeSwitch() {
  // 서버는 저장된 값을 모르므로 "시스템"으로 그리고, 브라우저가 이어받은 뒤 실제 저장된 값으로 바뀐다.
  const preference = useSyncExternalStore(subscribeTheme, readStoredPreference, serverPreference);

  return (
    <select
      className="theme-select"
      aria-label="화면 테마"
      title="화면 테마"
      value={preference}
      onChange={(event) => savePreference(parsePreference(event.target.value))}
    >
      {PREFERENCE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
