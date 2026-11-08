import Image from "next/image";
import { AKAPU_IMAGE } from "@/lib/images";

// SP-11 S-38 #51-5: 検索中の表示。あかぷさん画像（無いあいだは CSS の回る輪）を回す。
// 「動きを減らす」設定では回さず「検索中」の文字を出す。画像は飾りなので代替テキストは空。
export function Searching() {
  return (
    <div className="searching" role="status" aria-live="polite">
      <span className="spin" aria-hidden="true">
        {AKAPU_IMAGE ? <Image src={AKAPU_IMAGE} alt="" width={64} height={64} unoptimized /> : <i className="ring" />}
      </span>
      <span className="spin-text">検索中</span>
    </div>
  );
}
