.PHONY: build test fmt lint clean \
        deploy-polygon deploy-polygon-dry \
        deploy-avalanche deploy-avalanche-dry \
        verify-polygon verify-avalanche \
        address-polygon address-avalanche \
        check-env-polygon check-env-avalanche

# ------------------------------------------------------------------------------
# 開発
# ------------------------------------------------------------------------------

build:
	forge build

test:
	forge test -vv

fmt:
	forge fmt

lint:
	forge lint

clean:
	forge clean

# ------------------------------------------------------------------------------
# 環境変数チェック
# ------------------------------------------------------------------------------

check-env-polygon:
	@test -n "$(POLYGON_RPC_URL)"   || (echo "ERROR: POLYGON_RPC_URL is not set in .env"; exit 1)
	@test -n "$(PRIVATE_KEY)"       || (echo "ERROR: PRIVATE_KEY is not set in .env"; exit 1)

check-env-polygon-verify: check-env-polygon
	@test -n "$(POLYGONSCAN_API_KEY)" || (echo "ERROR: POLYGONSCAN_API_KEY is not set in .env"; exit 1)

check-env-avalanche:
	@test -n "$(AVALANCHE_RPC_URL)" || (echo "ERROR: AVALANCHE_RPC_URL is not set in .env"; exit 1)
	@test -n "$(PRIVATE_KEY)"       || (echo "ERROR: PRIVATE_KEY is not set in .env"; exit 1)

check-env-avalanche-verify: check-env-avalanche
	@test -n "$(SNOWTRACE_API_KEY)" || (echo "ERROR: SNOWTRACE_API_KEY is not set in .env"; exit 1)

# ------------------------------------------------------------------------------
# Polygon Mainnet (chainId: 137)
# ------------------------------------------------------------------------------

deploy-polygon-dry: check-env-polygon
	forge script script/Deploy.s.sol \
		--rpc-url $(POLYGON_RPC_URL) \
		-vvvv

deploy-polygon: check-env-polygon-verify
	forge script script/Deploy.s.sol \
		--rpc-url $(POLYGON_RPC_URL) \
		--broadcast \
		--verify \
		-vvvv

# ------------------------------------------------------------------------------
# Avalanche C-Chain (chainId: 43114)
# ------------------------------------------------------------------------------

deploy-avalanche-dry: check-env-avalanche
	forge script script/Deploy.s.sol \
		--rpc-url $(AVALANCHE_RPC_URL) \
		-vvvv

deploy-avalanche: check-env-avalanche-verify
	forge script script/Deploy.s.sol \
		--rpc-url $(AVALANCHE_RPC_URL) \
		--broadcast \
		--verify \
		-vvvv

# ------------------------------------------------------------------------------
# ソース検証のみ（デプロイ済みコントラクトに対して再実行）
# 使い方: make verify-polygon ADDRESS=0x...
#         make verify-avalanche ADDRESS=0x...
# ------------------------------------------------------------------------------

verify-polygon: check-env-polygon-verify
	@test -n "$(ADDRESS)" || (echo "ERROR: ADDRESS is not set. Usage: make verify-polygon ADDRESS=0x..."; exit 1)
	forge verify-contract $(ADDRESS) \
		src/PermitPayment.sol:PermitPayment \
		--rpc-url $(POLYGON_RPC_URL) \
		--etherscan-api-key $(POLYGONSCAN_API_KEY) \
		--chain 137 \
		-vvvv

verify-avalanche: check-env-avalanche-verify
	@test -n "$(ADDRESS)" || (echo "ERROR: ADDRESS is not set. Usage: make verify-avalanche ADDRESS=0x..."; exit 1)
	forge verify-contract $(ADDRESS) \
		src/PermitPayment.sol:PermitPayment \
		--rpc-url $(AVALANCHE_RPC_URL) \
		--etherscan-api-key $(SNOWTRACE_API_KEY) \
		--verifier-url https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan \
		--chain 43114 \
		-vvvv

# ------------------------------------------------------------------------------
# デプロイ済みアドレスの確認
# ------------------------------------------------------------------------------

address-polygon:
	@jq -r '.transactions[0].contractAddress' broadcast/Deploy.s.sol/137/run-latest.json

address-avalanche:
	@jq -r '.transactions[0].contractAddress' broadcast/Deploy.s.sol/43114/run-latest.json
