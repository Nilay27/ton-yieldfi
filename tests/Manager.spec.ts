import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address } from '@ton/core';
import { keyPairFromSeed, sign, getSecureRandomBytes } from '@ton/crypto';
import { compile } from '@ton/blueprint';
import { Manager, ManagerConfig } from '../wrappers/Manager';
import '@ton/test-utils';
import { randomAddress } from '@ton/test-utils';

describe('Manager', () => {
    let code: Cell;
    let adminKeyPair: { publicKey: Buffer; secretKey: Buffer };
    let fakeAdminKeyPair: { publicKey: Buffer; secretKey: Buffer };

    beforeAll(async () => {
        code = await compile('Manager');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let manager: SandboxContract<Manager>;
    let sTokenAddress: Address;
    let yTokenAddress: Address;
    let treasuryAddress: Address;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        // Generate keypair for admin
        const seed = await getSecureRandomBytes(32);
        adminKeyPair = keyPairFromSeed(seed);

        // Generate a fake admin keypair
        const fakeSeed = await getSecureRandomBytes(32);
        fakeAdminKeyPair = keyPairFromSeed(fakeSeed);

        // Generate Addresses for sToken, yToken, treasury
        sTokenAddress = randomAddress(); // Replace with actual method if necessary
        yTokenAddress = randomAddress(); // Replace with actual method if necessary
        treasuryAddress = randomAddress();
        console.log('sToken address:', sTokenAddress.toString());
        console.log('yToken address:', yTokenAddress.toString());
        console.log('treasury address:', treasuryAddress.toString());

        const config: ManagerConfig = {
            adminPubkey: adminKeyPair.publicKey.toString('hex'),
            sToken: sTokenAddress,
            yToken: yTokenAddress,
            treasury: treasuryAddress,
            isVault: false,
        };

        manager = blockchain.openContract(Manager.createFromConfig(config, code));
        const deployResult = await manager.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: manager.address,
            deploy: true,
            success: true,
        });
    });

    describe('Deployment and Initial State', () => {
        it('should deploy and read initial values', async () => {
            console.log('reached here');
            const stoken = await manager.getStoken();
            const ytoken = await manager.getYToken();
            const treasury = await manager.getTreasury();
            const vaultFlag = await manager.getIsVault();
            const contractAdminPubkey = await manager.getAdminPubkey();

            console.log('sToken:', stoken.toString());
            console.log('yToken:', ytoken.toString());
            console.log('treasury:', treasury.toString());
            console.log('vaultFlag:', vaultFlag);
            console.log('adminPubkey:', contractAdminPubkey);

            expect(stoken.toString()).toEqual(sTokenAddress.toString());
            expect(ytoken.toString()).toEqual(yTokenAddress.toString());
            expect(treasury.toString()).toEqual(treasuryAddress.toString());
            expect(vaultFlag).toBe(false);
            expect(contractAdminPubkey).toEqual(adminKeyPair.publicKey.toString('hex'));
        });

        it('should have the correct adminKeyPair set', async () => {
            const contractAdminPubkey = await manager.getAdminPubkey();
            expect(contractAdminPubkey).toEqual(adminKeyPair.publicKey.toString('hex'));
        });
    });

    describe('Set Tokens Functionality', () => {
        it('should set tokens with valid admin signature', async () => {
            const newSTokenAddress = randomAddress();
            const newYTokenAddress = randomAddress();
            const newTreasuryAddress = randomAddress();

            // Create the same reference cell that will be sent to the contract
            const refCell = beginCell()
                .storeAddress(newSTokenAddress)
                .storeAddress(newYTokenAddress)
                .storeAddress(newTreasuryAddress)
                .storeBit(false) // newIsVault
                .endCell();

            // Create message that matches what the contract will hash
            const message = beginCell().storeRef(refCell).endCell();

            const signature = sign(message.hash(), adminKeyPair.secretKey);

            const setResult = await manager.sendSetTokens(deployer.getSender(), {
                value: toNano('0.5'),
                signature,
                newSToken: newSTokenAddress,
                newYToken: newYTokenAddress,
                newTreasury: newTreasuryAddress,
                newIsVault: false,
            });

            expect(setResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: manager.address,
                success: true,
            });

            const stoken = await manager.getStoken();
            const ytoken = await manager.getYToken();
            const treasury = await manager.getTreasury();
            const vaultFlag = await manager.getIsVault();

            expect(stoken.toString()).toEqual(newSTokenAddress.toString());
            expect(ytoken.toString()).toEqual(newYTokenAddress.toString());
            expect(treasury.toString()).toEqual(newTreasuryAddress.toString());
            expect(vaultFlag).toBe(false);
        });

        it('should fail to set tokens with invalid admin signature', async () => {
            const newSTokenAddress = randomAddress();
            const newYTokenAddress = randomAddress();
            const newTreasuryAddress = randomAddress();

            // Create the same reference cell that will be sent to the contract
            const refCell = beginCell()
                .storeAddress(newSTokenAddress)
                .storeAddress(newYTokenAddress)
                .storeAddress(newTreasuryAddress)
                .storeBit(false) // newIsVault
                .endCell();

            // Create message that matches what the contract will hash
            const message = beginCell().storeRef(refCell).endCell();

            const signature = sign(message.hash(), fakeAdminKeyPair.secretKey);

            const setResult = await manager.sendSetTokens(deployer.getSender(), {
                value: toNano('0.5'),
                signature,
                newSToken: newSTokenAddress,
                newYToken: newYTokenAddress,
                newTreasury: newTreasuryAddress,
                newIsVault: false,
            });

            expect(setResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: manager.address,
                success: false,
                exitCode: 65534,
            });
        });
    });

    describe('Deposit Functionality', () => {
        it('should deposit with valid admin signature', async () => {
            const depositAmount = 50;
            const message = beginCell().storeUint(depositAmount, 32).endCell();

            const signature = sign(message.hash(), adminKeyPair.secretKey);

            const depositResult = await manager.sendDeposit(deployer.getSender(), {
                value: toNano('0.5'),
                signature,
                depositAmount,
            });

            expect(depositResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: manager.address,
                success: true,
            });

            // Optionally, verify the deposit was processed correctly
            // const currentBalance = await manager.getBalance();
            // expect(currentBalance).toBeGreaterThanOrEqual(toNano('0.5'));
        });

        it('should fail to deposit with invalid admin signature', async () => {
            const depositAmount = 50;
            const message = beginCell().storeUint(depositAmount, 32).endCell();

            const signature = sign(message.hash(), fakeAdminKeyPair.secretKey);

            const depositResult = await manager.sendDeposit(deployer.getSender(), {
                value: toNano('0.5'),
                signature,
                depositAmount,
            });

            expect(depositResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: manager.address,
                success: false,
                exitCode: 65534,
            });
        });
    });

    describe('Withdraw Functionality', () => {
        it('should withdraw with valid admin signature', async () => {
            const withdrawAmount = 12;
            const message = beginCell().storeUint(withdrawAmount, 32).endCell();

            const signature = sign(message.hash(), adminKeyPair.secretKey);

            const withdrawResult = await manager.sendWithdraw(deployer.getSender(), {
                value: toNano('0.5'),
                signature,
                withdrawAmount,
            });

            expect(withdrawResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: manager.address,
                success: true,
            });

        });

        it('should fail to withdraw with invalid admin signature', async () => {
            const withdrawAmount = 12;
            const message = beginCell().storeUint(withdrawAmount, 32).endCell();

            const signature = sign(message.hash(), fakeAdminKeyPair.secretKey);

            const withdrawResult = await manager.sendWithdraw(deployer.getSender(), {
                value: toNano('0.5'),
                signature,
                withdrawAmount,
            });

            expect(withdrawResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: manager.address,
                success: false,
                exitCode: 65534,
            });
        });
    });
});
