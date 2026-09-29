import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <h1>문서를 찾을 수 없어요</h1>
      <p>주소가 바뀌었거나 표시하지 않는 문서예요.</p>
      <p>
        <Link href="/">문서 목록으로 돌아가기</Link>
      </p>
    </main>
  );
}
