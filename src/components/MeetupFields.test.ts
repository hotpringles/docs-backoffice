import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeetupFields } from "./MeetupFields";

const render = (dayEnd: string) =>
  renderToStaticMarkup(
    createElement(MeetupFields, {
      value: { title: "모임", startDate: "2026-10-07", endDate: "2026-10-08", dayStart: "09:00", dayEnd },
      onChange: () => undefined,
      minDate: "2026-10-07",
      maxDate: "2026-10-13",
      fieldErrors: {},
    }),
  );

describe("MeetupFields 하루 끝", () => {
  it("저장된 자정(24:00)은 시각 입력칸에 00:00으로 보여 준다(입력칸은 24:00을 못 보여 준다)", () => {
    const html = render("24:00");
    expect(html).toContain('value="00:00"');
    expect(html).not.toContain('value="24:00"');
  });

  it("다른 끝 시각은 그대로 보여 주고, 자정은 00:00으로 입력하라는 안내가 있다", () => {
    expect(render("22:00")).toContain('value="22:00"');
    expect(render("22:00")).toContain("00:00으로 정하면 그날 자정(24:00)까지");
  });
});

describe("문서 목차 간격", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("목차 칸 오른쪽에 여백이 있어서, 목차가 길어 스크롤이 생겨도 스크롤바가 글자에 붙지 않는다", () => {
    const media = /@media \(min-width: 1180px\)\s*\{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
    const aside = /\.doc-aside\s*\{[^}]*\}/.exec(media)?.[0] ?? "";
    expect(aside).toMatch(/overflow-y:\s*auto/);
    expect(aside).toMatch(/padding-right:\s*0\.75rem/);
  });

  it("띄어쓰기 없는 긴 경로도 목차 칸 안에서 줄이 바뀐다(스크롤바 밑까지 삐져나가지 않는다)", () => {
    const rule = /\.toc a\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
