# permit-payment-dapp

ERC-2612 (permit) を利用したガスレス送金 dApp。受け手がQRコードを提示し、送り手がスキャン・署名、受け手がラッパーコントラクトを呼び出してガス代を負担する。

## Architecture

```
permit-payment-dapp/
├── contracts/          # Foundry プロジェクト
│   ├── src/
│   │   └── PermitPayment.sol       # permit + transferFrom をatomic実行するラッパー
│   ├── test/
│   │   └── PermitPayment.t.sol     # Foundry テスト (fork 不要)
│   ├── script/
│   │   └── Deploy.s.sol            # デプロイスクリプト
│   └── foundry.toml
└── app/                # React + Vite フロントエンド
    ├── src/
    │   ├── lib/
    │   │   ├── chains.ts           # チェーン設定 / JPYC アドレス
    │   │   ├── contracts.ts        # ABI 定義
    │   │   └── permit.ts           # EIP-712 署名ヘルパー
    │   ├── pages/
    │   │   ├── Home.tsx            # ロール選択（受け手 / 送り手）
    │   │   ├── ReceiverFlow.tsx    # 受け手フロー (R-1 〜 R-4)
    │   │   └── SenderFlow.tsx      # 送り手フロー (S-1 〜 S-3)
    │   ├── components/
    │   │   ├── QRDisplay.tsx       # QRコード表示 (qrcode.react)
    │   │   └── QRScanner.tsx       # カメラスキャン (@zxing/browser)
    │   ├── wagmi.ts                # wagmi + RainbowKit 設定
    │   ├── App.tsx
    │   └── main.tsx
    ├── .env.example
    ├── package.json
    ├── vite.config.ts
    └── tsconfig.json
```

## Payment Flow

```
[受け手]
  R-1. 金額・token・deadline を入力 → QR_A を表示
  R-2. 送り手が署名完了するのを待ち、QR_B をスキャン
  R-3. 内容確認 → permitAndTransfer() を送信（ガス代を支払う）
  R-4. 完了表示

[送り手]
  S-1. カメラで QR_A をスキャン
  S-2. 内容確認（送り先・金額・deadline）
  S-3. ウォレットで permit 署名（ガスなし）→ QR_B を表示
```

### QR_A (permit-request)

受け手から送り手へ渡す支払いリクエスト。

```json
{
  "type": "permit-request",
  "chainId": 137,
  "token": "0x...",
  "receiver": "0x...",
  "value": "1000000",
  "deadline": 1712345678
}
```

`value` は decimals 考慮済みの最小単位。JPYC は decimals = 6。

### QR_B (permit-signature)

送り手から受け手へ渡す署名データ。

```json
{
  "type": "permit-signature",
  "chainId": 137,
  "token": "0x...",
  "owner": "0x...",
  "receiver": "0x...",
  "value": "1000000",
  "deadline": 1712345678,
  "v": 27,
  "r": "0x...",
  "s": "0x..."
}
```

QR_B は署名 (v/r/s) を含むため約500バイトになる。`QRDisplay` はエラー訂正レベル L を使用してデータ容量を確保している。

## Contract

### PermitPayment.sol

```solidity
function permitAndTransfer(
    address token,
    address owner,
    address receiver,
    uint256 value,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
) external;
```

- `permit()` と `transferFrom()` を 1 トランザクションで atomic に実行する
- `require(msg.sender == receiver)` により、QR_B 傍受による receiver 差し替え攻撃を防ぐ
- `spender` はこのコントラクト自身のアドレスになる

### EIP-712 Domain

JPYC は permit の `version` フィールドに `"2"` が必要。`permit.ts` で明示的に指定している。

```typescript
const domain = {
  name: await token.name(),  // オンチェーンから取得
  version: "2",              // JPYC 固有の要件
  chainId,
  verifyingContract: tokenAddress,
};
```

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`)
- Node.js >= 20
- npm >= 10

## Setup

### 1. Contracts

```bash
cd contracts

# OpenZeppelin をインストール
forge install OpenZeppelin/openzeppelin-contracts

# ビルド
forge build

# テスト
forge test -vv
```

### 2. App

```bash
cd app

npm install

cp .env.example .env
# .env を編集して VITE_WALLETCONNECT_PROJECT_ID を設定する
```

`app/.env`:

```
VITE_WALLETCONNECT_PROJECT_ID=<WalletConnect Cloud から取得>
VITE_PERMIT_PAYMENT_POLYGON=0x...    # デプロイ後に設定
VITE_PERMIT_PAYMENT_AVALANCHE=0x...  # デプロイ後に設定
```

WalletConnect Project ID は https://cloud.walletconnect.com で無料取得できる。

### 3. 開発サーバー起動

```bash
cd app
npm run dev
```

## Deployment

### コントラクトのデプロイ

```bash
cd contracts

# .env に秘密鍵を設定
echo "PRIVATE_KEY=0x..." > .env
echo "POLYGON_RPC_URL=https://polygon-rpc.com" >> .env
echo "POLYGONSCAN_API_KEY=..." >> .env

# Polygon にデプロイ（--verify でソース検証も同時に行う）
forge script script/Deploy.s.sol \
  --rpc-url polygon \
  --broadcast \
  --verify \
  -vvvv
```

デプロイされたアドレスを `app/.env` の `VITE_PERMIT_PAYMENT_POLYGON` に設定する。

### フロントエンドのビルド

```bash
cd app
npm run build
# dist/ を任意の静的ホスティング (Vercel, Cloudflare Pages 等) にデプロイ
```

## Supported Networks

| Network          | chainId | JPYC Address |
|------------------|---------|--------------|
| Polygon Mainnet  | 137     | `0x431D5dfF03120AFA4bDf332c61A6e1766eF37BF9` |
| Avalanche C-Chain | 43114  | `0x431D5dfF03120AFA4bDf332c61A6e1766eF37BF9` |

チェーンの追加は `app/src/lib/chains.ts` の `CHAIN_CONFIGS` に追加する。

## Security Notes

| リスク | 対策 |
|--------|------|
| QR_B 傍受による receiver 差し替え | コントラクトで `msg.sender == receiver` を強制 |
| deadline を悪用した長期有効な署名 | デフォルト 10 分、最大 60 分に制限 |
| permit 後の frontrun | `permit` と `transferFrom` を同一 tx で atomic 実行 |
| チェーン間リプレイ | EIP-712 domain に `chainId` を含める |
| 大額送金 | 100,000 JPYC 超の場合は UI で allowlist 登録を促す警告を表示 |

## Tech Stack

| 用途 | ライブラリ |
|------|-----------|
| フレームワーク | React 18 + Vite 5 |
| ウォレット接続 | wagmi v2 + RainbowKit v2 |
| チェーン操作 | viem v2 |
| QRコード生成 | qrcode.react |
| QRコードスキャン | @zxing/browser |
| コントラクト開発 | Foundry |
| コントラクト依存 | OpenZeppelin Contracts v5 |
