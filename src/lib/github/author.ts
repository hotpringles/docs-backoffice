import type { FileCreator } from "./client";

/**
 * 문서 작성자 조회를 "있으면 보여 주고 없으면 말없이 생략"하게 감싼다.
 * 작성자 라벨은 부가 정보라서, 조회가 실패하거나(호출 한도 초과 등) 정해진 시간 안에 오지 않아도 문서 보기를 막지 않는다.
 * 시간이 지나 못 받은 조회도 뒤에서 계속 진행되어 캐시에 남으므로, 다음에 열면 바로 나온다.
 */
export async function loadAuthorOrNull(load: () => Promise<FileCreator | null>, timeoutMs: number): Promise<FileCreator | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([load(), timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
