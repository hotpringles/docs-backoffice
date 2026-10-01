import { THEMES, THEME_STORAGE_KEY, isThemeId, parsePreference, resolveTheme, type ThemeId, type ThemePreference } from "./theme";

/**
 * 브라우저에서 테마를 읽고 적용하는 함수들(클라이언트 컴포넌트에서만 부른다).
 * 처음 화면의 테마는 <head>의 스크립트(themeInitScript)가 정하고, 이후 바꾸는 일은 여기서 한다.
 */
const CHANGE_EVENT = "themechange";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** 이 기기에 저장된 선택. 없거나 저장소를 못 쓰면 "system". */
export function readStoredPreference(): ThemePreference {
  try {
    return parsePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

/** 지금 화면에 적용된 테마. 아직 정해지지 않았으면 라이트. */
export function currentTheme(): ThemeId {
  const value = document.documentElement.getAttribute("data-theme");
  return isThemeId(value) ? value : "light";
}

/** 선택을 화면에 적용한다(html의 data-theme, 브라우저 상단 색). 적용한 테마를 돌려준다. */
export function applyPreference(preference: ThemePreference): ThemeId {
  const theme = resolveTheme(preference, window.matchMedia(DARK_QUERY).matches);
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-theme-pref", preference);
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", THEMES[theme].background));
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return theme;
}

/** 선택을 이 기기에 저장하고 바로 적용한다. 저장소를 못 써도(사생활 보호 모드 등) 이번 방문에는 적용된다. */
export function savePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // 저장은 못 해도 화면은 바꾼다.
  }
  applyPreference(preference);
}

/**
 * 테마가 바뀌면 알려 준다: 이 화면에서 바꿨을 때, 다른 탭에서 바꿨을 때, 그리고 "시스템"을 고른 경우 기기의
 * 밝은/어두운 설정이 바뀌었을 때(이때는 화면도 따라 바꾼다).
 */
export function subscribeTheme(callback: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  const onMedia = () => {
    if (readStoredPreference() === "system") applyPreference("system");
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    applyPreference(readStoredPreference());
  };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onMedia);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onMedia);
  };
}
