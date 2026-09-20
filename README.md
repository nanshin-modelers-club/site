# 南信模型クラブ サイト

GitHub Pages で公開する1ページのサイトです。
お知らせ欄は、note（またははてなブログ）のRSSを GitHub Actions が定期的に取り込んで書き換えます。

```
index.html                          トップページ（これ1枚）
posts.json                          取り込んだ記事（Actionsが生成）
scripts/update-posts.mjs            RSS取得とHTMLへの差し込み
.github/workflows/update-posts.yml  定期実行の設定
images/                             作品写真を置く場所
```

外部パッケージは使っていません。Node 18以降の標準機能だけで動きます。
`npm install` は不要で、依存パッケージの更新も発生しません。

---

## セットアップ

### 1. リポジトリを作る

GitHubで公開リポジトリを作り、このファイル一式を `main` ブランチに置きます。

### 2. GitHub Pages を有効にする

Settings → Pages → Source を **Deploy from a branch**、ブランチを **main / (root)** に設定します。
数分で `https://<ユーザー名>.github.io/<リポジトリ名>/` が見られるようになります。

### 3. RSSのURLを登録する

Settings → Secrets and variables → Actions → **Variables** タブ → New repository variable

| 名前 | 値の例 | 説明 |
|---|---|---|
| `FEED_URL` | `https://note.com/nanshinmodelers/rss` | 必須。はてなブログなら `https://ブログID.hatenablog.com/feed` |
| `POST_COUNT` | `3` | 省略可。既定は3件 |

Secret ではなく Variable です（公開情報なので隠す必要がありません）。

### 4. Actions に書き込み権限を与える

Settings → Actions → General → Workflow permissions →
**Read and write permissions** を選んで保存します。

これをしないと、更新をコミットする段階で失敗します。

### 5. 動作確認

Actions タブ → 「お知らせを更新」 → **Run workflow** で手動実行します。
成功すると `index.html` のお知らせ欄と `posts.json` が更新され、サイトに反映されます。

---

## 公開前に差し替える箇所

`index.html` を開いて「★」で検索してください。

| 印 | 内容 |
|---|---|
| ★1 | note / はてなブログのURL |
| ★2 | クラブ用メールアドレス |
| ★3 | 会場名・住所・Googleマップの埋め込みコード |
| ★4 | 次回の定例会（日付・時間） |
| ★5 | 活動開始年 |
| ★6 | 作品写真 |

Googleマップの埋め込みコードは、Googleマップで会場を検索 → 共有 → 地図を埋め込む → HTMLをコピー、で取得できます。

作品写真は `images/` に `01.jpg` `02.jpg` … と置いて、
「作品」セクションの `<p class="empty">` を削除し、その下の `<ul class="gallery">` のコメントを外してください。
横1200pxくらいに縮小してから置くとページが軽くなります。

---

## ふだんの運用

**毎月やること**は、`index.html` の★4（次回の定例会）を書き換えるだけです。
GitHubのWeb画面から直接編集できます（ファイルを開いて鉛筆アイコン → 編集 → Commit changes）。
コミットすると数分で反映されます。

**お知らせ**は note / はてなブログに投稿するだけで、翌朝の実行時に自動で載ります。
すぐ反映したいときは Actions タブから Run workflow を手動実行してください。

---

## 気をつけること

### スケジュール実行が止まることがある

GitHubは、リポジトリに一定期間（およそ60日）活動がないと、スケジュール実行のワークフローを自動的に無効化します。無効化される前にリポジトリの管理者へメールが届くので、**そのメールを見落とさないでください**。

`posts.json` には毎回 `fetchedAt`（取得時刻）を書き込んでいるので、記事が増えていなくても毎日コミットが発生します。通常はこれで活動が途切れませんが、確実ではないため、数ヶ月に一度は Actions タブが緑になっているか確認してください。

### 反映は即時ではない

`cron` の実行はUTC基準で、指定時刻から数分〜十数分ずれます。
現在は毎日 06:40 JST 前後に1回です。頻度を変えるなら `.github/workflows/update-posts.yml` の `cron` を編集してください。

### 取得に失敗したとき

RSSが取れなかった場合、`index.html` は書き換えずにワークフローが失敗します。
サイトには前回のお知らせが残るので、表示が壊れることはありません。
失敗するとGitHubから通知メールが届きます。

### noteのRSSについて

noteのRSSで配信されるのは記事の冒頭の一部分だけです（全文配信は note pro のみ）。
このサイトでは抜粋を90文字で切って表示しているので、この仕様で問題ありません。

サムネイル画像がRSSに含まれていれば自動で表示します。含まれていなければテキストだけで表示されます。どちらでも崩れません。

---

## ローカルで確認する

```sh
# 表示確認（http://localhost:8000）
python3 -m http.server 8000

# お知らせの取り込みを手元で試す
FEED_URL="https://note.com/nanshinmodelers/rss" node scripts/update-posts.mjs
```
