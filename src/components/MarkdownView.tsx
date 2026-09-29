import type { Root as HastRoot } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { ComponentProps } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import type { DrawingResult } from "@/lib/docs";
import { DrawingBlock } from "./DrawingBlock";

/** hast-util-to-jsx-runtime이 모든 요소에 넘기는 `node` 속성을 DOM에 흘리지 않도록 뺀다. */
function omitNode<T extends { node?: unknown }>(props: T): Omit<T, "node"> {
  const { node, ...rest } = props;
  void node;
  return rest;
}

type Props = {
  tree: HastRoot;
  drawings: Record<string, DrawingResult>;
  /** 그림을 못 그릴 때 보여줄 GitHub 원본 주소를 만드는 함수 */
  sourceUrlFor: (path: string) => string;
};

/** 변환 모듈이 만든 hast를 React 요소로 바꿔 그린다. Excalidraw 자리표시는 그림 블록으로 바꾼다. */
export function MarkdownView({ tree, drawings, sourceUrlFor }: Props) {
  return toJsxRuntime(tree, {
    Fragment,
    jsx,
    jsxs,
    components: {
      div(props: ComponentProps<"div"> & { "data-excalidraw"?: string; node?: unknown }) {
        const { "data-excalidraw": drawingPath, ...rest } = omitNode(props);
        if (drawingPath) {
          return (
            <DrawingBlock
              inline
              path={drawingPath}
              result={drawings[drawingPath] ?? { ok: false, reason: "not-found" }}
              sourceUrl={sourceUrlFor(drawingPath)}
            />
          );
        }
        return <div {...rest} />;
      },
      a(props: ComponentProps<"a"> & { node?: unknown }) {
        const rest = omitNode(props);
        const external = typeof rest.href === "string" && /^https?:\/\//i.test(rest.href);
        return external ? <a {...rest} target="_blank" rel="noopener noreferrer" /> : <a {...rest} />;
      },
      img(props: ComponentProps<"img"> & { node?: unknown }) {
        const { alt, ...rest } = omitNode(props);
        // eslint-disable-next-line @next/next/no-img-element -- 외부(raw.githubusercontent.com) 이미지를 그대로 보여준다.
        return <img {...rest} alt={alt ?? ""} loading="lazy" decoding="async" />;
      },
    },
  });
}
