"use client";

import { useState, type FormEvent } from "react";
import { login } from "@/lib/events/client";

const browserFetch: typeof fetch = (input, init) => fetch(input, init);

/**
 * 편집 코드가 필요한 동작을 감싼다. 코드를 아직 입력하지 않았으면 코드부터 묻고, 맞으면 하려던 동작을 이어서 한다.
 * `A`는 코드를 확인한 뒤 이어서 할 동작을 나타내는 값이고, `proceed`가 그 값을 받아 실제로 한다.
 */
export function useEditGate<A>(initialAuthed: boolean, proceed: (action: A) => void) {
  const [authed, setAuthed] = useState(initialAuthed);
  const [prompt, setPrompt] = useState<{ action: A; message: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 편집 권한이 있으면 바로 동작하고, 없으면 코드부터 묻는다. */
  function run(action: A) {
    setError(null);
    if (authed) proceed(action);
    else setPrompt({ action, message: null });
  }

  /** 서버가 401(쿠키 만료 등)로 거절했을 때: 코드를 다시 묻고, 이어서 할 동작을 기억한다. */
  function expire(action: A) {
    setAuthed(false);
    setPrompt({ action, message: "편집 코드를 다시 입력해 주세요." });
  }

  function cancel() {
    setPrompt(null);
    setCode("");
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!prompt) return;
    setBusy(true);
    setError(null);
    const result = await login(browserFetch, code);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setAuthed(true);
    setCode("");
    const next = prompt.action;
    setPrompt(null);
    proceed(next);
  }

  return { authed, prompt, code, setCode, busy, error, run, expire, cancel, submit };
}
