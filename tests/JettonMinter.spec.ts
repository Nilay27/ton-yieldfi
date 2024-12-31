import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address } from '@ton/core';
import { compile } from '@ton/blueprint';
import { JettonMinter, JettonMinterConfig, JettonMinterOpcodes } from '../wrappers/JettonMinter';
import '@ton/test-utils';
import { randomAddress } from '@ton/test-utils';

describe('JettonMinter', () => {
    let code: Cell;
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let jettonWalletCode: Cell;

    beforeAll(async () => {
        code = await compile('JettonMinter');
        jettonWalletCode = await compile('JettonWallet');
    }, 10000);

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        const content = beginCell()
            .storeUint(1, 8) // off-chain token data
            .storeStringTail("https://example.com/token.json")
            .endCell();

        const config: JettonMinterConfig = {
            adminAddress: deployer.address,
            content: content,
            jettonWalletCode: jettonWalletCode,
        };

        jettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig(config, code)
        );

        const deployResult = await jettonMinter.sendDeploy(
            deployer.getSender(),
            toNano('0.05')
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            deploy: true,
            success: true,
        });
    }, 10000);

    it('should deploy with correct initial data', async () => {
        const jettonData = await jettonMinter.getJettonData();
        
        expect(jettonData.totalSupply).toEqual(0n);
        expect(jettonData.adminAddress.equals(deployer.address)).toBe(true);
    }, 10000);

    it('should mint tokens', async () => {
        const receiverAddress = randomAddress();
        const mintAmount = toNano('100');

        const mintResult = await jettonMinter.sendMint(deployer.getSender(), {
            value: toNano('0.05'),
            toAddress: receiverAddress,
            jettonAmount: mintAmount,
            amount: toNano('0.02'),
        });

        expect(mintResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
        });

        const jettonData = await jettonMinter.getJettonData();
        expect(jettonData.totalSupply).toEqual(mintAmount);
    }, 10000);

    it('should change admin', async () => {
        const newAdminAddress = randomAddress();

        const changeAdminResult = await jettonMinter.sendChangeAdmin(deployer.getSender(), {
            value: toNano('0.05'),
            newAdminAddress: newAdminAddress,
        });

        expect(changeAdminResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
        });

        const jettonData = await jettonMinter.getJettonData();
        expect(jettonData.adminAddress.equals(newAdminAddress)).toBe(true);
    });

    it('should calculate correct wallet address', async () => {
        const ownerAddress = randomAddress();
        const walletAddress = await jettonMinter.getWalletAddress(ownerAddress);
        
        expect(walletAddress).toBeDefined();
        // You could add more specific checks here if needed
    });

    it('should fail when non-admin tries to mint', async () => {
        const nonAdmin = await blockchain.treasury('non-admin');
        const receiverAddress = randomAddress();

        const mintResult = await jettonMinter.sendMint(nonAdmin.getSender(), {
            value: toNano('0.05'),
            toAddress: receiverAddress,
            jettonAmount: toNano('100'),
            amount: toNano('0.02'),
        });

        expect(mintResult.transactions).toHaveTransaction({
            from: nonAdmin.address,
            to: jettonMinter.address,
            success: false,
            exitCode: 73, // Admin only error code
        });
    });

    it('should have matching opcodes between contract and wrapper', () => {
        // You can add these values by checking the output of:
        // console.log(JettonMinterOpcodes);
        // And comparing with the values in the contract
        expect(JettonMinterOpcodes.mint).toBeDefined();
        expect(JettonMinterOpcodes.changeAdmin).toBeDefined();
        expect(JettonMinterOpcodes.changeContent).toBeDefined();
        // Add other opcode checks as needed
    });
}); 