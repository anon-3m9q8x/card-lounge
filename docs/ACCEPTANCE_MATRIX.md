# Card Lounge — 受け入れテストマトリクス

> 完了判定は**実際に走らせた項目のみPASS**。静的確認は`REVIEW`、実行不可は`SKIP`とし理由を残す。初期納品時点で全項目 `NOT_RUN`。

記録カラム: `ID / 手順・条件 / 期待結果 / 結果 / コメント`。自動テストと手動テストの両方を含みます。

## 共通エンジン・乱数 (CORE)

| ID | 操作・入力条件 | 期待結果 | 実施結果 | 備考 |
|---|---|---|---|---|
| `CORE-01` 52枚作成 | makeDeck(false)を実行 | 52件・ID重複0・JOKERなし | NOT_RUN | — |
| `CORE-02` 53枚作成 | makeDeck(true)を実行 | 53件・JOKERは1枚のみ | NOT_RUN | — |
| `CORE-03` スート／色 | ♠♣と♥♦の色判定 | S,C同色・H,D同色・他は異色 | NOT_RUN | — |
| `CORE-04` AとKの隣接判定 | adjacentRank(1,13,true/false) | trueのときのみtrue | NOT_RUN | — |
| `CORE-05` 再現性 | 同seedでshuffleを2回実行 | 配列と終了rngStateが一致 | NOT_RUN | — |
| `CORE-06` デッキ重複 | 100seedのshuffleを検査 | 52枚が一度ずつ出現 | NOT_RUN | — |
| `CORE-07` 無効アクション | ゲーム違いのActionをdispatch | ok:false・元状態不変 | NOT_RUN | — |
| `CORE-08` PauseとResume | プレイ中PAUSE→RESUME | phaseとclockが仕様通りに変化 | NOT_RUN | — |
| `CORE-09` 終了後禁止 | finished状態でPLAY系Action | ok:false・記録増加なし | NOT_RUN | — |
| `CORE-10` CPUの正当性 | CPUの観測Viewに未公開札を与えず操作選択 | 未公開札ID/pairKeyを参照しない | NOT_RUN | — |
| `CORE-11` React二重起動 | StrictModeで初期化 | 二重配布・CPU二重予約なし | NOT_RUN | — |
| `CORE-12` 破損操作 | 意図的なCardId重複を含むセッション | 検証エラー、実行してもカード消失なし | NOT_RUN | — |

## ソリティア (KL)

| ID | 操作・入力条件 | 期待結果 | 実施結果 | 備考 |
|---|---|---|---|---|
| `KL-01` 初期配札 | 新規クロンダイクを開始 | 7列down=0..6/up=1・stock24 | NOT_RUN | — |
| `KL-02` カードをめくる | stockありでKL_DRAW | stockが1減りwasteが1増える | NOT_RUN | — |
| `KL-03` 山札循環 | stock0・wasteありでKL_REDEAL | waste逆順がstockになりwaste空 | NOT_RUN | — |
| `KL-04` 再循環回数 | 山札を2周使用 | redealCount更新・回数制限なし | NOT_RUN | — |
| `KL-05` 交互色の降順 | ♥8の上に♠7を移動 | 成功、順序を維持 | NOT_RUN | — |
| `KL-06` 同色拒否 | ♥8の上に♦7を移動 | ILLEGAL_MOVE・盤面不変 | NOT_RUN | — |
| `KL-07` 空列へのKing | 空列へK始まりの束を移動 | 成功 | NOT_RUN | — |
| `KL-08` 空列の非King | 空列へQ始まりの束を移動 | ILLEGAL_MOVE | NOT_RUN | — |
| `KL-09` 組札へA | 空の♥foundationに♥A | 成功 | NOT_RUN | — |
| `KL-10` 組札へ不適格 | 空の♥foundationに♥2 | ILLEGAL_MOVE | NOT_RUN | — |
| `KL-11` 表札めくり | tableau列の最後のupを移してdownが残る | down末尾がupへ反転 | NOT_RUN | — |
| `KL-12` 組札から列へ戻す | 適格な組札のトップを列へ移動 | 成功・52枚を維持 | NOT_RUN | — |
| `KL-13` Undo | 合法手の後にKL_UNDO | カード配置を復元しassistUsed=true | NOT_RUN | — |
| `KL-14` Undo空 | 履歴0でKL_UNDO | エラー・状態変更なし | NOT_RUN | — |
| `KL-15` 完成 | 組札4個が13枚になる局面 | completed・1回のみ戦績記録 | NOT_RUN | — |

## 神経衰弱 (MEM)

