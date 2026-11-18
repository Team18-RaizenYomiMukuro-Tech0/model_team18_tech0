"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { LOGIN_NOTE_MESSAGE, LOGIN_NOTE_MS } from "@/lib/loginNote";

// D-25 SP-08 #484: ヘッダーのログイン（準備中）。札「準備中」は全ての幅で出す（480px 以下はアイコンの右上）。
// 押すとヘッダーのすぐ下に「ログインは準備中です」を 2 秒出して消す（role="status"）。続けて押したらそこから 2 秒。ログイン画面は作らない（#65）。
export function LoginButton() {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const press = () => {
    if (timer.current) clearTimeout(timer.current);
    setOn(true);
    timer.current = setTimeout(() => setOn(false), LOGIN_NOTE_MS);
  };
  return (
    <>
      <button type="button" className="hbtn" aria-label="ログイン（準備中）" aria-disabled="true" onClick={press}>
        <span className="ico"><Icon name="user" /></span> <span className="t">ログイン</span>
        <span className="tag">準備中</span>
      </button>
      <div role="status" className="loginnote">{on ? LOGIN_NOTE_MESSAGE : ""}</div>
    </>
  );
}
