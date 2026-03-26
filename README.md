# Flagged World Map

指定した都市に国旗とコメントを表示し、都市リストから選択した地点へ地図を移動できるブラウザ用サンプルです。

## 使い方

1. このディレクトリでローカルサーバーを起動します。
2. ブラウザで `http://localhost:8000` を開きます。

```bash
node server.js
```

`server.js` は静的画像を `./images`、アップロード画像と manifest と export を `./data` に保存します。Render の Persistent Disk を使う場合は mount path を `/opt/render/project/src/data` にすると、アップロード画像・`uploads.json`・アーカイブをまとめて永続化できます。

閲覧制限を使う場合は、環境変数に次を設定してください。

- `VIEWER_PASSWORD`: 共通の閲覧パスワード
- `ADMIN_DOWNLOAD_PASSWORD`: 一括ダウンロード用の管理者パスワード
- `AUTH_SECRET`: セッション cookie の署名キー

画像アップロード時には `sharp` を使って、元画像とは別に縮小版・透かし入りの配信用 JPEG を生成します。依存関係を入れるため、初回は次を実行してください。

```bash
npm install
```

## 画像保存先とエクスポート

- 元画像保存先: `data/uploaded/original/<conferenceType>/<eventDate>/<country>/<cityName>/...`
- 配信用画像保存先: `data/uploaded/public/<conferenceType>/<eventDate>/<country>/<cityName>/...`
- manifest: `data/uploads.json`
- アーカイブ出力先: `data/exports`

サーバー起動後、保存先の確認は次でできます。

```bash
curl http://localhost:8000/api/storage-info
```

画像と manifest をまとめてダウンロードしたい場合は、次の API で `tar.gz` を生成して取得できます。

```bash
curl -L \
  -H "X-Admin-Password: あなたの管理者パスワード" \
  http://localhost:8000/api/export/uploads-archive \
  -o uploads-export.tar.gz
```

展開すると `uploads.json` と `uploaded/original/` が入ります。管理者向けアーカイブには元画像を含め、配信用画像は含めません。

## 都市データの編集

起動時は次の順で都市データを読み込みます。

- `cities.initial-data.js` があれば、それを読み込んで表示します
- ファイルがなければ `app.js` の `cities` 配列を使います

`cities.initial-data.js` は、画面右側の「選択中の都市を編集」にある `更新内容を保存` ボタンを押すと書き出されます。対応ブラウザでは初回保存時に `index.html` があるディレクトリを選ぶと、その後は同じディレクトリへ `cities.initial-data.js` を上書き保存します。未対応ブラウザではダウンロードにフォールバックします。

手動で初期データを管理したい場合は、`app.js` の `cities` 配列を編集してください。右側の都市リストをクリックすると、その都市が地図の中心付近に来るようにアニメーションします。

```js
{
  name: "Singapore",
  country: "Singapore",
  flag: "🇸🇬",
  comment: "港湾と都市計画の密度が高い。",
  eventDate: "2026",
  organizer: "International Wind Engineering Group",
  conferenceType: "ICWE",
  coordinates: [103.8198, 1.3521],
  labelOffset: [24, 36],
}
```

## 補足

- 画像アップロード共有機能は `server.js` の API を使います。`python3 -m http.server` ではアップロードできません。
- `VIEWER_PASSWORD` を設定すると、未ログインではアップロード画像と共有アップロード API を利用できません。
- 一括ダウンロード API は `X-Admin-Password` ヘッダーで `ADMIN_DOWNLOAD_PASSWORD` を送ったときだけ使えます。
- 閲覧者に配信されるのは縮小版かつ透かし入りの JPEG です。元画像は `data/uploaded/original` に保持されます。
- 地図の国境データは `world-atlas` を CDN から取得しています。
- オフラインで使う場合は、`app.js` の `d3.json(...)` の参照先をローカルファイルへ変更してください。
- 以前の構成で `images/uploaded` または `data/images/uploaded` を使っていた場合は、起動時に `data/uploaded` へマージされます。
