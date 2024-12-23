import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { compile } from '@ton/blueprint';
import { Manager, ManagerConfig } from '../wrappers/Manager';
import '@ton/test-utils';

describe('Manager', () => {
    let code: Cell;

    beforeAll(async () => {
        // Compile the Manager.fc
        code = await compile('Manager');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let manager: SandboxContract<Manager>;

    beforeEach(async () => {
        // create a fresh local blockchain
        blockchain = await Blockchain.create();

        // deployer wallet
        deployer = await blockchain.treasury('deployer');

        // initial config
        const config: ManagerConfig = {
            adminPubkey: 123n,
            sToken: 456n,
            yToken: 789n,
            treasury: 999n,
            isVault: false,
        };

        // create contract
        manager = blockchain.openContract(Manager.createFromConfig(config, code));

        // deploy
        const deployResult = await manager.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: manager.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy and read initial stoken / isVault', async () => {
        const provider = blockchain.provider(manager.address);
        const stoken = await manager.getStoken();
        expect(stoken).toBe(456n);

        const vaultFlag = await manager.getIsVault();
        expect(vaultFlag).toBe(false);
    });

    it('should set tokens', async () => {
        const provider = blockchain.provider(manager.address);

        const res = await manager.sendSetTokens( deployer.getSender(), {
            value: toNano('0.05'),
            newSToken: 999n,
            newYToken: 1000n,
            newIsVault: true,
        });

        expect(res.transactions).toHaveTransaction({
            from: deployer.address,
            to: manager.address,
            success: true,
        });

        // check updated
        const stoken = await manager.getStoken();
        expect(stoken).toBe(999n);

        const vaultFlag = await manager.getIsVault();
        expect(vaultFlag).toBe(true);
    });

    it('should deposit', async () => {
        const provider = blockchain.provider(manager.address);

        const res = await manager.sendDeposit( deployer.getSender(), {
            value: toNano('0.05'),
            depositAmount: 42,
        });

        expect(res.transactions).toHaveTransaction({
            from: deployer.address,
            to: manager.address,
            success: true,
        });

        // Nothing is stored in the contract about deposit yet,
        // so we just check that the transaction succeeded.
    });

    it('should withdraw', async () => {
        const provider = blockchain.provider(manager.address);

        const res = await manager.sendWithdraw( deployer.getSender(), {
            value: toNano('0.05'),
            withdrawAmount: 13,
        });

        expect(res.transactions).toHaveTransaction({
            from: deployer.address,
            to: manager.address,
            success: true,
        });
    });
});
