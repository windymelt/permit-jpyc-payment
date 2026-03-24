# permit-payment-dapp デプロイ用 Makefile
#
# 使い方:
#   make help
#   make deploy APP_ORIGIN=https://pay.capslock.dev RELAY_URL=https://permit-payment-relay.xxx.workers.dev
#   make dev

# --- 設定変数 (コマンドラインで上書き可能) ---

# Cloudflare Pages のデプロイ先ドメイン
# relay の ALLOWED_ORIGIN に設定される
APP_ORIGIN ?= https://pay.capslock.dev

# デプロイ済み relay の URL
# deploy-relay 後に wrangler の出力から確認して設定する
RELAY_URL ?=

# 開発時のリレーサーバーポート
RELAY_DEV_PORT ?= 8787

# -----------------------------------------------

.PHONY: all help deploy deploy-relay deploy-app dev dev-relay dev-app

all: help

help:
	@echo ""
	@echo "Targets:"
	@echo "  deploy        relay → app の順でデプロイ (RELAY_URL 要設定)"
	@echo "  deploy-relay  relay のみデプロイ"
	@echo "  deploy-app    app のみビルド＆デプロイ (RELAY_URL 要設定)"
	@echo "  dev           relay + app を並列で開発起動"
	@echo "  dev-relay     relay のみ開発起動 (localhost:$(RELAY_DEV_PORT))"
	@echo "  dev-app       app のみ開発起動 (VITE_RELAY_URL=http://localhost:$(RELAY_DEV_PORT))"
	@echo ""
	@echo "Variables:"
	@echo "  APP_ORIGIN  = $(APP_ORIGIN)"
	@echo "  RELAY_URL   = $(if $(RELAY_URL),$(RELAY_URL),(未設定))"
	@echo ""
	@echo "Example:"
	@echo "  make deploy-relay"
	@echo "  make deploy-app RELAY_URL=https://permit-payment-relay.xxx.workers.dev"
	@echo ""

# relay + app を順番にデプロイ
deploy: _check-relay-url deploy-relay deploy-app

# relay Worker をデプロイ
# ALLOWED_ORIGIN を APP_ORIGIN に設定して CORS を制限する
deploy-relay:
	cd relay && pnpm wrangler deploy --var ALLOWED_ORIGIN:$(APP_ORIGIN)

# app をビルドして Cloudflare Pages へデプロイ
# pnpm run deploy と同じスクリプトを使い、VITE_RELAY_URL だけ前置して渡す
# dotenvx を使っている場合は `dotenvx run -- make deploy-app RELAY_URL=...` で呼ぶ
deploy-app: _check-relay-url
	cd app && VITE_RELAY_URL=$(RELAY_URL) pnpm run deploy

# relay と app を並列で開発起動
# Ctrl-C で両方を終了する
dev:
	@trap 'kill 0' INT TERM EXIT; \
	  ( cd relay && pnpm dev ) & \
	  ( sleep 1 && cd app && VITE_RELAY_URL=http://localhost:$(RELAY_DEV_PORT) pnpm dev ) & \
	  wait

dev-relay:
	cd relay && pnpm dev

dev-app:
	cd app && VITE_RELAY_URL=http://localhost:$(RELAY_DEV_PORT) pnpm dev

# --- 内部ターゲット ---

_check-relay-url:
	@if [ -z "$(RELAY_URL)" ]; then \
	  echo ""; \
	  echo "Error: RELAY_URL が未設定です。"; \
	  echo "  make deploy-relay を先に実行し、出力された URL を指定してください。"; \
	  echo "  例: make deploy-app RELAY_URL=https://permit-payment-relay.xxx.workers.dev"; \
	  echo ""; \
	  exit 1; \
	fi
