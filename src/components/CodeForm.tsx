import type { FormEvent } from "react";

type Props = {
  message: string;
  code: string;
  busy: boolean;
  onCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

/** 팀 편집 코드 입력 폼. 일정 편집기와 모임 화면이 함께 쓴다. */
export function CodeForm({ message, code, busy, onCodeChange, onSubmit, onCancel }: Props) {
  return (
    <form className="code-form" onSubmit={onSubmit}>
      <p className="meta">{message}</p>
      <label>
        편집 코드
        <input type="password" value={code} onChange={(e) => onCodeChange(e.target.value)} autoComplete="off" autoFocus required />
      </label>
      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {busy ? "확인 중…" : "확인"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          취소
        </button>
      </div>
    </form>
  );
}
