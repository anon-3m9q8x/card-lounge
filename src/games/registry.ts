import type { GameId } from "../app/types.ts";
export const games: {
  id: GameId;
  name: string;
  english: string;
  symbol: string;
  people: string;
  description: string;
  available: boolean;
  rules: string[];
}[] = [
  {
    id: "klondike",
    name: "ソリティア",
    english: "KLONDIKE",
    symbol: "♠",
    people: "1人",
    description: "一枚ずつ積み重ねる、静かな思考の時間。",
    available: false,
    rules: [
      "ドロー1・山札の再循環は無制限。",
      "場札は色を交互にして降順、空列はKから。組札は同スートをAからKへ。",
      "4つの組札に52枚が揃えば完成。基本版では未実装です。",
    ],
  },
  {
    id: "memory",
    name: "神経衰弱",
    english: "MEMORY",
    symbol: "♦",
    people: "1人 / CPU対戦",
    description: "めくる、覚える、見つける。記憶をつなぐ一局。",
    available: true,
    rules: [
      "同じ数字で、同じ色の2枚がペアです。♥と♦、♠と♣が同色です。",
      "8・12・26ペアから選択。2枚めくり、不一致なら800ms後に裏返ります。",
      "ペアが揃えば同じ人が続けます。CPU対戦は獲得ペアが多い方の勝ち。",
      "CPUの記憶は初級2枚・中級6枚・上級は観測した全ての未一致カード。未公開カードは見ません。",
    ],
  },
  {
    id: "oldMaid",
    name: "ババ抜き",
    english: "OLD MAID",
    symbol: "♣",
    people: "1人 + CPU3人",
    description: "その一枚に、運命が隠れている。",
    available: false,
    rules: [
      "52枚とジョーカー1枚を4人に配り、同ランクのペアを取り除きます。",
      "時計回りで次に手札が残る相手から1枚引き、ペアを除去します。",
      "最後にジョーカーを持つ人の負け。基本版では未実装です。",
    ],
  },
  {
    id: "sevens",
    name: "七並べ",
    english: "SEVENS",
    symbol: "♥",
    people: "1人 + CPU3人",
    description: "七から広がる、小さな駆け引き。",
    available: false,
    rules: [
      "4スートの7を中央に置き、その両側に連続する数字だけを出せます。",
      "合法手があるときの自発パスは3回まで。合法手なしの強制パスは別に数えます。",
      "先に手札をなくした人の勝ち。基本版では未実装です。",
    ],
  },
  {
    id: "speed",
    name: "スピード",
    english: "SPEED",
    symbol: "ϟ",
    people: "1人 + CPU1人",
    description: "ひらめきと反射が、次の一手になる。",
    available: false,
    rules: [
      "両者4枚の表札から、中央2枚のどちらかに数字が±1の札を出します。AとKも隣接です。",
      "双方出せない場合は残る補充山から中央へ1枚ずつ置きます。",
      "先に補充山と表札を空にした人が勝ち。基本版では未実装です。",
    ],
  },
];
