import { Hono } from "hono";

// CloudflareBindings型は worker-configuration.d.ts でグローバルに定義されています
const app = new Hono<{ Bindings: CloudflareBindings }>();

// Discord APIにメッセージを送信する関数
async function sendDiscordMessage(
  channelId: string,
  message: string,
  botToken: string
): Promise<Response> {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: message,
    }),
  });

  return response;
}

// ルートエンドポイント
app.get("/", (c) => {
  const tokenConfigured = !!c.env.DISCORD_BOT_TOKEN;
  return c.json({
    message: "Discord Bot API",
    endpoints: {
      "POST /send": "Send a message to Discord channel",
      "GET /auth/discord": "Start Discord OAuth2 authentication",
      "GET /auth/discord/callback": "Discord OAuth2 callback",
      "GET /env": "Check environment variables (debug)",
    },
    tokenConfigured,
  });
});

// Discord OAuth2認証開始エンドポイント
app.get("/auth/discord", async (c) => {
  try {
    const clientId = c.env.CLIENT_ID;
    const redirectUri = c.env.REDIRECT;

    if (!clientId || !redirectUri) {
      return c.json(
        {
          error: "CLIENT_ID or REDIRECT is not configured",
        },
        500
      );
    }

    // CSRF対策のためのstateパラメータを生成
    const state = crypto.randomUUID();
    const scopes = ["identify", "email", "guilds"];

    // Discord OAuth2認証URLを生成
    const authUrl = new URL("https://discord.com/api/oauth2/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes.join(" "));
    authUrl.searchParams.set("state", state);

    // stateをCookieに保存（簡易的な実装、本番環境ではセッション管理を推奨）
    c.header(
      "Set-Cookie",
      `oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/`
    );

    return c.redirect(authUrl.toString());
  } catch (error) {
    return c.json(
      {
        error: "Failed to generate OAuth2 URL",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Discord OAuth2コールバックエンドポイント
app.get("/auth/discord/callback", async (c) => {
  try {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    // エラーチェック
    if (error) {
      return c.json(
        {
          error: "OAuth2 authentication failed",
          details: error,
        },
        400
      );
    }

    if (!code || !state) {
      return c.json(
        {
          error: "Missing code or state parameter",
        },
        400
      );
    }

    // Cookieからstateを取得して検証（簡易的な実装）
    const cookieState = c.req
      .header("Cookie")
      ?.split(";")
      .find((cookie) => cookie.trim().startsWith("oauth_state="))
      ?.split("=")[1];

    if (state !== cookieState) {
      return c.json(
        {
          error: "Invalid state parameter",
        },
        400
      );
    }

    const clientId = c.env.CLIENT_ID;
    const clientSecret = c.env.CLIENT_SECRET;
    const redirectUri = c.env.REDIRECT;

    if (!clientId || !clientSecret || !redirectUri) {
      return c.json(
        {
          error: "OAuth2 credentials are not configured",
        },
        500
      );
    }

    // codeをtokenと交換
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      return c.json(
        {
          error: "Failed to exchange code for token",
          details: errorData,
        },
        (tokenResponse.status as 400 | 401 | 403 | 404 | 500) || 500
      );
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
      refresh_token?: string;
      scope: string;
    };
    const accessToken = tokenData.access_token;

    // ユーザー情報を取得
    const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      const errorData = await userResponse.json();
      return c.json(
        {
          error: "Failed to fetch user information",
          details: errorData,
        },
        (userResponse.status as 400 | 401 | 403 | 404 | 500) || 500
      );
    }

    const userData = (await userResponse.json()) as {
      id: string;
      username: string;
      discriminator: string;
      email?: string;
      avatar: string | null;
    };

    return c.json({
      success: true,
      message: "Authentication successful",
      user: {
        id: userData.id,
        username: userData.username,
        discriminator: userData.discriminator,
        email: userData.email,
        avatar: userData.avatar,
      },
      token: {
        access_token: accessToken,
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in,
        refresh_token: tokenData.refresh_token,
        scope: tokenData.scope,
      },
    });
  } catch (error) {
    return c.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// リダイレクトURL用のエイリアス（.dev.varsのREDIRECT設定に合わせる）
app.get("/discord/redirect", async (c) => {
  return app.fetch(
    new Request(
      new URL(
        "/auth/discord/callback" + c.req.url.split("/discord/redirect")[1],
        c.req.url
      ),
      c.req.raw
    )
  );
});

// デバッグ用: 環境変数の確認（本番環境では削除推奨）
app.get("/env", (c) => {
  const tokenConfigured = !!c.env.DISCORD_BOT_TOKEN;
  return c.json({
    tokenConfigured,
    tokenLength: c.env.DISCORD_BOT_TOKEN?.length || 0,
    tokenPrefix: c.env.DISCORD_BOT_TOKEN
      ? c.env.DISCORD_BOT_TOKEN.substring(0, 10) + "..."
      : "not set",
  });
});

// Discordメッセージ送信エンドポイント
app.post("/send", async (c) => {
  try {
    const botToken = c.env.DISCORD_BOT_TOKEN;

    if (!botToken) {
      return c.json({ error: "DISCORD_BOT_TOKEN is not configured" }, 500);
    }

    const body = await c.req.json();
    const { channelId = "1440630516389904467", message } = body;

    if (!channelId || !message) {
      return c.json(
        {
          error: "channelId and message are required",
        },
        400
      );
    }

    const response = await sendDiscordMessage(channelId, message, botToken);
    const data = await response.json();

    if (!response.ok) {
      let errorMessage = "Failed to send message to Discord";
      let troubleshooting: string[] = [];

      if (response.status === 401) {
        errorMessage =
          "Unauthorized: Discord Bot Token is invalid or not set correctly.";
        troubleshooting = [
          "Check your DISCORD_BOT_TOKEN in .dev.vars file",
          "Verify the token is correct in Discord Developer Portal",
          "Make sure the token hasn't been regenerated",
        ];
      } else if (response.status === 403) {
        errorMessage =
          "Forbidden: Bot doesn't have permission to send messages to this channel.";
        troubleshooting = [
          `Verify the bot is invited to the server (channel ID: ${channelId})`,
          "Check bot permissions: 'Send Messages' and 'View Channels'",
          "Verify channel permissions allow the bot to send messages",
          "Make sure the bot role has access to the channel",
          "Check if the channel is a text channel (not voice or category)",
        ];
      } else if (response.status === 404) {
        errorMessage = "Channel not found: Invalid channel ID.";
        troubleshooting = [
          `Verify the channel ID is correct: ${channelId}`,
          "Make sure developer mode is enabled to copy channel ID",
          "Check if the channel exists and is accessible",
        ];
      }

      return c.json(
        {
          error: errorMessage,
          details: data,
          statusCode: response.status,
          channelId,
          troubleshooting,
        },
        response.status as 400 | 401 | 403 | 404 | 500
      );
    }

    return c.json({
      success: true,
      message: "Message sent successfully",
      data,
    });
  } catch (error) {
    return c.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

export default app;
