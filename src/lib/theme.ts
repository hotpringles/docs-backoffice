/**
 * 화면 테마. 색은 globals.css의 `:root[data-theme="..."]` 블록이 정하고, 여기서는 어떤 테마가 있는지와
 * 사용자가 고른 값(기기에 저장)을 실제 테마로 바꾸는 규칙만 둔다. 서버·브라우저 어디서나 쓰는 순수한 코드다.
 */
export const THEME_IDS = ["light", "dark", "gruvbox"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** 사용자가 고른 값. "system"은 기기(브라우저)의 밝은/어두운 설정을 따른다. */
export type ThemePreference = ThemeId | "system";

export const THEME_STORAGE_KEY = "theme";

export const THEMES: Record<ThemeId, { label: string; /** 브라우저 주소창·상태 표시줄 색(theme-color) */ background: string; scheme: "light" | "dark" }> = {
  light: { label: "라이트", background: "#fcfcfa", scheme: "light" },
  dark: { label: "다크", background: "#1b1c1f", scheme: "dark" },
  gruvbox: { label: "Gruvbox", background: "#282828", scheme: "dark" },
};

/** 화면에 보이는 선택지 순서. */
export const PREFERENCE_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "시스템" },
  ...THEME_IDS.map((id) => ({ value: id, label: THEMES[id].label })),
];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

/** 저장된 값이 없거나 이상하면 "system"이다. */
export function parsePreference(raw: unknown): ThemePreference {
  return isThemeId(raw) ? raw : "system";
}

/** 고른 값을 실제로 쓸 테마로 바꾼다. "system"이면 기기가 어두운 화면을 쓰는지(prefersDark)에 따라 다크/라이트. */
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ThemeId {
  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

/**
 * 첫 화면이 그려지기 전에 테마를 적용하는 짧은 스크립트(<head>에 그대로 넣는다). 서버가 만든 HTML은 라이트인데,
 * 이 스크립트가 없으면 어두운 테마를 쓰는 사람에게 흰 화면이 번쩍인 뒤 바뀐다. 오류가 나도 화면이 멈추지 않도록 try로 감쌌다.
 * 규칙은 위의 parsePreference/resolveTheme과 같아야 하고, theme.test.ts가 같은 입력으로 둘을 비교한다.
 */
export function themeInitScript(): string {
  const backgrounds = Object.fromEntries(THEME_IDS.map((id) => [id, THEMES[id].background]));
  return `(function(){try{var bg=${JSON.stringify(backgrounds)};var raw=null;try{raw=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});}catch(e){}var pref=raw&&Object.prototype.hasOwnProperty.call(bg,raw)?raw:"system";var dark=false;try{dark=matchMedia("(prefers-color-scheme: dark)").matches;}catch(e){}var theme=pref==="system"?(dark?"dark":"light"):pref;var root=document.documentElement;root.setAttribute("data-theme",theme);root.setAttribute("data-theme-pref",pref);var metas=document.querySelectorAll('meta[name="theme-color"]');if(!metas.length){var meta=document.createElement("meta");meta.setAttribute("name","theme-color");document.head.appendChild(meta);metas=[meta];}for(var i=0;i<metas.length;i++){metas[i].setAttribute("content",bg[theme]);}}catch(e){}})();`;
}
