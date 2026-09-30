"use client";

import { useState, type ReactNode } from "react";

type Tab = "mine" | "all";

type Props = {
  initial: Tab;
  mine: ReactNode;
  all: ReactNode;
};

/**
 * "내 시간"과 "전체 결과" 탭. 두 화면을 모두 그려 두고 하나만 보여 준다.
 * 링크로 화면을 바꾸면 칠하던 표가 사라져서, 결과를 잠깐 보러 갔다 오는 사이 저장 안 한 표시가 날아가기 때문이다.
 */
export function MeetupTabs({ initial, mine, all }: Props) {
  const [tab, setTab] = useState<Tab>(initial);

  function choose(next: Tab) {
    setTab(next);
    // 주소도 맞춰 두면 새로고침하거나 링크를 나눌 때 같은 탭이 열린다. 화면 이동은 아니다.
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.set("tab", "all");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  }

  return (
    <>
      <div className="tabs" role="group" aria-label="모임 화면">
        <button type="button" aria-pressed={tab === "mine"} onClick={() => choose("mine")}>
          내 시간
        </button>
        <button type="button" aria-pressed={tab === "all"} onClick={() => choose("all")}>
          전체 결과
        </button>
      </div>
      <div hidden={tab !== "mine"}>{mine}</div>
      <div hidden={tab !== "all"}>{all}</div>
    </>
  );
}
