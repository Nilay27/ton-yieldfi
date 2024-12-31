import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'func',
    targets: ['contracts/counter.fc', 'contracts/imports/utils.fc', 'contracts/imports/op-codes.fc', 'contracts/imports/constants.fc', 'contracts/imports/discovery-params.fc', 'contracts/imports/jetton-utils.fc'],
};
