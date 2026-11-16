// Gas limits for the wallet pages' transactions. BNB Smart Chain refuses any
// transaction asking for more than 2^24 gas (BEP-652, as EIP-7825), so the
// padding added to an estimate can't push it past that, and the calls that
// pay many deposits at once are sized to fit.
import type { Address, PublicClient } from 'viem';
import { projectAbi } from './abi';

/** The most gas one transaction may ask for on BNB Smart Chain. */
export const TX_GAS_CAP = 16_777_216n;

/** Public RPC gas estimates can come in about 1% short (seen in the fund console). */
const GAS_PAD = (gas: bigint) => (gas * 13n) / 10n;
/**
 * Calls that pay every due cycle first cost more for each cycle that comes due
 * while the wallet waits (about 22,000 gas a cycle): room for a dozen more.
 * Unused gas isn't charged.
 */
const GROWTH_ROOM = 300_000n;

/** The gas limit to send with: the estimate with headroom, held to the network's cap. */
export function gasLimit(estimate: bigint, paysDueCycles: boolean): bigint {
  const padded = GAS_PAD(estimate) + (paysDueCycles ? GROWTH_ROOM : 0n);
  return padded > TX_GAS_CAP ? TX_GAS_CAP : padded;
}

/**
 * How many deposits one payDue(from, count) can take, up to `max`: the count
 * is halved until its estimate, with headroom, fits in a transaction. A run
 * costs more for every deposit and every cycle owed, so the right size
 * depends on how far behind payments are.
 */
export async function payCountThatFits(client: PublicClient, project: Address, from: bigint, max: bigint): Promise<bigint> {
  let n = max > 0n ? max : 1n;
  while (n > 1n) {
    try {
      const estimate = await client.estimateContractGas({ address: project, abi: projectAbi, functionName: 'payDue', args: [from, n] });
      if (GAS_PAD(estimate) + GROWTH_ROOM <= TX_GAS_CAP) break;
    } catch {
      // Over the cap, or over what the node will estimate: try fewer.
    }
    n /= 2n;
  }
  return n;
}
