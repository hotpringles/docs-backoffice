"use client";

// retry는 서버 컴포넌트를 다시 불러와서 복구한다. reset은 오류 상태만 지우기 때문에
// GitHub 호출 실패(서버 컴포넌트 오류)에서는 같은 오류 화면으로 돌아온다. (Next.js 16.3 이상)
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="page">
      <h1>문서를 불러오지 못했어요</h1>
      <p>GitHub에서 문서를 가져오는 중 문제가 생겼어요. 잠시 뒤에 다시 시도해 주세요.</p>
      <p>
        <button type="button" onClick={() => retry()}>
          다시 시도
        </button>
      </p>
    </main>
  );
}
