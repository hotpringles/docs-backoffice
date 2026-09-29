import { ImageResponse } from "next/og";

/**
 * 앱 아이콘(PNG)을 코드로 만든다. 별도 이미지 파일을 저장소에 넣지 않아도 된다.
 * 글자를 화면의 60%로 가운데에 두어서, 안드로이드가 아이콘을 둥글게 잘라도(maskable) 잘리지 않는다.
 */
export function iconResponse(size: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1f2328",
          color: "#ffffff",
          fontSize: Math.round(size * 0.6),
          fontWeight: 700,
        }}
      >
        D
      </div>
    ),
    { width: size, height: size },
  );
}
