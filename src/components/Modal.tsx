"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  /** Esc를 누르거나 바깥(어두운 부분)을 눌렀을 때 */
  onClose: () => void;
  /** 화면 낭독기가 읽을 이름 */
  label: string;
  children: ReactNode;
};

/**
 * 화면 가운데에 뜨는 대화 상자. 브라우저의 `<dialog>`를 써서 포커스가 상자 안에 갇히고 Esc로 닫힌다.
 * 닫혀 있을 때는 내용을 그리지 않아서, 열 때마다 폼이 새로 시작한다.
 */
export function Modal({ open, onClose, label, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault(); // 닫는 일은 부모의 상태가 한다.
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose(); // 어두운 바깥 부분
      }}
    >
      {open && <div className="modal-body">{children}</div>}
    </dialog>
  );
}
