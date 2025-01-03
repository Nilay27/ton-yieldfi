import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Dictionary,
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
    // New opcodes
    setPrice: calculateOpcode("op::set_price"),
    setStoken: calculateOpcode("op::set_stoken"),
    syncJetton: calculateOpcode("op::sync_jetton"),
    deposit: calculateOpcode("op::deposit"),
    withdraw: calculateOpcode("op::withdraw"),
    rescue: calculateOpcode("op::rescue"),
    setBlacklisted: calculateOpcode("op::set_blacklisted"),
};

export type JettonMinterConfig = {
    adminAddress: Address;
    content: Cell;
    jettonWalletCode: Cell;
    // Additional fields
    totalSupply?: bigint;
    lastSyncSupply?: bigint;
    storedPrice?: number;
    sTokenAddress?: Address;
    blacklistedDict?: Dictionary<Address, boolean>;
};

export function jettonMinterConfigToCell(config: JettonMinterConfig): Cell {
    // Create empty dictionary for blacklist if not provided
    const blacklistedDict = config.blacklistedDict ?? Dictionary.empty();
    
    // Create reference cell with additional data
    const additionalData = beginCell()
        .storeCoins(config.lastSyncSupply ?? 0n)
        .storeInt(config.storedPrice ?? 0, 32)
        .storeAddress(config.sTokenAddress ?? Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"))  // Default zero address
        .storeDict(blacklistedDict)
        .endCell();

    return beginCell()
        .storeCoins(config.totalSupply ?? 0n)
        .storeAddress(config.adminAddress)
        .storeRef(config.content)
        .storeRef(config.jettonWalletCode)
        .storeRef(additionalData)
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

    async sendSetPrice(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            price: number;
            queryId?: number;
        }
    ) {
        const body = beginCell()
            .storeUint(JettonMinterOpcodes.setPrice, 32)
            .storeUint(opts.queryId ?? 0, 64)
            .storeInt(opts.price, 32)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async sendSetBlacklisted(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            address: Address;
            blacklisted: boolean;
            queryId?: number;
        }
    ) {
        const body = beginCell()
            .storeUint(JettonMinterOpcodes.setBlacklisted, 32)
            .storeUint(opts.queryId ?? 0, 64)
            .storeAddress(opts.address)
            .storeUint(opts.blacklisted ? 1 : 0, 1)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async sendSetStoken(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            sTokenAddress: Address;
            queryId?: number;
        }
    ) {
        const body = beginCell()
            .storeUint(JettonMinterOpcodes.setStoken, 32)
            .storeUint(opts.queryId ?? 0, 64)
            .storeAddress(opts.sTokenAddress)
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

    async sendSyncJetton(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        queryId?: number;
    }) {
        const body = beginCell()
            .storeUint(JettonMinterOpcodes.syncJetton, 32)
            .storeUint(opts.queryId ?? 0, 64)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async sendDeposit(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        tokenAddress: Address;
        depositAmount: bigint;
        receiverAddress: Address;
        queryId?: number;
    }) {
        const body = beginCell()
            .storeUint(JettonMinterOpcodes.deposit, 32)
            .storeUint(opts.queryId ?? 0, 64)
            .storeAddress(opts.tokenAddress)
            .storeCoins(opts.depositAmount)
            .storeAddress(opts.receiverAddress)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async sendWithdraw(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        shares: bigint;
        receiver: Address;
        owner: Address;
        queryId?: number;
    }) {
        const body = beginCell()
            .storeUint(JettonMinterOpcodes.withdraw, 32)
            .storeUint(opts.queryId ?? 0, 64)
            .storeCoins(opts.shares)
            .storeAddress(opts.receiver)
            .storeAddress(opts.owner)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async sendRescue(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        toAddress: Address;
        amount: bigint;
        queryId?: number;
    }) {
        const body = beginCell()
            .storeUint(JettonMinterOpcodes.rescue, 32)
            .storeUint(opts.queryId ?? 0, 64)
            .storeAddress(opts.toAddress)
            .storeCoins(opts.amount)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }
} 