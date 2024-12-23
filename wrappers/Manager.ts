import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
} from '@ton/core';
import { crc32 } from 'crc'; // You'll need to install this package

export type ManagerConfig = {
    sToken: number;
    isVault: boolean;
};

// Helper function to calculate the opcode dynamically
function calculateOpcode(opName: string): number {
    return crc32(opName) >>> 0; // Use unsigned shift to ensure the result is a 32-bit unsigned integer
}


export function managerConfigToCell(config: ManagerConfig): Cell {
    // store 32 bits for sToken, 1 bit for isVault
    return beginCell()
        .storeUint(config.sToken, 32)
        .storeUint(config.isVault ? 1 : 0, 1)
        .endCell();
}

// Define the opcodes dynamically
export const ManagerOpcodes = {
    setTokens: calculateOpcode("op::setTokens"), // Dynamically calculated CRC32
    deposit: calculateOpcode("op::deposit"),    // Dynamically calculated CRC32
    withdraw: calculateOpcode("op::withdraw"),  // Dynamically calculated CRC32
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
     * Deploy the contract by sending an empty body.
     * Return { transactions: ... } so the test can do `expect(result.transactions).toHaveTransaction(...)`.
     */
    async sendDeploy(
        provider: ContractProvider,
        via: Sender,
        value: bigint
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    /**
     * setTokens
     * [ opcode(32), queryId(64), newSToken(32), newIsVault(1) ]
     */
    async sendSetTokens(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            newSToken: number;
            newIsVault: boolean;
        }
    ){
        const body = beginCell()
            .storeUint(ManagerOpcodes.setTokens, 32)
            .storeUint(opts.queryID ?? 0, 64)
            .storeUint(opts.newSToken, 32)
            .storeUint(opts.newIsVault ? 1 : 0, 1)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    /**
     * deposit
     * [ opcode(32), queryId(64), depositAmount(32) ]
     */
    async sendDeposit(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            depositAmount: number;
        }
    ) {
        const body = beginCell()
            .storeUint(ManagerOpcodes.deposit, 32)
            .storeUint(opts.queryID ?? 0, 64)
            .storeUint(opts.depositAmount, 32)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    /**
     * withdraw
     * [ opcode(32), queryId(64), withdrawAmount(32) ]
     */
    async sendWithdraw(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            withdrawAmount: number;
        }
    ) {
        const body = beginCell()
            .storeUint(ManagerOpcodes.withdraw, 32)
            .storeUint(opts.queryID ?? 0, 64)
            .storeUint(opts.withdrawAmount, 32)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    /**
     * get_stoken => read g_sToken
     */
    async getStoken(provider: ContractProvider): Promise<number> {
        const res = await provider.get('get_stoken', []);
        return res.stack.readNumber();
    }

    /**
     * get_is_vault => read g_isVault
     */
    async getIsVault(provider: ContractProvider): Promise<boolean> {
        const res = await provider.get('get_is_vault', []);
        return res.stack.readNumber() === 1;
    }
}
