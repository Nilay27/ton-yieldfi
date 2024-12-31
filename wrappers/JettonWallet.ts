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
import { crc32 } from 'crc';

// Helper function to calculate the opcode dynamically
function calculateOpcode(opName: string): number {
    return crc32(opName) >>> 0;
}

export type JettonWalletConfig = {
    balance: bigint;
    ownerAddress: Address;
    jettonMasterAddress: Address;
    jettonWalletCode: Cell;
};

export const JettonWalletOpcodes = {
    transfer: calculateOpcode("op::transfer"),
    internalTransfer: calculateOpcode("op::internal_transfer"),
    burn: calculateOpcode("op::burn"),
    transferNotification: calculateOpcode("op::transfer_notification"),
    excesses: calculateOpcode("op::excesses"),
};

export function jettonWalletConfigToCell(config: JettonWalletConfig): Cell {
    return beginCell()
        .storeCoins(config.balance)
        .storeAddress(config.ownerAddress)
        .storeAddress(config.jettonMasterAddress)
        .storeRef(config.jettonWalletCode)
        .endCell();
}

export class JettonWallet implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new JettonWallet(address);
    }

    static createFromConfig(config: JettonWalletConfig, code: Cell, workchain = 0) {
        const data = jettonWalletConfigToCell(config);
        const init = { code, data };
        return new JettonWallet(contractAddress(workchain, init), init);
    }

    async sendTransfer(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            toAddress: Address;
            jettonAmount: bigint;
            responseAddress: Address;
            forwardTonAmount: bigint;
            forwardPayload: Cell;
            queryId?: number;
        }
    ) {
        const body = beginCell()
            .storeUint(JettonWalletOpcodes.transfer, 32)
            .storeUint(opts.queryId ?? 0, 64)
            .storeCoins(opts.jettonAmount)
            .storeAddress(opts.toAddress)
            .storeAddress(opts.responseAddress)
            .storeBit(false) // null custom_payload
            .storeCoins(opts.forwardTonAmount)
            .storeBit(false) // forward_payload in this cell
            .storeRef(opts.forwardPayload)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async sendBurn(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            jettonAmount: bigint;
            responseAddress: Address;
            queryId?: number;
        }
    ) {
        const body = beginCell()
            .storeUint(JettonWalletOpcodes.burn, 32)
            .storeUint(opts.queryId ?? 0, 64)
            .storeCoins(opts.jettonAmount)
            .storeAddress(opts.responseAddress)
            .storeBit(false) // null custom_payload
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async getWalletData(provider: ContractProvider) {
        const { stack } = await provider.get('get_wallet_data', []);
        return {
            balance: stack.readBigNumber(),
            ownerAddress: stack.readAddress(),
            jettonMasterAddress: stack.readAddress(),
            jettonWalletCode: stack.readCell(),
        };
    }
} 