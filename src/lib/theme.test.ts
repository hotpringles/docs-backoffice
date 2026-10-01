import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { PREFERENCE_OPTIONS, THEME_IDS, THEMES, parsePreference, resolveTheme, themeInitScript, type ThemePreference } from "./theme";

describe("parsePreference", () => {
  it("있는 테마와 system은 그대로, 없거나 이상한 값은 system이다", () => {
    for (const id of THEME_IDS) expect(parsePreference(id)).toBe(id);
    expect(parsePreference("system")).toBe("system");
    for (const bad of [null, undefined, "", "Dark", "solarized", "constructor", "__proto__", 3, {}, ["dark"]]) {
      expect(parsePreference(bad), String(bad)).toBe("system");
    }
  });
});

describe("resolveTheme", () => {
  it("system이면 기기가 어두운 화면을 쓰는지에 따라 다크/라이트, 고른 테마는 기기 설정과 무관하다", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    for (const id of THEME_IDS) {
      expect(resolveTheme(id, true)).toBe(id);
      expect(resolveTheme(id, false)).toBe(id);
    }
  });
});

describe("선택지", () => {
  it("시스템, 라이트, 다크, Gruvbox 순서로 화면에 보인다", () => {
    expect(PREFERENCE_OPTIONS.map((option) => option.label)).toEqual(["시스템", "라이트", "다크", "Gruvbox"]);
    expect(PREFERENCE_OPTIONS.map((option) => option.value)).toEqual(["system", "light", "dark", "gruvbox"]);
  });
});

/** 첫 화면 전에 도는 스크립트를 가짜 브라우저에서 실행한다. */
function runInit({ stored, dark, storageThrows = false, hasMeta = true, extraMetaCount = 0 }: { stored: string | null; dark: boolean; storageThrows?: boolean; hasMeta?: boolean; extraMetaCount?: number }) {
  const attributes: Record<string, string> = {};
  const makeMeta = () => ({ content: "", setAttribute(name: string, value: string) { if (name === "content") this.content = value; } });
  const meta = makeMeta();
  const extraMetas = Array.from({ length: extraMetaCount }, makeMeta);
  const appended: unknown[] = [];
  const document = {
    documentElement: { setAttribute: (name: string, value: string) => { attributes[name] = value; } },
    querySelectorAll: () => (hasMeta ? [meta, ...extraMetas] : []),
    createElement: () => meta,
    head: { appendChild: (node: unknown) => appended.push(node) },
  };
  const localStorage = {
    getItem: () => {
      if (storageThrows) throw new Error("저장소를 쓸 수 없어요");
      return stored;
    },
  };
  runInNewContext(themeInitScript(), { document, localStorage, matchMedia: () => ({ matches: dark }) });
  return { attributes, themeColor: meta.content, extraColors: extraMetas.map((extra) => extra.content), created: appended.length > 0 };
}

describe("themeInitScript", () => {
  it("저장된 값이 없으면 기기 설정을 따른다", () => {
    expect(runInit({ stored: null, dark: true }).attributes).toEqual({ "data-theme": "dark", "data-theme-pref": "system" });
    expect(runInit({ stored: null, dark: false }).attributes).toEqual({ "data-theme": "light", "data-theme-pref": "system" });
  });

  it("고른 테마는 기기 설정과 무관하게 쓰고, 상단 색(theme-color)도 그 테마의 바탕색이다", () => {
    for (const id of THEME_IDS) {
      for (const dark of [true, false]) {
        const result = runInit({ stored: id, dark });
        expect(result.attributes["data-theme"], `${id}/${dark}`).toBe(id);
        expect(result.attributes["data-theme-pref"]).toBe(id);
        expect(result.themeColor).toBe(THEMES[id].background);
      }
    }
  });

  it("이상한 저장 값(prototype 이름 포함)은 system으로 본다", () => {
    for (const stored of ["Dark", "solarized", "constructor", "__proto__", "toString"]) {
      const result = runInit({ stored, dark: true });
      expect(result.attributes, stored).toEqual({ "data-theme": "dark", "data-theme-pref": "system" });
      expect(result.themeColor).toBe(THEMES.dark.background);
    }
  });

  it("저장소를 못 읽어도(사생활 보호 모드 등) 오류 없이 기기 설정을 따른다", () => {
    expect(runInit({ stored: null, dark: true, storageThrows: true }).attributes["data-theme"]).toBe("dark");
  });

  it("theme-color 태그가 여러 개여도 전부 같은 색으로 맞춘다(하나만 바꾸면 다른 하나가 라이트 색으로 남는다)", () => {
    const result = runInit({ stored: "dark", dark: false, extraMetaCount: 2 });
    expect(result.themeColor).toBe(THEMES.dark.background);
    expect(result.extraColors).toEqual([THEMES.dark.background, THEMES.dark.background]);
  });

  it("theme-color 태그가 없으면 만들어 붙인다", () => {
    const result = runInit({ stored: "gruvbox", dark: false, hasMeta: false });
    expect(result.created).toBe(true);
    expect(result.themeColor).toBe(THEMES.gruvbox.background);
  });

  it("스크립트의 규칙이 parsePreference/resolveTheme과 같다(같은 입력, 같은 결과)", () => {
    const stored: (string | null)[] = [null, "light", "dark", "gruvbox", "system", "x"];
    for (const value of stored) {
      for (const dark of [true, false]) {
        const expected = resolveTheme(parsePreference(value) as ThemePreference, dark);
        expect(runInit({ stored: value, dark }).attributes["data-theme"], `${value}/${dark}`).toBe(expected);
      }
    }
  });
});

describe("globals.css의 테마 블록", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  /** 선택자 하나가 만드는 블록 안의 변수 이름 → 값. */
  function tokensOf(selector: string): Record<string, string> {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    expect(match, `${selector} 블록이 있어야 해요`).not.toBeNull();
    const tokens: Record<string, string> = {};
    for (const line of (match?.[1] ?? "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[line[1]] = line[2].trim();
    return tokens;
  }

  const colorNames = (tokens: Record<string, string>) => Object.keys(tokens).filter((name) => !name.startsWith("--font-"));
  const base = tokensOf(":root");

  it("라이트(기본) 블록에 색 변수가 모두 있다", () => {
    expect(colorNames(base)).toEqual(expect.arrayContaining(["--bg", "--fg", "--muted", "--accent", "--on-accent", "--border", "--scrim"]));
  });

  for (const id of THEME_IDS.filter((theme) => theme !== "light")) {
    it(`${id} 테마는 라이트와 같은 색 변수를 하나도 빠짐없이 정의한다(빠지면 라이트 색이 섞여 보인다)`, () => {
      const tokens = tokensOf(`:root[data-theme="${id}"]`);
      expect(colorNames(tokens).sort()).toEqual(colorNames(base).sort());
    });
  }
});
