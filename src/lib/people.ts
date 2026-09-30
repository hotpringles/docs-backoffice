/**
 * 고정된 참가자 명단. 환경변수 `PEOPLE="p1:참가자 1,p2:참가자 2,..."`로 정하고,
 * 저장하는 데이터에는 번호(`p1`)만 남겨서 이름을 나중에 바꿔도 기록이 유지되게 한다.
 */
export type Person = { id: string; name: string };
export type PeopleResult = { ok: true; people: Person[] } | { ok: false; error: string };

export const DEFAULT_PEOPLE = "p1:참가자 1,p2:참가자 2,p3:참가자 3,p4:참가자 4,p5:참가자 5";

const ID_PATTERN = /^[a-z0-9_-]{1,20}$/;
const MAX_NAME_LENGTH = 20;
const MAX_PEOPLE = 10;

export function parsePeople(raw: string | undefined): PeopleResult {
  const text = raw?.trim() ? raw.trim() : DEFAULT_PEOPLE;
  const people: Person[] = [];

  for (const part of text.split(",")) {
    const entry = part.trim();
    const colon = entry.indexOf(":");
    if (colon <= 0) {
      return { ok: false, error: `PEOPLE 형식이 올바르지 않아요: "${entry}" (번호:이름 형태여야 해요)` };
    }
    const id = entry.slice(0, colon).trim();
    const name = entry.slice(colon + 1).trim();
    if (!ID_PATTERN.test(id)) {
      return { ok: false, error: `PEOPLE의 번호 "${id}"는 영문 소문자, 숫자, _, -만 1~20자로 써야 해요.` };
    }
    if (!name || [...name].length > MAX_NAME_LENGTH) {
      return { ok: false, error: `PEOPLE의 "${id}" 이름은 1~${MAX_NAME_LENGTH}자여야 해요.` };
    }
    if (people.some((person) => person.id === id)) {
      return { ok: false, error: `PEOPLE에 같은 번호 "${id}"가 두 번 있어요.` };
    }
    people.push({ id, name });
  }

  if (people.length > MAX_PEOPLE) {
    return { ok: false, error: `PEOPLE은 ${MAX_PEOPLE}명까지만 쓸 수 있어요.` };
  }
  return { ok: true, people };
}

export function loadPeople(env: Record<string, string | undefined> = process.env): PeopleResult {
  return parsePeople(env.PEOPLE);
}

/** 번호로 이름을 찾는다. 명단에서 빠진 번호는 번호 그대로 보여준다. */
export function nameOf(people: Person[], id: string): string {
  return people.find((person) => person.id === id)?.name ?? id;
}
