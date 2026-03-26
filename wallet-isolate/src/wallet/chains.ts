/**
 * Chain Configurations — testnet defaults.
 *
 * These are the chain configurations for development and demo.
 * Production would use mainnet endpoints.
 */

import type { ChainConfig } from './types.js';
import { proc } from '../compat/process.js';

export const TESTNET_CHAINS: ChainConfig[] = [
  {
    chain: 'bitcoin',
    network: 'testnet',
    host: 'electrum.blockstream.info',
    port: 60001  // testnet port (mainnet is 50001)
  },
  {
    chain: 'spark',
    network: 'REGTEST'  // MAINNET | SIGNET | REGTEST
  },
  {
    chain: 'rgb',
    network: 'testnet',
    indexerUrl: proc.env.RGB_INDEXER_URL || '',
    dataDir: proc.env.RGB_DATA_DIR || '.rgb-data',
  }
];
