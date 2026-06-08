# セットアップ手順

## 1. LINE 側の準備

1. LINE Official Account を作成する
2. Messaging API を有効化する
3. `Channel secret` を控える
4. `Channel access token` を発行して控える
5. 友だち追加用 QR コードを配布する

補足:

- 2026-06-08 時点では、`LINE Notify` は使えません。
- 代わりに `Messaging API` を使います。

## 2. Worker 側の準備

Cloudflare Worker を例にします。

必要な環境変数:

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `XCRATCH_CLASS_PASSWORD`

あると便利:

- `LINE_USER_MAP`
  - KV Namespace
- `LINE_USER_MAP_JSON`
  - 固定マップの簡易運用用

### 例

```toml
name = "xcratch-line-webhook"
main = "worker.mjs"
compatibility_date = "2026-06-08"

[[kv_namespaces]]
binding = "LINE_USER_MAP"
id = "YOUR_KV_NAMESPACE_ID"
```

## 3. LINE Webhook URL を設定

Worker をデプロイしたら、LINE Developers Console で Webhook URL を設定します。

```text
https://YOUR-WORKER.workers.dev/api/line/webhook
```

## 4. 受信者登録

学生には、自分で `利用コード` を決めてもらいます。

例:

- `sato-01`
- `lab-bear-7`
- `mika2026`

友だち追加したユーザーに、LINE の 1対1 トークで次の 2 段階を行ってもらいます。

```text
登録 class-2026-a
```

続けて:

```text
利用コード sato-01
```

すると Worker が `sato-01 -> LINE userId` を保存します。

この設計では:

- 共通パスワードを知らない人は登録できない
- 共通パスワード確認は 1 回ごとの一時状態で処理される
- 他人の利用コードは上書きできない
- Xcratch では自分の利用コードだけ使う
- すでに使われている利用コードは登録できず、空いているコードを入れるまで再入力する

補足:

- `登録` だけ送った場合は、使い方ガイドを返します。
- `利用コード` を先に送った場合は、先にパスワード確認するよう案内します。

## 5. Xcratch 側設定

Xcratch で `Extension Loader` を開き、このファイルを配信した URL を読み込みます。

読み込み後、次を設定します。

- Webhook URL
- 利用パスワード
- 自分の利用コード

送信先 URL:

```text
https://YOUR-WORKER.workers.dev/api/send
```

## 6. Scratch ブロックの使い方

```text
Webhook URL を https://YOUR-WORKER.workers.dev/api/send にする
利用パスワードを class-2026-a にする
自分の利用コードを sato-01 にする
"こんにちは" を LINE に送る
```

## 運用メモ

- 利用コードは学生が自分で決めて構いません。
- ただし短すぎる名前や学籍番号そのままは避け、推測しにくい文字列を勧めると安全です。
- もし「この利用コードは使用中です」と返ったら、使われていない別の利用コードを続けて送ります。
- この再入力では、10 分以内ならパスワード確認をやり直す必要はありません。
- パスワードを間違えた場合は、もう一度 `登録 共通パスワード` を送り直せます。
- パスワード確認の有効時間は 10 分です。時間が空いたらもう一度 `登録 共通パスワード` を送ります。
- 共通パスワードは毎授業または学期ごとに変える運用が簡単です。
- Xcratch から送るのは平文メッセージだけに絞ると教材化しやすいです。
- スパム対策として、同じ利用コードからの送信は `3秒に1回まで`、かつ `10分で20回まで` に制限しています。

## 次にやると良いこと

- 送信回数制限
- メッセージ長制限
- 送信ログ保存
- 教員用ダッシュボード
- 画像送信ブロックの追加
