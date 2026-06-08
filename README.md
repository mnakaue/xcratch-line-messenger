# Xcratch LINE Webhook Starter

Xcratch から LINE にメッセージを送るための最小構成です。

## 重要

- 旧来の `LINE Notify` は 2025-03-31 に終了しています。
- そのため、これから作るなら `LINE Messaging API` を使う構成に寄せるのが安全です。
- LINE のチャネルアクセストークンを Xcratch 側へ直接置くのは危険です。トークンはサーバー側にだけ置きます。
- 授業利用では `共通パスワード確認 + 学生が自分で決める個別利用コード登録` の二段階が扱いやすいです。

## 構成

```text
Xcratch
  -> 独自拡張 (.mjs)
  -> Webhook サーバー
  -> LINE Messaging API
  -> LINE ユーザー
```

## 同梱ファイル

- `xcratch-line-webhook.mjs`
  - Xcratch で読み込む独自拡張
- `dist/lineWebhook.mjs`
  - Xcratch の `Extension Loader` に入力する公開用 URL の本体
- `cloudflare-worker/worker.mjs`
  - Webhook と LINE 連携を受け持つサーバー雛形
- `wrangler.toml.example`
  - Cloudflare Worker 設定例
- `index.html`
  - GitHub Pages で公開したときの案内ページ
- `docs/setup.md`
  - セットアップ手順

## この設計のポイント

- ボード不要
- AkaDako のアクセスコード不要
- Xcratch から直接 `fetch` で送信
- 宛先は `userCode` で抽象化
- 実際の LINE `userId` はサーバーが保持
- 個別利用コードは上書き不可にして混線を防ぐ
- 利用コードは学生が自分で決められる
- 利用コードが重複したときは、空いているコードが登録されるまで再入力できる
- 送信は軽いレート制限付きで、連打スパムを抑える

## 最低限の流れ

1. LINE 公式アカウントを作る
2. Messaging API を有効化する
3. `dist/lineWebhook.mjs` を GitHub Pages などで公開する
4. Worker をデプロイする
5. 友だち追加したユーザーが LINE で `登録 共通パスワード` と送る
6. 続けて `利用コード 個別利用コード` と送る
7. Xcratch の `Extension Loader` へ `.../dist/lineWebhook.mjs` を入力する
8. Xcratch ブロックに Webhook URL / 共通パスワード / 個別利用コード を設定する
9. Xcratch からメッセージ送信する

## Xcratch からの読み込み

ご提示のページでも説明されている通り、Xcratch は `Extension Loader` にモジュール URL を入れて拡張を読み込みます。

手順:

1. Xcratch Editor を開く
2. 「拡張機能を追加」を押す
3. `Extension Loader` を選ぶ
4. 次の URL を入力する

```text
https://YOUR-ACCOUNT.github.io/YOUR-REPOSITORY/dist/lineWebhook.mjs
```

参考:

- [Xcratch – 拡張できるScratch3.0mod](https://www.con3.com/rinlab/?p=5106)
- [AkaDako の Xcratch での拡張読み込み方法](https://akadako.com/en/guide/env/)

## 注意

- 友だち追加だけでは push 送信先の管理がしづらいので、初回登録メッセージを使っています。
- 登録は `登録 共通パスワード` の確認後、`利用コード code` を受け付ける二段階です。
- パスワードを間違えても、再度 `登録 共通パスワード` を送り直せます。
- Apps Script でも送信自体はできますが、Webhook の署名検証や運用のしやすさを考えると Worker 系の方がきれいです。
- 共通パスワードだけだと他人の宛先を叩ける余地があるので、個別利用コードとセットにします。
- 現在のスパム対策は、共通パスワード、個別利用コード、送信レート制限が中心です。