| ID | 操作・入力条件 | 期待結果 | 実施結果 | 備考 |
|---|---|---|---|---|
| `MEM-01` ペア8 | solo・pairs8で開始 | 16タイル・各pairKey2枚 | NOT_RUN | — |
| `MEM-02` ペア12 | solo・pairs12で開始 | 24タイル・各pairKey2枚 | NOT_RUN | — |
| `MEM-03` ペア26 | vsCpu・pairs26で開始 | 52タイル・各pairKey2枚 | NOT_RUN | — |
| `MEM-04` 別数字の不一致 | 数字の異なる2枚を開く | mismatch・800ms後に裏へ戻る | NOT_RUN | — |
| `MEM-05` 同じ色・ランク | 同ランク同色の2枚を開く | matchedになり同一手番が継続 | NOT_RUN | — |
| `MEM-06` 異色同数字 | ♥5と♠5を開く | 不一致 | NOT_RUN | — |
| `MEM-07` 同じカード2回 | 同tileIdを連続選択 | 失敗・attempts増えない | NOT_RUN | — |
| `MEM-08` 3枚目ブロック | mismatch解決前に3枚目を押す | 失敗・表面2枚は維持 | NOT_RUN | — |
| `MEM-09` CPU切替 | vsCpuで人間が不一致 | cpu1へ手番が移行 | NOT_RUN | — |
| `MEM-10` Solo連続 | soloで不一致後に復帰 | 手番はhumanのまま | NOT_RUN | — |
| `MEM-11` CPU easy記憶 | 公開8枚後にeasyの観測履歴確認 | 直近2枚のみ保持 | NOT_RUN | — |
| `MEM-12` CPU normal記憶 | 公開8枚後にnormalの観測履歴確認 | 直近6枚のみ保持 | NOT_RUN | — |
| `MEM-13` CPU hard記憶 | 公開8枚後にhardの観測履歴確認 | 未一致の観測8枚を保持 | NOT_RUN | — |
| `MEM-14` 一時停止中の不一致 | 2枚mismatch表示時に別タブ→戻る | 停止時は表面保持、再開後800msで解決 | NOT_RUN | — |
| `MEM-15` 引き分け | vsCpuで双方ペア数同数の終了盤面 | outcome=draw | NOT_RUN | — |
| `MEM-16` 完璧な記憶 | soloで誤選択0・8ペア達成 | memory-perfect実績解除 | NOT_RUN | — |

## ババ抜き (OM)

| ID | 操作・入力条件 | 期待結果 | 実施結果 | 備考 |
|---|---|---|---|---|
| `OM-01` 53枚配札 | ババ抜き新規開始 | 14,13,13,13配札の後ペア除外 | NOT_RUN | — |
| `OM-02` 初期ペア除去 | 同ランク4枚の手札 | 2組4枚をdiscardedへ移動 | NOT_RUN | — |
| `OM-03` JOKER残存 | 初期処理後の全カード検証 | JOKERが1枚でdiscardに含まれない | NOT_RUN | — |
| `OM-04` 合法な引き | human手番に隣のCPUの裏札を選ぶ | そのカードだけ人間へ移動・ペアを解消 | NOT_RUN | — |
| `OM-05` 不正インデックス | 手札数を超えるtargetIndexでOM_DRAW | INVALID_ACTION・状態不変 | NOT_RUN | — |
| `OM-06` 他人の手番 | CPUターンにhuman操作 | NOT_YOUR_TURN | NOT_RUN | — |
| `OM-07` カード所有権 | 20操作後に全カードを走査 | hands＋discardedが53IDで重複なし | NOT_RUN | — |
| `OM-08` 上がった人をスキップ | cpu2の手札が0になる | 以後cpu2の手番を飛ばす | NOT_RUN | — |
| `OM-09` CPUの公平選択 | cpu3がhumanから引く | カードIDに関係なく均等な位置選択 | NOT_RUN | — |
| `OM-10` 最後のJOKER | 1人のみJOKERが残る | その人負け・人間でなければ人間勝利 | NOT_RUN | — |
| `OM-11` 人間が敗者 | 人間が最後にJOKERを持つ | outcome=loss | NOT_RUN | — |
| `OM-12` 手札の秘匿 | CPU3の裏面カードへフォーカス | aria-labelに表面のrank/suitを含まない | NOT_RUN | — |

## 七並べ (SV)

