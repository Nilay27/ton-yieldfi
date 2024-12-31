import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'func',
    targets: ['contracts/JettonWallet.fc','contracts/imports/stdlib.fc',
        'contracts/imports/constants.fc',
        'contracts/imports/jetton-utils.fc',
        'contracts/imports/utils.fc',
        'contracts/imports/discovery-params.fc'],
}; 