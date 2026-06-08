# Xcratch LINE Messenger

Xcratch から LINE にメッセージを送るための拡張です。

## Public Files

- `dist/lineWebhook.mjs`
  - Xcratch の `Extension Loader` に入力する公開用モジュール
- `xcratch-line-webhook.mjs`
  - 拡張本体
- `index.html`
  - 公開案内ページ

## Load From Xcratch

Xcratch の `Extension Loader` に次の URL を入力して読み込みます。

```text
https://mnakaue.github.io/xcratch-line-messenger/dist/lineWebhook.mjs
```

## Notes

- このリポジトリには公開用の拡張ファイルだけを置いています。
- サーバー設定や運用手順などの非公開資料は別管理です。
