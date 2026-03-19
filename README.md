# Flagged World Map

指定した都市に国旗とコメントを表示し、都市リストから選択した地点へ地図を移動できるブラウザ用サンプルです。

## 使い方

1. このディレクトリでローカルサーバーを起動します。
2. ブラウザで `http://localhost:8000` を開きます。

```bash
node server.js
```

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
- 地図の国境データは `world-atlas` を CDN から取得しています。
- オフラインで使う場合は、`app.js` の `d3.json(...)` の参照先をローカルファイルへ変更してください。
