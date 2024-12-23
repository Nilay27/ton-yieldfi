import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { compile } from '@ton/blueprint';
import { Manager } from '../wrappers/Manager';
import '@ton/test-utils';

describe('Manager', () => {
    let code: Cell;

    beforeAll(async () => {
        // Compile from contracts/Manager.fc
        code = await compile('Manager');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let manager: SandboxContract<Manager>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        // Create the contract with sToken=123, isVault=false as an example
        manager = blockchain.openContract(
            Manager.createFromConfig(
                {
                    sToken: 123,
                    isVault: false,
                },
                code
            )
        );

        // Deploy
        const deployResult = await manager.sendDeploy(deployer.getSender(), toNano('0.05'));

        // Check deployment
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: manager.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy and read initial stoken / isVault', async () => {
        const stoken = await manager.getStoken();
        expect(stoken).toBe(123);

        const vaultFlag = await manager.getIsVault();
        expect(vaultFlag).toBe(false);
    });

    it('should set tokens', async () => {
        // set sToken=999, isVault=true
        const setResult = await manager.sendSetTokens(deployer.getSender(), {
            value: toNano('0.5'),
            newSToken: 999,
            newIsVault: true,
        });

        expect(setResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: manager.address,
            success: true,
        });
        

        // read back
        const stoken = await manager.getStoken();
        expect(stoken).toBe(999);

        const vaultFlag = await manager.getIsVault();
        expect(vaultFlag).toBe(true);
    });

    it('should deposit', async () => {
        const depositResult = await manager.sendDeposit(deployer.getSender(), {
            value: toNano('0.5'),
            depositAmount: 50,
        });

        expect(depositResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: manager.address,
            success: true,
        });

        // No state change here, but at least we confirm success
    });

    it('should withdraw', async () => {
        const withdrawResult = await manager.sendWithdraw(deployer.getSender(), {
            value: toNano('0.5'),
            withdrawAmount: 12,
        });

        expect(withdrawResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: manager.address,
            success: true,
        });
    });
});
