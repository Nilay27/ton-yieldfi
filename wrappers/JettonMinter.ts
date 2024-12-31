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

// Define the opcodes dynamically
export const JettonMinterOpcodes = {
    mint: calculateOpcode("op::mint"),
    burnNotification: calculateOpcode("op::burn_notification"),
    provideWalletAddress: calculateOpcode("op::provide_wallet_address"),
    takeWalletAddress: calculateOpcode("op::take_wallet_address"),
    changeAdmin: calculateOpcode("op::change_admin"),
    changeContent: calculateOpcode("op::change_content"),
    excesses: calculateOpcode("op::excesses"),
};

export type JettonMinterConfig = {
    adminAddress: Address;
    content: Cell;
    jettonWalletCode: Cell;
};

export function jettonMinterConfigToCell(config: JettonMinterConfig): Cell {
    return beginCell()
        .storeCoins(0) // initial supply
        .storeAddress(config.adminAddress)
        .storeRef(config.content)
        .storeRef(config.jettonWalletCode)
        .endCell();
}

export class JettonMinter implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new JettonMinter(address);
    }

    static createFromConfig(config: JettonMinterConfig, code: Cell, workchain = 0) {
        const data = jettonMinterConfigToCell(config);
        const init = { code, data };
        return new JettonMinter(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendMint(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            toAddress: Address;
            jettonAmount: bigint;
            amount: bigint;
            queryId?: number;
        }
    ) {
        const masterMessage = beginCell()
            .storeUint(JettonMinterOpcodes.takeWalletAddress, 32)
            .storeUint(opts.queryId ?? 0, 64)
            .storeCoins(opts.jettonAmount)
            .endCell();

        const body = beginCell()
            .storeUint(JettonMinterOpcodes.mint, 32)
            .storeUint(opts.queryId ?? 0, 64)
            .storeAddress(opts.toAddress)
            .storeCoins(opts.amount)
            .storeRef(masterMessage)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async sendChangeAdmin(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            newAdminAddress: Address;
            queryId?: number;
        }
    ) {
        const body = beginCell()
            .storeUint(JettonMinterOpcodes.changeAdmin, 32)
            .storeUint(opts.queryId ?? 0, 64)
            .storeAddress(opts.newAdminAddress)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async sendChangeContent(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            content: Cell;
            queryId?: number;
        }
    ) {
        const body = beginCell()
            .storeUint(JettonMinterOpcodes.changeContent, 32)
            .storeUint(opts.queryId ?? 0, 64)
            .storeRef(opts.content)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async getJettonData(provider: ContractProvider) {
        const { stack } = await provider.get('get_jetton_data', []);
        return {
            totalSupply: stack.readBigNumber(),
            mintable: stack.readNumber(),
            adminAddress: stack.readAddress(),
            content: stack.readCell(),
            jettonWalletCode: stack.readCell(),
        };
    }

    async getWalletAddress(provider: ContractProvider, ownerAddress: Address) {
        const { stack } = await provider.get('get_wallet_address', [{
            type: 'slice',
            cell: beginCell().storeAddress(ownerAddress).endCell()
        }]);
        return stack.readAddress();
    }
} 