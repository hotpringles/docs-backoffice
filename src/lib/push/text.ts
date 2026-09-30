/**
 * 알림에 넣는 제목 같은 사용자 입력은 얼마든지 길 수 있다. 알림 본문이 커지지 않도록 자른다.
 * 이모지도 한 글자로 세고, 넘으면 마지막을 `…`로 바꾼다.
 */
export function shorten(text: string, max = 40): string {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text;
}