| ID | 操作・入力条件 | 期待結果 | 実施結果 | 備考 |
|---|---|---|---|---|
| `SV-01` 初期7配置 | 七並べを開始 | 4スートすべて7が盤上・合計48枚が手札 | NOT_RUN | — |
| `SV-02` 開始者 | ♦7の元の所持者を確定 | 次の席が先手 | NOT_RUN | — |
| `SV-03` 7周囲 | ♣7しかない状態で♣6/♣8 | 両方合法 | NOT_RUN | — |
| `SV-04` 飛び越し拒否 | ♣7の次に♣5を配置 | ILLEGAL_MOVE | NOT_RUN | — |
| `SV-05` 連続配置 | ♣6の配置後に♣5 | 合法 | NOT_RUN | — |
| `SV-06` 他人のカード拒否 | 人間の手札にないカードIDでSV_PLACE | ILLEGAL_MOVE・状態不変 | NOT_RUN | — |
| `SV-07` 自発パス | 合法手ありでpassし3回まで消費 | 3回は成功、4回目は拒否 | NOT_RUN | — |
| `SV-08` 強制パス | 合法手なしでpass | 回数無制限・voluntaryPasses不変 | NOT_RUN | — |
| `SV-09` CPUは自発パスしない | CPUに合法手あり | 合法カードを必ず選ぶ | NOT_RUN | — |
| `SV-10` 難易度における公平性 | 3難易度で非公開手札を変化させる | CPUの判断は自分の手札と公開盤面のみ | NOT_RUN | — |
| `SV-11` 着順 | 人間が最初に手札0 | 1位が記録される | NOT_RUN | — |
| `SV-12` 最終配置 | 52枚が全て配置される | finished・finishOrderが全4名 | NOT_RUN | — |
| `SV-13` 周回停滞 | 全員手詰まりとなる不正状態 | 無限CPUループを止めて検証エラー | NOT_RUN | — |

## スピード (SP)

| ID | 操作・入力条件 | 期待結果 | 実施結果 | 備考 |
|---|---|---|---|---|
| `SP-01` 26枚ずつ | スピードを開始 | 各者reserve21・visible4・center1 | NOT_RUN | — |
| `SP-02` 中央2枚 | 初期画面 | 中央2枚いずれにも人間/CPUが置ける | NOT_RUN | — |
| `SP-03` 数字1差 | 場の8に7/9を出す | 両方合法 | NOT_RUN | — |
| `SP-04` 異数字拒否 | 場の8に6を出す | ILLEGAL_MOVE | NOT_RUN | — |
| `SP-05` AとK循環 | 場のKにAを出す | 合法 | NOT_RUN | — |
| `SP-06` 即補充 | visible1枚を場へ置く | reserveから1枚補充、残数-1 | NOT_RUN | — |
| `SP-07` 補充0 | reserve0でvisible移動 | 空スロットnullを維持 | NOT_RUN | — |
| `SP-08` 同時アクセス | 人間とCPUが同じ中央に操作 | 先着を確定、後続は更新後合法性再検証 | NOT_RUN | — |
| `SP-09` 中断時CPU停止 | スピード中タブを非表示 | CPUと正味計測が停止する | NOT_RUN | — |
| `SP-10` カウントダウン | 一時停止から再開 | 3,2,1後にプレイ再開 | NOT_RUN | — |
| `SP-11` 中央更新 | 双方に合法手なし・reserveあり | 各reserveから1枚を対応中央に置く | NOT_RUN | — |
| `SP-12` 片側のみ更新 | 一方のみreserveが残る | その人の中央のみ更新 | NOT_RUN | — |
| `SP-13` 空山札手詰まり | reserve両者0・合法手両者0 | visible少ない方が勝つ、同数draw | NOT_RUN | — |
| `SP-14` 人間の先着勝利 | humanのreserve0とvisible0 | win・finished | NOT_RUN | — |
| `SP-15` CPUの先着勝利 | cpu1のreserve0とvisible0 | loss・finished | NOT_RUN | — |

## 保存・記録・実績 (DATA)

