/**
 * Chain Configurations — testnet defaults.
 *
 * These are the chain configurations for development and demo.
 * Production would use mainnet endpoints.
 */
export const TESTNET_CHAINS = [
    {
        chain: 'bitcoin',
        network: 'testnet',
        host: 'electrum.blockstream.info',
        port: 60001 // testnet port (mainnet is 50001)
    },
    {
        chain: 'spark',
        network: 'REGTEST' // MAINNET | SIGNET | REGTEST
    }
];
//# sourceMappingURL=chains.js.map