// rails/pyusdChain.mjs — PYUSD settlement on a public test network.
// Self-serve PayPal Payouts cannot send PYUSD, so the stablecoin leg moves
// on-chain (Ethereum Sepolia / Solana Devnet), faucet-funded. Dry-run simulates;
// live mode needs `ethers` + PYUSD_* env vars.
// ponytail: ethers is an optional dep, imported only when settling for real.
export async function sendPyusdPayout({ recipient, amountUsd }, { dryRun = true } = {}) {
  if (dryRun) {
    return {
      ok: true, status: 'CONFIRMED', ref: `0xDRYRUN-${recipient.id}`,
      rail: 'pyusd', network: process.env.PYUSD_NETWORK ?? 'sepolia',
    };
  }
  let ethers;
  try { ({ ethers } = await import('ethers')); }
  catch { throw new Error('on-chain mode needs `npm i ethers` and PYUSD_* env vars'); }

  const provider = new ethers.JsonRpcProvider(process.env.PYUSD_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PYUSD_PRIVATE_KEY, provider);
  const erc20 = new ethers.Contract(
    process.env.PYUSD_TOKEN_ADDRESS,
    ['function transfer(address,uint256) returns (bool)', 'function decimals() view returns (uint8)'],
    wallet,
  );
  const decimals = await erc20.decimals();
  const value = ethers.parseUnits(amountUsd.toFixed(2), decimals);
  // Destination: the recipient's wallet, else a configured demo address, else the
  // sender's own wallet (a valid on-chain tx you can show on the explorer).
  const to = recipient.walletAddress || process.env.PYUSD_DEMO_RECIPIENT || wallet.address;
  const tx = await erc20.transfer(to, value);
  const receipt = await tx.wait();
  return { ok: true, status: 'CONFIRMED', ref: receipt.hash, rail: 'pyusd', network: process.env.PYUSD_NETWORK ?? 'sepolia' };
}