| ID | 操作・入力条件 | 期待結果 | 実施結果 | 備考 |
|---|---|---|---|---|
| `DATA-01` 設定保存 | 卓面=burgundy、背面=classicに変更→リロード | 両設定が復元される | NOT_RUN | — |
| `DATA-02` ゲーム保存 | 各ゲームを1手進め→閉じて再起動 | そのゲーム固有のpausedスロットから復元 | NOT_RUN | — |
| `DATA-03` 別ゲーム保存 | クロンダイクと七並べに保存を作成 | 互いを消さず各1スロット | NOT_RUN | — |
| `DATA-04` 新規上書き確認 | セーブありで同ゲーム新規開始 | 警告・キャンセルで保存維持 | NOT_RUN | — |
| `DATA-05` 終局処理 | 勝利を2回検知させる | processedSessionIdsで結果1件 | NOT_RUN | — |
| `DATA-06` ランキング | クリア3回を異なる時間で記録 | 該当設定のみ時間昇順で上位10件 | NOT_RUN | — |
| `DATA-07` 補助利用区別 | ヒント付きクリア | 戦績には残るが通常ランキングには入らない | NOT_RUN | — |
| `DATA-08` 0除算防止 | 戦績0件のゲームを開く | 勝率は「—」 | NOT_RUN | — |
| `DATA-09` 実績単発解除 | first-win成立を2度通知 | unlockedAtは初回値を維持 | NOT_RUN | — |
| `DATA-10` 全5種実績 | 5種すべてで1回finished | five-types解除 | NOT_RUN | — |
| `DATA-11` 保存領域不可 | localStorage.setItemがthrow | ゲーム継続・保存不可警告 | NOT_RUN | — |
| `DATA-12` 不正JSON | card-lounge:v1が途中で途切れたJSON | 既存値を上書きせず初期化確認を表示 | NOT_RUN | — |
| `DATA-13` 将来版 | schemaVersion:2を保存領域へ設定 | 原本を保護・復元不可を通知 | NOT_RUN | — |
| `DATA-14` 別タブ競合 | 2タブで同一セーブを書き換える | 自動マージせず競合警告 | NOT_RUN | — |

## UI・アクセシビリティ (UI)

| ID | 操作・入力条件 | 期待結果 | 実施結果 | 備考 |
|---|---|---|---|---|
| `UI-01` PCトップ | 1440×900で起動 | 左ナビ・ゲーム一覧・戦績が重ならずに表示 | NOT_RUN | — |
| `UI-02` タブレット | 820×1180で起動 | ナビ縮小・カードが収まり操作可能 | NOT_RUN | — |
| `UI-03` スマホ | 390×844で起動 | モバイルナビ・全5ゲームタップで操作可能 | NOT_RUN | — |
| `UI-04` 小画面 | 320×700で起動 | 主要ボタンを触れ、全ページ横スクロールなし | NOT_RUN | — |
| `UI-05` キーボード操作 | マウスを使わずにゲーム開始〜カード配置 | Enter/Spaceで操作・focusが見える | NOT_RUN | — |
| `UI-06` ロールと裏札 | スクリーンリーダーでCPU裏向き札を選択 | 実カードの中身は読み上げられない | NOT_RUN | — |
| `UI-07` 動き軽減 | prefers-reduced-motion環境で勝利 | アニメ短縮/停止、結果は同じ | NOT_RUN | — |
| `UI-08` 音声初期OFF | 初回表示とプレイ | ユーザー操作まで音が鳴らない | NOT_RUN | — |
| `UI-09` 音声未対応 | AudioContextがない環境でカード移動 | ゲーム続行・音声のみ省略 | NOT_RUN | — |
| `UI-10` ルールダイアログ | 各ゲームでルールを開く | ローカルルールと合法手・勝敗条件が一致 | NOT_RUN | — |
| `UI-11` 不正操作通知 | カードを不適格な列へ置く | 理由を示す・盤面不変 | NOT_RUN | — |
| `UI-12` 中断離脱 | プレイ中にホームへ戻る | 保存して終了/保存せず終了/キャンセルが動く | NOT_RUN | — |
| `UI-13` 色覚対応 | 赤・黒表示を無彩色化して確認 | スート記号だけで見分けられる | NOT_RUN | — |
| `UI-14` 結果導線 | 任意ゲーム完了 | 再戦・ホーム・戦績への移動可能 | NOT_RUN | — |

## 実装後のテスト結果サマリー

- 対象件数: **111件**
- PASS: 0（未実装）
- FAIL: 0（未実装）
- SKIP: 0（未実装）
- NOT_RUN: 111（実装・実行前）

### テスト実施条件

- 自動: 純粋関数でseed固定の盤面を組み立てたテストを優先。ランダム運任せの長時間プレイを必須条件にしない。
- 手動: 画面サイズ、キーボード、サウンド、視覚を評価。プレイがないのにPASSとしない。
- タイマー検証: `performance.now`/フェイクタイマーなどを利用して待機を短縮するが、本番の一定時間が妥当かブラウザでも確認。
- 差分レポートに FAILとSKIPの原因・再現手順を付ける。

### 記録用メモ

```text
テスト実施環境:
実装commit:
実行コマンド:
PASS:
FAIL:
SKIP:
担当・日時:
未確認事項:
```
