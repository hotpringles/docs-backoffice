import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_IDS, THEMES, type ThemeId } from "./theme";

const css = readFileSync("src/app/globals.css", "utf8");

function tokensOf(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  const tokens: Record<string, string> = {};
  for (const line of (match?.[1] ?? "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[line[1]] = line[2].trim();
  return tokens;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 대비(1~21). 본문 글자는 4.5 이상이어야 읽기 편하다. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// [글자색 변수, 바탕색 변수]
const PAIRS: [string, string][] = [
  ["--fg", "--bg"],
  ["--fg", "--bg-soft"],
  ["--fg", "--bg-head"],
  ["--muted", "--bg"],
  ["--muted", "--bg-soft"],
  ["--accent", "--bg"],
  ["--accent", "--bg-soft"],
  ["--on-accent", "--accent"],
  ["--danger", "--bg"],
  ["--ok", "--bg"],
  ["--fg", "--banner-bg"],
  ["--fg", "--error-bg"],
  ["--event-fg", "--event-bg"],
  ["--meetup-fg", "--meetup-bg"],
  ["--fg", "--heat-1"],
  ["--fg", "--heat-2"],
  ["--heat-3-fg", "--heat-3"],
  ["--heat-4-fg", "--heat-4"],
];

function tokensFor(id: ThemeId): Record<string, string> {
  return id === "light" ? tokensOf(":root") : tokensOf(`:root[data-theme="${id}"]`);
}

describe("테마별 글자 대비", () => {
  for (const id of THEME_IDS) {
    it(`${id}: 글자와 바탕의 짝이 모두 대비 4.5 이상이다`, () => {
      const tokens = tokensFor(id);
      const failures: string[] = [];
      for (const [text, background] of PAIRS) {
        const fg = tokens[text];
        const bg = tokens[background];
        if (!/^#[0-9a-f]{6}$/i.test(fg ?? "") || !/^#[0-9a-f]{6}$/i.test(bg ?? "")) {
          failures.push(`${text} / ${background}: 6자리 #색이 아니에요 (${fg}, ${bg})`);
          continue;
        }
        const ratio = contrast(fg, bg);
        if (ratio < 4.5) failures.push(`${text} ${fg} on ${background} ${bg} = ${ratio.toFixed(2)}`);
      }
      expect(failures).toEqual([]);
    });

    it(`${id}: 브라우저 상단 색(theme-color)이 그 테마의 바탕색(--bg)과 같다`, () => {
      expect(tokensFor(id)["--bg"].toLowerCase()).toBe(THEMES[id].background.toLowerCase());
    });
  }
});
