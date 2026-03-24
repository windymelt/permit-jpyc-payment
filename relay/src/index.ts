import { DurableObject } from "cloudflare:workers";

interface Env {
  RELAY_SESSION: DurableObjectNamespace;
  ALLOWED_ORIGIN: string;
}

// ---------------------------------------------------------------------------
// Durable Object: 1セッション = 1インスタンス
// Hibernation API を使用: メッセージがない間はスリープしコストを抑える
// ---------------------------------------------------------------------------
export class RelaySession extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // POST /init: セッション初期化（Worker から内部的に呼ばれる）
    if (request.method === "POST" && url.pathname.endsWith("/init")) {
      const { deadline, receiverToken } = await request.json<{
        deadline: number;
        receiverToken: string;
      }>();
      await this.ctx.storage.put("receiverToken", receiverToken);
      // deadline に Alarm をセット → 期限切れで自動破棄
      await this.ctx.storage.setAlarm(deadline * 1000);
      return new Response("ok");
    }

    // WebSocket upgrade
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const role = url.searchParams.get("role"); // "receiver" | "sender"
    const token = url.searchParams.get("token");

    if (role === "receiver") {
      const storedToken = await this.ctx.storage.get<string>("receiverToken");
      if (!storedToken || token !== storedToken) {
        return new Response("Forbidden", { status: 403 });
      }
    } else if (role !== "sender") {
      return new Response("Bad Request: role must be receiver or sender", { status: 400 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [role as string]);

    // 送金者が接続したら受取人に通知
    if (role === "sender") {
      for (const ws of this.ctx.getWebSockets("receiver")) {
        ws.send(JSON.stringify({ type: "peer_connected" }));
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // メッセージ受信: 相手側に転送するだけ
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    const tags = this.ctx.getTags(ws);

    if (tags.includes("sender")) {
      for (const rws of this.ctx.getWebSockets("receiver")) {
        rws.send(message);
      }
    } else if (tags.includes("receiver")) {
      for (const sws of this.ctx.getWebSockets("sender")) {
        sws.send(message);
      }
    }
  }

  // 切断: 相手側に通知
  async webSocketClose(ws: WebSocket): Promise<void> {
    const tags = this.ctx.getTags(ws);
    const notify = JSON.stringify({ type: "peer_disconnected" });

    if (tags.includes("sender")) {
      for (const rws of this.ctx.getWebSockets("receiver")) {
        rws.send(notify);
      }
    } else if (tags.includes("receiver")) {
      for (const sws of this.ctx.getWebSockets("sender")) {
        sws.send(notify);
      }
    }
  }

  // Alarm: deadline 到達 → 全接続を閉じてストレージ破棄
  async alarm(): Promise<void> {
    const msg = JSON.stringify({ type: "session_expired" });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg);
        ws.close(1000, "session expired");
      } catch {
        // already closed
      }
    }
    await this.ctx.storage.deleteAll();
  }
}

// ---------------------------------------------------------------------------
// Worker エントリポイント: ルーティングと CORS
// ---------------------------------------------------------------------------
function corsHeaders(origin: string, allowedOrigin: string): Record<string, string> {
  // localhost は開発用に常に許可
  const allow =
    origin === allowedOrigin || /^https?:\/\/localhost(:\d+)?$/.test(origin)
      ? origin
      : allowedOrigin;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "";
    const cors = corsHeaders(origin, env.ALLOWED_ORIGIN);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // POST /sessions: セッション作成
    if (request.method === "POST" && url.pathname === "/sessions") {
      const { deadline } = await request.json<{ deadline: number }>();
      const sessionId = crypto.randomUUID();
      const receiverToken = crypto.randomUUID();

      const doId = env.RELAY_SESSION.idFromName(sessionId);
      const stub = env.RELAY_SESSION.get(doId);

      // DO を初期化
      const initUrl = new URL(url.href);
      initUrl.pathname = `/${sessionId}/init`;
      const initRes = await stub.fetch(
        new Request(initUrl.toString(), {
          method: "POST",
          body: JSON.stringify({ deadline, receiverToken }),
          headers: { "Content-Type": "application/json" },
        })
      );
      if (!initRes.ok) {
        return new Response("Failed to initialize session", {
          status: 500,
          headers: cors,
        });
      }

      return new Response(JSON.stringify({ sessionId, receiverToken }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // WS /sessions/:id/receiver?token=xxx  または  /sessions/:id/sender
    const wsMatch = url.pathname.match(/^\/sessions\/([^/]+)\/(receiver|sender)$/);
    if (wsMatch) {
      const [, sessionId, role] = wsMatch;

      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket upgrade", {
          status: 426,
          headers: cors,
        });
      }

      const doId = env.RELAY_SESSION.idFromName(sessionId);
      const stub = env.RELAY_SESSION.get(doId);

      // role と token をクエリパラメータとして DO に転送
      const doUrl = new URL(url.href);
      doUrl.searchParams.set("role", role);
      return stub.fetch(new Request(doUrl.toString(), request));
    }

    return new Response("Not Found", { status: 404, headers: cors });
  },
} satisfies ExportedHandler<Env>;
