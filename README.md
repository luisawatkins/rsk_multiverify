# RSK Multi-Verify

Batch smart-contract verification for Rootstock Blockscout.

Upload your Hardhat `build-info` artifacts, paste a deployments JSON, generate a verification plan, then verify every contract in one run (submit + poll status) with links to results.

## Features

- Upload one or more Hardhat `artifacts/build-info/*.json` files
- Parse compiled contracts and their fully qualified names (`path/to/File.sol:ContractName`)
- Paste or upload a deployments JSON and generate a verification plan
- Run verification for each plan item (submit, poll status, show success/failure)
- Optional Blockscout API key input (kept in memory in the browser)

## Quickstart

```bash
npm install
npm run dev
```

Open the app and follow the UI:

1. Upload Hardhat build-info JSON files
2. Paste or upload a deployments JSON
3. Click Generate plan
4. Click Run verification

## Deployments JSON Format

The app expects JSON that contains contract addresses and (optionally) constructor arguments.

Recommended shape (array of items):

```json
[
  {
    "address": "0x0000000000000000000000000000000000000000",
    "fullyQualifiedName": "contracts/Token.sol:Token",
    "constructorArgs": ["MyToken", "MTK", 18]
  }
]
```

Supported fields per item:

- `address` (required): deployed contract address
- `fullyQualifiedName` (optional): `path/to/File.sol:ContractName` (best matching)
- `contractName` (optional): falls back to name-only matching
- `constructorArgs` (optional): JSON array of constructor args (encoded client-side)
- `constructorArgsHex` (optional): pre-encoded constructor args hex (preferred if you already have it)

If both `constructorArgs` and `constructorArgsHex` are present, `constructorArgsHex` wins.

## Verification API

This app uses the Blockscout API endpoints exposed by Rootstock explorers:

- Submit: `GET/POST /api?module=contract&action=verifysourcecode` with `codeformat=solidity-standard-json-input`
- Poll: `GET /api?module=contract&action=checkverifystatus&guid=...`

Network base URLs:

- Rootstock Mainnet: https://rootstock.blockscout.com
- Rootstock Testnet: https://rootstock-testnet.blockscout.com

## Scripts

- `npm run dev`: start the dev server
- `npm run build`: typecheck + production build
- `npm run lint`: run ESLint
- `npm run preview`: preview production build locally

