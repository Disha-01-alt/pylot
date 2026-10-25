// Read-only preflight for the PYUSD on-chain leg: RPC reachable, wallet funded
// with Sepolia ETH (gas) and test PYUSD. No transaction is sent.
// Run:  node --env-file=.env scripts/check-pyusd.mjs
import { ethers } from 'ethers';

const { PYUSD_RPC_URL, PYUSD_PRIVATE_KEY, PYUSD_TOKEN_ADDRESS } = process.env;
const miss = ['PYUSD_RPC_URL', 'PYUSD_PRIVATE_KEY', 'PYUSD_TOKEN_ADDRESS'].filter((k) => !process.env[k]);
if (miss.length) { console.error(`❌ missing in .env: ${miss.join(', ')}`); process.exit(1); }

try {
  const provider = new ethers.JsonRpcProvider(PYUSD_RPC_URL);
  const wallet = new ethers.Wallet(PYUSD_PRIVATE_KEY, provider);
  const erc20 = new ethers.Contract(PYUSD_TOKEN_ADDRESS, [
    'function balanceOf(address) view returns (uint256)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
  ], provider);
  const [net, eth, sym, dec] = await Promise.all([
    provider.getNetwork(), provider.getBalance(wallet.address), erc20.symbol(), erc20.decimals(),
  ]);
  const bal = await erc20.balanceOf(wallet.address);
  console.log(`✅ RPC OK — chain ${net.chainId} (${net.name})`);
  console.log(`   wallet  ${wallet.address}`);
  console.log(`   gas     ${ethers.formatEther(eth)} ETH ${eth > 0n ? '' : '← FUND THIS (Sepolia faucet)'}`);
  console.log(`   token   ${ethers.formatUnits(bal, dec)} ${sym} ${bal > 0n ? '' : '← FUND THIS (PYUSD faucet)'}`);
  process.exit(eth > 0n && bal > 0n ? 0 : 2);
} catch (e) {
  console.error(`❌ on-chain preflight failed: ${e.message}`);
  process.exit(1);
}
