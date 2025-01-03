import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address, Dictionary } from '@ton/core';
import { compile } from '@ton/blueprint';
import { JettonMinter, JettonMinterConfig, JettonMinterOpcodes } from '../wrappers/JettonMinter';
import '@ton/test-utils';
import { randomAddress } from '@ton/test-utils';
import { JettonWallet } from '../wrappers/JettonWallet';

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

        jettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig({
                adminAddress: deployer.address,
                content: content,
                totalSupply: 0n,
                lastSyncSupply: 0n,
                storedPrice: 1000_000, // Initial price
                sTokenAddress: deployer.address, // Using deployer as mock sToken address
                blacklistedDict: Dictionary.empty()
            }, code)
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
        const receiverWalletAddress = await jettonMinter.getWalletAddress(receiverAddress);
        const mintAmount = toNano('10000');

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

        // check balance of jetton wallet
        const jettonWallet = blockchain.openContract(JettonWallet.createFromAddress(receiverWalletAddress));
        const walletData = await jettonWallet.getWalletData();
        expect(walletData.balance).toEqual(mintAmount);
        expect(walletData.ownerAddress.equals(receiverAddress)).toBe(true);
        expect(walletData.jettonMasterAddress.equals(jettonMinter.address)).toBe(true);
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

    // Basic Admin Operations Tests
    describe('Admin Operations', () => {
        it('should change admin successfully', async () => {
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

        it('should fail when non-admin tries to change admin', async () => {
            const nonAdmin = await blockchain.treasury('non-admin');
            const newAdminAddress = randomAddress();

            const changeAdminResult = await jettonMinter.sendChangeAdmin(nonAdmin.getSender(), {
                value: toNano('0.05'),
                newAdminAddress: newAdminAddress,
            });

            expect(changeAdminResult.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: jettonMinter.address,
                success: false,
                exitCode: 73, // Admin only error code
            });
        });
    });

    // Price Management Tests
    describe('Price Management', () => {
        it('should set price successfully', async () => {
            const newPrice = 2000000;
            const setPriceResult = await jettonMinter.sendSetPrice(deployer.getSender(), {
                value: toNano('0.05'),
                price: newPrice,
            });

            expect(setPriceResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: jettonMinter.address,
                success: true,
            });
        });

        it('should fail when non-admin tries to set price', async () => {
            const nonAdmin = await blockchain.treasury('non-admin');
            const newPrice = 2000000;

            const setPriceResult = await jettonMinter.sendSetPrice(nonAdmin.getSender(), {
                value: toNano('0.05'),
                price: newPrice,
            });

            expect(setPriceResult.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: jettonMinter.address,
                success: false,
                exitCode: 73,
            });
        });

        it('should fail when setting invalid price (zero or negative)', async () => {
            const setPriceResult = await jettonMinter.sendSetPrice(deployer.getSender(), {
                value: toNano('0.05'),
                price: 0,
            });

            expect(setPriceResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: jettonMinter.address,
                success: false,
                exitCode: 0xE1, // Price validation error code
            });
        });
    });

    // Blacklist Management Tests
    describe('Blacklist Management', () => {
        it('should blacklist address successfully', async () => {
            const addressToBlacklist = randomAddress();
            const blacklistResult = await jettonMinter.sendSetBlacklisted(deployer.getSender(), {
                value: toNano('0.05'),
                address: addressToBlacklist,
                blacklisted: true,
            });

            expect(blacklistResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: jettonMinter.address,
                success: true,
            });
        });

        it('should remove address from blacklist', async () => {
            const addressToBlacklist = randomAddress();
            
            // First blacklist
            const blacklistResult = await jettonMinter.sendSetBlacklisted(deployer.getSender(), {
                value: toNano('0.05'),
                address: addressToBlacklist,
                blacklisted: true,
            });
            expect(blacklistResult.transactions).toHaveTransaction({
                success: true,
            });

            // Then remove from blacklist
            const unblacklistResult = await jettonMinter.sendSetBlacklisted(deployer.getSender(), {
                value: toNano('0.05'),
                address: addressToBlacklist,
                blacklisted: false,
            });

            expect(unblacklistResult.transactions).toHaveTransaction({
                success: true,
            });
        });

        it('should fail when non-admin tries to blacklist', async () => {
            const nonAdmin = await blockchain.treasury('non-admin');
            const addressToBlacklist = randomAddress();

            const blacklistResult = await jettonMinter.sendSetBlacklisted(nonAdmin.getSender(), {
                value: toNano('0.05'),
                address: addressToBlacklist,
                blacklisted: true,
            });

            expect(blacklistResult.transactions).toHaveTransaction({
                success: false,
                exitCode: 73,
            });
        });

        it('should fail when admin tries to mint to blacklisted address', async () => {
            const addressToBlacklist = randomAddress();
            await jettonMinter.sendSetBlacklisted(deployer.getSender(), {
                value: toNano('0.05'),
                address: addressToBlacklist,
                blacklisted: true,
            });

            const mintResult = await jettonMinter.sendMint(deployer.getSender(), {
                value: toNano('0.05'),
                toAddress: addressToBlacklist,
                jettonAmount: toNano('100'),
                amount: toNano('0.02'),
            });

            expect(mintResult.transactions).toHaveTransaction({
                success: false,
                exitCode: 0xBA, // Blacklist error code
            });
        });

        it('should succeed when admin mints to non-blacklisted address', async () => {
            const addressToBlacklist = randomAddress();
            
            // First blacklist
            await jettonMinter.sendSetBlacklisted(deployer.getSender(), {
                value: toNano('0.05'),
                address: addressToBlacklist,
                blacklisted: true,
            });

            // Try to mint to blacklisted address - should fail
            const mintResult = await jettonMinter.sendMint(deployer.getSender(), {
                value: toNano('0.05'),
                toAddress: addressToBlacklist,
                jettonAmount: toNano('100'),
                amount: toNano('0.02'),
            });

            expect(mintResult.transactions).toHaveTransaction({
                success: false,
                exitCode: 0xBA, // Blacklist error code
            });

            // Then remove from blacklist
            await jettonMinter.sendSetBlacklisted(deployer.getSender(), {
                value: toNano('0.05'),
                address: addressToBlacklist,
                blacklisted: false,
            });

            // Should now be able to mint to this address
            const successfulMintResult = await jettonMinter.sendMint(deployer.getSender(), {
                value: toNano('0.05'),
                toAddress: addressToBlacklist,
                jettonAmount: toNano('100'),
                amount: toNano('0.02'),
            });

            expect(successfulMintResult.transactions).toHaveTransaction({
                success: true,
            });
        });
    });

    // Supply Management and Sync Tests
    describe('Supply Management', () => {
        it('should track supply changes correctly through mint', async () => {
            const mintAmount = toNano('100');
            await jettonMinter.sendMint(deployer.getSender(), {
                value: toNano('0.05'),
                toAddress: randomAddress(),
                jettonAmount: mintAmount,
                amount: toNano('0.02'),
            });

            const jettonData = await jettonMinter.getJettonData();
            expect(jettonData.totalSupply).toEqual(mintAmount);
        });

        it('should sync supply correctly', async () => {
            // First mint some tokens
            const mintAmount = toNano('100');
            await jettonMinter.sendMint(deployer.getSender(), {
                value: toNano('0.05'),
                toAddress: randomAddress(),
                jettonAmount: mintAmount,
                amount: toNano('0.02'),
            });

            // Then sync
            const syncResult = await jettonMinter.sendSyncJetton(deployer.getSender(), {
                value: toNano('0.05'),
            });

            expect(syncResult.transactions).toHaveTransaction({
                success: true,
            });
        });

        it('should sync supply correctly when supply is more than lastSyncSupply', async () => {
            const mintAmount = toNano('100');
            // get the current supply
            const jettonData = await jettonMinter.getJettonData();
            const lastSyncSupply = jettonData.totalSupply;

            await jettonMinter.sendMint(deployer.getSender(), {
                value: toNano('0.05'),
                toAddress: randomAddress(),
                jettonAmount: mintAmount,
                amount: toNano('0.02'),
            });

            const syncResult = await jettonMinter.sendSyncJetton(deployer.getSender(), {
                value: toNano('0.05'),
            });

            expect(syncResult.transactions).toHaveTransaction({
                success: true,
            });

            const jettonDataAfterSync = await jettonMinter.getJettonData();
            expect(jettonDataAfterSync.totalSupply).toEqual(lastSyncSupply + mintAmount);
        });

        it('should fail when non-admin tries to sync', async () => {
            const nonAdmin = await blockchain.treasury('non-admin');
            const syncResult = await jettonMinter.sendSyncJetton(nonAdmin.getSender(), {
                value: toNano('0.05'),
            });

            expect(syncResult.transactions).toHaveTransaction({
                success: false,
                exitCode: 73,
            });
        });
    });

    // Deposit and Withdraw Tests
    describe('Deposit and Withdraw', () => {
        it('should process deposit correctly', async () => {
            const depositAmount = toNano('100');
            const receiver = randomAddress();

            const depositResult = await jettonMinter.sendDeposit(deployer.getSender(), {
                value: toNano('0.05'),
                tokenAddress: randomAddress(), // mock token address
                depositAmount: depositAmount,
                receiverAddress: receiver,
                amount: toNano('0.02'),
            });

            expect(depositResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: jettonMinter.address,
                success: true,
            });
        });

        it("should increase YToken balance of receiver on deposit", async () => {
            // get the current balance of the receiver's jetton wallet
            const receiver = randomAddress();
            const receiverWalletAddress = await jettonMinter.getWalletAddress(receiver);
            const jettonWallet = blockchain.openContract(JettonWallet.createFromAddress(receiverWalletAddress));

            // lets set the price to 2
            const newPrice = 2;
            await jettonMinter.sendSetPrice(deployer.getSender(), {
                value: toNano('0.05'),
                price: newPrice,
            });
            // mint so that the receiver has a jetton wallet
            await jettonMinter.sendMint(deployer.getSender(), {
                value: toNano('0.05'),
                toAddress: receiver,
                jettonAmount: toNano('100'),
                amount: toNano('0.02'),
            });
            const walletDataBeforeDeposit = await jettonWallet.getWalletData();
            const walletBalanceBeforeDeposit = walletDataBeforeDeposit.balance;
            console.log("walletBalanceBeforeDeposit", walletBalanceBeforeDeposit);

            // deposit
            const depositAmount = toNano('100');
            const depositResult = await jettonMinter.sendDeposit(deployer.getSender(), {
                value: toNano('0.05'),
                tokenAddress: randomAddress(),
                depositAmount: depositAmount,
                receiverAddress: receiver,
                amount: toNano('0.02'),
            });

            expect(depositResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: jettonMinter.address,
                success: true,
            });

            expect(depositResult.transactions).toHaveTransaction({
                from: jettonMinter.address,
                to: receiverWalletAddress,
                success: true,
            });

            // check the balance of the receiver's jetton wallet
            const walletDataAfterDeposit = await jettonWallet.getWalletData();
            const walletBalanceAfterDeposit = walletDataAfterDeposit.balance;
            console.log("walletBalanceAfterDeposit", walletBalanceAfterDeposit);

            // expected increase in balance = depositAmount/newPrice
            const expectedIncrease = depositAmount / BigInt(newPrice);


            expect(walletBalanceAfterDeposit).toEqual(walletBalanceBeforeDeposit + expectedIncrease);
        });

        it('should fail deposit to blacklisted address', async () => {
            const receiver = randomAddress();
            
            // First blacklist the receiver
            await jettonMinter.sendSetBlacklisted(deployer.getSender(), {
                value: toNano('0.05'),
                address: receiver,
                blacklisted: true,
            });

            const depositResult = await jettonMinter.sendDeposit(deployer.getSender(), {
                value: toNano('0.05'),
                tokenAddress: randomAddress(),
                depositAmount: toNano('100'),
                receiverAddress: receiver,
                amount: toNano('0.02'),
            });

            expect(depositResult.transactions).toHaveTransaction({
                success: false,
                exitCode: 0xBA,
            });
        });

        it('should process withdraw correctly', async () => {
            const withdrawAmount = toNano('50');
            const receiver = randomAddress();

            const withdrawResult = await jettonMinter.sendWithdraw(deployer.getSender(), {
                value: toNano('0.05'),
                shares: withdrawAmount,
                receiver: receiver,
                owner: deployer.address,
            });

            expect(withdrawResult.transactions).toHaveTransaction({
                success: true,
            });
        });

        it('should fail when non-admin tries to withdraw', async () => {
            const nonAdmin = await blockchain.treasury('non-admin');
            const withdrawResult = await jettonMinter.sendWithdraw(nonAdmin.getSender(), {
                value: toNano('0.05'),
                shares: toNano('100'),
                receiver: randomAddress(),
                owner: deployer.address,
            });

            expect(withdrawResult.transactions).toHaveTransaction({
                success: false,
                exitCode: 73,
            });
        });

        it('should fail when withdraw amount is 0', async () => {
            const withdrawResult = await jettonMinter.sendWithdraw(deployer.getSender(), {
                value: toNano('0.05'),
                shares: 0n,
                receiver: randomAddress(),
                owner: deployer.address,
            });

            expect(withdrawResult.transactions).toHaveTransaction({
                success: false,
                exitCode: 0xE3, // shares > 0 check
            }); 
        });

        it('should fail when withdraw to blacklisted address', async () => {
            const receiver = randomAddress();
            await jettonMinter.sendSetBlacklisted(deployer.getSender(), {
                value: toNano('0.05'),
                address: receiver,
                blacklisted: true,
            });

            const withdrawResult = await jettonMinter.sendWithdraw(deployer.getSender(), {
                value: toNano('0.05'),
                shares: toNano('100'),
                receiver: receiver,
                owner: deployer.address,
            });

            expect(withdrawResult.transactions).toHaveTransaction({
                success: false,
                exitCode: 0xBA,
            });
        });

        it('should fail when withdraw amount is greater than total supply', async () => {
            // get the current supply
            const jettonData = await jettonMinter.getJettonData();
            const totalSupply = jettonData.totalSupply;

            const withdrawResult = await jettonMinter.sendWithdraw(deployer.getSender(), {
                value: toNano('0.05'),
                shares: totalSupply + 1n,
                receiver: randomAddress(),
                owner: deployer.address,
            });

            expect(withdrawResult.transactions).toHaveTransaction({
                success: false,
                exitCode: 0xE4, // shares <= totalSupply check
            });
        });

    });

    // Rescue Operation Tests
    describe('Rescue Operations', () => {
        it('should allow admin to rescue TON', async () => {
            const rescueAmount = toNano('1');
            const rescueReceiver = randomAddress();

            const rescueResult = await jettonMinter.sendRescue(deployer.getSender(), {
                value: toNano('0.05'),
                toAddress: rescueReceiver,
                amount: rescueAmount,
            });

            expect(rescueResult.transactions).toHaveTransaction({
                success: true,
            });
        });

        it('should fail when non-admin tries to rescue TON', async () => {
            const nonAdmin = await blockchain.treasury('non-admin');
            const rescueResult = await jettonMinter.sendRescue(nonAdmin.getSender(), {
                value: toNano('0.05'),
                toAddress: randomAddress(),
                amount: toNano('1'),
            });

            expect(rescueResult.transactions).toHaveTransaction({
                success: false,
                exitCode: 73,
            });
        });
    });

    describe('sToken Address Management', () => {
        it('should set sToken address successfully by admin', async () => {
            const newStokenAddress = randomAddress();
    
            const setStokenResult = await jettonMinter.sendSetStoken(deployer.getSender(), {
                value: toNano('0.05'),
                sTokenAddress: newStokenAddress,
            });
    
            expect(setStokenResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: jettonMinter.address,
                success: true,
            });
        });
    
        it('should fail when non-admin tries to set sToken address', async () => {
            const nonAdmin = await blockchain.treasury('non-admin');
            const newStokenAddress = randomAddress();
    
            const setStokenResult = await jettonMinter.sendSetStoken(nonAdmin.getSender(), {
                value: toNano('0.05'),
                sTokenAddress: newStokenAddress,
            });
    
            expect(setStokenResult.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: jettonMinter.address,
                success: false,
                exitCode: 73, // Admin only error code
            });
        });
    });

    describe('Deposit Edge Cases', () => {
        it('should fail when deposit amount is 0', async () => {
            const receiver = randomAddress();
    
            const depositResult = await jettonMinter.sendDeposit(deployer.getSender(), {
                value: toNano('0.05'),
                tokenAddress: randomAddress(),
                depositAmount: 0n,        // Zero deposit
                receiverAddress: receiver,
                amount: toNano('0.02'),
            });
    
            expect(depositResult.transactions).toHaveTransaction({
                success: false,
                exitCode: 0xE2, // deposit_amt > 0 check
            });
        });
    
        it('should mint 0 tokens if depositAmount < price (truncate test)', async () => {
            // Suppose the storedPrice is 1,000,000 as in your config
            // If depositAmount is e.g. 500_000 nano-tons, minted = floor(500_000 / 1_000_000) = 0
            const depositAmount = 500_000n;  // half the current price
            const receiver = randomAddress();
    
            const depositResult = await jettonMinter.sendDeposit(deployer.getSender(), {
                value: toNano('0.05'),
                tokenAddress: randomAddress(),
                depositAmount,
                receiverAddress: receiver,
                amount: toNano(0.2)
            });
    
            expect(depositResult.transactions).toHaveTransaction({ success: true });
    
            // Check that totalSupply is unchanged because minted = 0
            const jettonData = await jettonMinter.getJettonData();
            expect(jettonData.totalSupply).toEqual(0n);
        });
    }); 
    
    describe('Content Management', () => {
        it('should update contract content properly if admin', async () => {
            const newContent = beginCell()
                .storeUint(2, 8)
                .storeStringTail("https://example.com/new_token.json")
                .endCell();
    
            await jettonMinter.sendChangeContent(deployer.getSender(), {
                value: toNano('0.05'),
                content: newContent
            });
    
            const jettonData = await jettonMinter.getJettonData();
            expect(jettonData.content.equals(newContent)).toBe(true);
        });

        it('should fail when non-admin tries to update contract content', async () => {
            const nonAdmin = await blockchain.treasury('non-admin');
            const newContent = beginCell()
                .storeUint(2, 8)
                .storeStringTail("https://example.com/new_token.json")
                .endCell();

            const changeContentResult = await jettonMinter.sendChangeContent(nonAdmin.getSender(), {
                value: toNano('0.05'),
                content: newContent
            });

            expect(changeContentResult.transactions).toHaveTransaction({
                success: false,
                exitCode: 73, // Admin only error code
            });
        });
    });
    
}); 