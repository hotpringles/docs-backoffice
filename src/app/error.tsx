"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page">
      <h1>문서를 불러오지 못했어요</h1>
      <p>GitHub에서 문서를 가져오는 중 문제가 생겼어요. 잠시 뒤에 다시 시도해 주세요.</p>
      <p>
        <button type="button" onClick={reset}>
          다시 시도
        </button>
      </p>
    </main>
  );
}
