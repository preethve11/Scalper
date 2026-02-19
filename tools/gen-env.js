const fs = require('fs');
const path = require('path');
const { Keypair } = require('@solana/web3.js');

function main() {
  const kp = Keypair.generate();
  const secretArray = Array.from(kp.secretKey);
  const envLines = [
    `PRIVATE_KEY=${JSON.stringify(secretArray)}`,
    `RPC_URL=https://api.mainnet-beta.solana.com`,
    `LOG_LEVEL=info`,
    `BACKTEST_INITIAL_BALANCE=1000`,
  ];
  const envPath = path.join(process.cwd(), '.env');
  fs.writeFileSync(envPath, envLines.join('\n'));
  console.log('Wrote .env with generated PRIVATE_KEY for', kp.publicKey.toBase58());
}

main();


