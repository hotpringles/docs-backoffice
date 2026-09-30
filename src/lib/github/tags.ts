/** 파일 트리와 최신 커밋 조회에 붙이는 캐시 태그. push webhook이 이 태그를 무효화한다. */
export const TREE_TAG = "tree";

/** 문서를 처음 올린 사람 조회에 붙이는 캐시 태그. */
export const AUTHOR_TAG = "authors";

/** 처음 올린 사람은 바뀌지 않으므로 하루 동안 캐시한다(GitHub 호출을 아끼려는 것이다). */
export const AUTHOR_REVALIDATE_SECONDS = 86400;

/** 트리 캐시의 안전장치 만료 시간(초). webhook을 놓쳐도 이 시간이 지나면 갱신된다. */
export const TREE_REVALIDATE_SECONDS = 600;
