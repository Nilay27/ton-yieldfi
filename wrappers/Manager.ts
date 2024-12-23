import {
    Address,
    beginCell,
    Cell,
    contractAddress,
    Contract,
    ContractProvider,
    Sender,
    SendMode
} from '@ton/core';

export type ManagerConfig = {
    adminPubkey: bigint;
    sToken: bigint;
    yToken: bigint;
    treasury: bigint;
    isVault: boolean;
};

/**
 * Builds a Cell containing initial data. Because we can't store
 * 5 large fields in a single cell, we store 3 in the main cell
 * and 2 in a reference.
 */
export function managerConfigToCell(config: ManagerConfig): Cell {
    const mainBuilder = beginCell()
        // 3 fields (256 bits each) in main cell
        .storeUint(config.adminPubkey, 256)
        .storeUint(config.sToken, 256)
        .storeUint(config.yToken, 256);

    // build a reference for treasury + isVault
    const refBuilder = beginCell()
        .storeUint(config.treasury, 256)
        .storeUint(config.isVault ? 1 : 0, 1);

    mainBuilder.storeRef(refBuilder.endCell());
    return mainBuilder.endCell();
}

export const ManagerOpcodes = {
    setTokens: 0x5f69bec9,  // "op::setTokens"c in the contract
    deposit:   0x044d9f5b,  // "op::deposit"c
    withdraw:  0x5f37f333,  // "op::withdraw"c
};

export class Manager implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Manager(address);
    }

    static createFromConfig(config: ManagerConfig, code: Cell, workchain = 0) {
        const data = managerConfigToCell(config);
        const init = { code, data };
        return new Manager(contractAddress(workchain, init), init);
    }

    /**
     * Send an internal message with empty body to deploy
     */
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    /**
     * Send setTokens message:
     * [ opcode:32, query_id:64, newSToken:256, newYToken:256, newIsVault:1 ]
     */
    async sendSetTokens(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; queryID?: number; newSToken: bigint; newYToken: bigint; newIsVault: boolean }
    ) {
        const body = beginCell()
            .storeUint(ManagerOpcodes.setTokens, 32)
            .storeUint(opts.queryID ?? 0, 64)
            .storeUint(opts.newSToken, 256)
            .storeUint(opts.newYToken, 256)
            .storeUint(opts.newIsVault ? 1 : 0, 1)
            .endCell();

        return provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    /**
     * deposit: [ opcode:32, query_id:64, depositAmount:64 ]
     */
    async sendDeposit(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; queryID?: number; depositAmount: number }
    ) {
        const body = beginCell()
            .storeUint(ManagerOpcodes.deposit, 32)
            .storeUint(opts.queryID ?? 0, 64)
            .storeUint(opts.depositAmount, 64)
            .endCell();

        return provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    /**
     * withdraw: [ opcode:32, query_id:64, withdrawAmount:64 ]
     */
    async sendWithdraw(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; queryID?: number; withdrawAmount: number }
    ) {
        const body = beginCell()
            .storeUint(ManagerOpcodes.withdraw, 32)
            .storeUint(opts.queryID ?? 0, 64)
            .storeUint(opts.withdrawAmount, 64)
            .endCell();

        return provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    /**
     * get_stoken() method_id
     */
    async getStoken(provider: ContractProvider) {
        const res = await provider.get('get_stoken', []);
        return res.stack.readBigNumber(); // read as bigint
    }

    /**
     * get_is_vault() method_id
     */
    async getIsVault(provider: ContractProvider): Promise<boolean> {
        const res = await provider.get('get_is_vault', []);
        return res.stack.readNumber() === 1;
    }
}
