```txt
npm install
npm run dev
```

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

## Discord Bot API の使用方法

### セットアップ

1. Discord Bot Tokenを取得
   - [Discord Developer Portal](https://discord.com/developers/applications)でアプリケーションを作成
   - Botを作成し、Tokenを取得
   - Botに必要な権限を付与（メッセージ送信権限など）

2. 環境変数の設定（ローカル開発）
   - `.dev.vars.example`を`.dev.vars`にコピー
   - `.dev.vars`ファイルに実際のDiscord Bot Tokenを設定
   ```bash
   cp .dev.vars.example .dev.vars
   # .dev.vars を編集して実際のTokenを設定
   ```
   - `.dev.vars`は`.gitignore`に含まれているため、Gitにコミットされません

3. 本番環境へのデプロイ時
   - `wrangler secret put DISCORD_BOT_TOKEN`コマンドで設定

### API エンドポイント

#### POST /send

Discordチャンネルにメッセージを送信します。

**リクエスト例:**

```bash
curl -X POST https://your-worker.workers.dev/send \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "1234567890123456789",
    "message": "Hello from Discord Bot!"
  }'
```

**リクエストボディ:**

- `channelId` (string, 必須): DiscordチャンネルID
- `message` (string, 必須): 送信するメッセージ内容

**レスポンス例:**

成功時:

```json
{
  "success": true,
  "message": "Message sent successfully",
  "data": {
    "id": "1234567890123456789",
    "content": "Hello from Discord Bot!",
    ...
  }
}
```

エラー時:

```json
{
  "error": "Failed to send message to Discord",
  "details": {...}
}
```

### ローカル開発

1. `.dev.vars`ファイルを作成してTokenを設定
   ```bash
   cp .dev.vars.example .dev.vars
   # .dev.vars を編集して実際のTokenを設定
   ```

2. 開発サーバーを起動
   ```bash
   npm run dev
   ```

3. APIをテスト
   ```bash
   curl -X POST http://localhost:8787/send \
     -H "Content-Type: application/json" \
     -d '{
       "channelId": "YOUR_CHANNEL_ID",
       "message": "Hello from Discord Bot!"
     }'
   ```

### エラー対処

#### 401 Unauthorized
- `.dev.vars`ファイルの`DISCORD_BOT_TOKEN`が正しく設定されているか確認
- Discord Developer PortalでTokenが正しいか確認
- Tokenが再生成されていないか確認

#### 403 Forbidden（Botにチャンネルへのアクセス権限がない）
以下の手順で確認してください：

1. **Botがサーバーに招待されているか確認**
   - Discord Developer PortalでBotのOAuth2 URLを生成
   - サーバーにBotを招待（`applications.commands`、`bot`スコープが必要）

2. **Botの権限を確認**
   - サーバー設定 → ロール → Botのロールを確認
   - 以下の権限が必要：
     - ✅ メッセージを送信
     - ✅ チャンネルを見る
     - ✅ メッセージ履歴を読む

3. **チャンネルの権限を確認**
   - チャンネル設定 → 権限 → Botのロールを確認
   - Botがチャンネルにアクセスできるか確認
   - テキストチャンネルであることを確認（ボイスチャンネルやカテゴリチャンネルでは送信不可）

4. **チャンネルIDが正しいか確認**
   - 開発者モードを有効化
   - チャンネルを右クリック → 「IDをコピー」
   - APIリクエストの`channelId`と一致しているか確認

#### 404 Not Found
- チャンネルIDが正しいか確認
- 開発者モードを有効化してチャンネルIDをコピー
- チャンネルが存在し、アクセス可能か確認

# classroom_discord_bot
