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
import { crc32 } from 'crc'; // Ensure the crc library is installed

export type ManagerConfig = {
    adminPubkey: string;      // public key as hex string
    sToken: Address;          // Address type
    yToken: Address;          // Address type
    treasury: Address;        // Address type
    isVault: boolean;
};

// Helper function to calculate the opcode dynamically
function calculateOpcode(opName: string): number {
    return crc32(opName) >>> 0; // Use unsigned shift to ensure the result is a 32-bit unsigned integer
}

export function managerConfigToCell(config: ManagerConfig): Cell {
    const refCell = beginCell()
        .storeAddress(config.treasury)
        .storeBit(config.isVault ? 1 : 0)
        .endCell();
    
    return beginCell()
        .storeBuffer(Buffer.from(config.adminPubkey, 'hex'))  // Store public key as Buffer
        .storeAddress(config.sToken)
        .storeAddress(config.yToken)
        .storeRef(refCell)
        .endCell();
}


// Define the opcodes dynamically
export const ManagerOpcodes = {
    setTokens: calculateOpcode("op::setTokens"),
    deposit: calculateOpcode("op::deposit"),
    withdraw: calculateOpcode("op::withdraw"),
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

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendSetTokens(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            signature: Buffer;
            newSToken: Address;
            newYToken: Address;
            newTreasury: Address;
            newIsVault: boolean;
        }
    ) {
        const refCell = beginCell()
            .storeAddress(opts.newSToken)     // Store as Address
            .storeAddress(opts.newYToken)     // Store as Address
            .storeAddress(opts.newTreasury)   // Store as Address
            .storeBit(opts.newIsVault ? 1 : 0) // Store as 1 bit
            .endCell();

        const body = beginCell()
            .storeUint(ManagerOpcodes.setTokens, 32)
            .storeUint(opts.queryID ?? 0, 64)
            .storeBuffer(opts.signature)
            .storeRef(refCell)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async sendDeposit(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            signature: Buffer;
            depositAmount: number;
        }
    ) {
        const body = beginCell()
            .storeUint(ManagerOpcodes.deposit, 32)
            .storeUint(opts.queryID ?? 0, 64)
            .storeBuffer(opts.signature)
            .storeUint(opts.depositAmount, 32)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async sendWithdraw(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
            withdrawAmount: number;
            signature: Buffer;
        }
    ) {
        const body = beginCell()
            .storeUint(ManagerOpcodes.withdraw, 32)
            .storeUint(opts.queryID ?? 0, 64)
            .storeBuffer(opts.signature)
            .storeUint(opts.withdrawAmount, 32)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async getStoken(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_stoken', []);
        return result.stack.readAddress();
    }

    async getYToken(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_ytoken', []);
        return result.stack.readAddress();
    }

    async getTreasury(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_treasury', []);
        return result.stack.readAddress();
    }

    async getIsVault(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_is_vault', []);
        return result.stack.readNumber() === 1;
    }

    async getAdminPubkey(provider: ContractProvider): Promise<string> {
        const result = await provider.get('get_admin_pubkey', []);
        return result.stack.readBigNumber().toString(16);
    }
}
