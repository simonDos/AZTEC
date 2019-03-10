const aztec = require('../../../aztec.js');

const BN = require('bn.js');

const {
    proof,
    abiEncoder,
    secp256k1,
    sign,
    note,
// eslint-disable-next-line import/no-unresolved
} = require('aztec.js');
const {
    constants: {
        CRS,
    },
} = require('@aztec/dev-utils');

const {joinSplit: aztecProof} = proof;
const {outputCoder, inputCoder} = abiEncoder;
const joinSplitEncode = inputCoder.joinSplit;

const DividendComputation = artifacts.require('./contracts/ACE/validators/dividendComputation/DividendComputationInterface');
const IERC20 = artifacts.require('openzeppelin-solidity/contracts/token/ERC20/IERC20.sol');
const ERC20Mintable = artifacts.require('./contracts/ERC20/ERC20Mintable');

const ZKDAO = artifacts.require('./contracts/votes/ZKDAO.sol')
const ZKERC20 = artifacts.require('./contracts/votes/ZKERC20.sol')
const NoteRegistry = artifacts.require('./contracts/votes/NoteRegistry.sol')
const ACE = artifacts.require('./contracts/ACE/ACE.sol')
const JoinSplit = artifacts.require('./contracts/ACE/validators/joinSplit/JoinSplit');
const JoinSplitInterface = artifacts.require('./contracts/ACE/validators/joinSplit/JoinSplitInterface');

const DividendComputation_Address = require('../../build/contracts/DividendComputation.json').networks["1234"].address;
const ERC20_Address = require('../../build/contracts/ERC20Mintable.json').networks["1234"].address;
const ZKDAO_Address = require('../../build/contracts/ZKDAO.json').networks["1234"].address;
const ZKERC20_Address = require('../../build/contracts/ZKERC20.json').networks["1234"].address;
const ACE_Address = require('../../build/contracts/ACE.json').networks["1234"].address;
const JoinSplit_Address = require('../../build/contracts/JoinSplit.json').networks["1234"].address;


console.log('ERC20 Address', ERC20_Address);
console.log('Dividend Address', DividendComputation_Address);


contract('ZKERC20', async (accounts) => {

    let erc20, dividendProof, za, zb, dividendAccounts, zkdao, noteRegistry, ace, joinSplit, zkerc20, proofData_encoded
    const tokensTransferred = new BN(100000);

    beforeEach(async () => {

        erc20 = await ERC20Mintable.at(ERC20_Address);

        zkerc20 = await ZKERC20.at(ZKERC20_Address);
        let noteRegistry_address = await zkerc20.noteRegistry()
        noteRegistry = await NoteRegistry.at(noteRegistry_address)

        ace = await ACE.at(ACE_Address)
        joinSplit = await JoinSplit.at(JoinSplit_Address)

        /*k = [90, 4, 50]
        za = 100
        zb = 5

        Interest rate = 5%


            note A and B
        prove B is 5% of A
        A = k1 = 90
        B = k2 = 4

        k3 = k1*zb - k2*za

        k3 = 90*5 - 4*100


        50 = 90*5 - 4*100
        50 = 450 - 400
        50 = 50*/


        
    })

    let aztecAccounts;
    let notes;
    let scalingFactor;
    let proofOutputs;
    const publicOwner = '0x0000000000000000000000000000000000000000';


    it('generates a dividend proof', async () => {
        dividendAccounts = [...new Array(3)].map(() => secp256k1.generateAccount());

        let totalShares = 200
        let myShares = 20
        za = 100;
        zb = 10;
        let dif = totalShares * zb - myShares * za

        const noteValues = [totalShares, myShares, dif];


        notes = [
            ...dividendAccounts.map(({publicKey}, i) => note.create(publicKey, noteValues[i])),
        ];
        // we will prove that account account account b (200) owns 5/100 (zb/za) of account a (200)
        // 50 is the difference between the two relationships (0 = 200*5 - 10*100)


        dividendProof = proof.dividendComputation.constructProof(notes, za, zb, accounts[1])
        const {
            proofData,
            challenge,
        } = dividendProof;

        // console.log({ za, zb })
        // console.log(dividendProof)

        const proofDataFormatted = [proofData.slice(0, 6)].concat([proofData.slice(6, 12), proofData.slice(12, 18)]);


        const inputNotes = notes.slice(0, 1);
        const outputNotes = notes.slice(1, 3);
        const inputOwners = inputNotes.map(m => m.owner);
        const outputOwners = outputNotes.map(n => n.owner);


        const data = aztec.abiEncoder.inputCoder.dividendComputation(
            proofDataFormatted,
            challenge,
            za,
            zb,
            inputOwners,
            outputOwners,
            outputNotes
        );

        // console.log(data)

        // console.log('Dividend proof constructed: ', dividendProof)
    })


    it('allocates zkshares', async () => {
        aztecAccounts = [...new Array(4)].map(() => secp256k1.generateAccount());
        notes = [
            ...aztecAccounts.map(({publicKey}, i) => note.create(publicKey, i * 10)),
            ...aztecAccounts.map(({publicKey}, i) => note.create(publicKey, i * 10)),
        ];
        //await ace.setCommonReferenceString(CRS);

        let proofs = []

        proofs[0] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
            inputNotes: [],
            outputNotes: notes.slice(0, 2),
            senderAddress: accounts[0],
            inputNoteOwners: [
                aztecAccounts[0],
                aztecAccounts[0]
            ],
            publicOwner,
            kPublic: -10,
            aztecAddress: joinSplit.address,
        });

        scalingFactor = new BN(10);
        await Promise.all(accounts.map(account => erc20.mint(
            account,
            scalingFactor.mul(tokensTransferred),
            {from: accounts[0], gas: 4700000}
        )));

        await Promise.all(accounts.map(account => erc20.approve(
            noteRegistry.address,
            scalingFactor.mul(tokensTransferred),
            {from: account, gas: 4700000}
        ))); // approving tokens


        proofOutputs = proofs.map(({expectedOutput}) => outputCoder.getProofOutput(expectedOutput, 0));
        const proofHashes = proofOutputs.map(proofOutput => outputCoder.hashProofOutput(proofOutput));
        await noteRegistry.publicApprove(
            proofHashes[0],
            10,
            {from: accounts[0]}
        );

        await zkerc20.confidentialTransfer(
            proofs[0].proofData
        )

    })

    it.skip('can transfer notes again', async () => {
        let input = {
            inputNotes: notes.slice(0, 2),
            outputNotes: notes.slice(2, 4),
            senderAddress: accounts[0],
            inputNoteOwners: [
                aztecAccounts[0],
                aztecAccounts[0]
            ],
            publicOwner,
            kPublic: 0,
            aztecAddress: joinSplit.address,
        }

        console.log(input)

        let transferProof = aztec.proof.joinSplit.encodeJoinSplitTransaction(input);

        console.log(transferProof);

        await zkerc20.confidentialTransfer(
            transferProof.proofData
        )
    })

    it('can do a dividend proof', async () => {
        dividendAccounts = [...new Array(3)].map(() => secp256k1.generateAccount());

        let totalShares = 200
        let myShares = 20
        za = 100;
        zb = 10;
        let dif = totalShares * zb - myShares * za

        const noteValues = [totalShares, myShares, dif];


        notes = [
            ...dividendAccounts.map(({publicKey}, i) => note.create(publicKey, noteValues[i])),
        ];
        // we will prove that account account account b (200) owns 5/100 (zb/za) of account a (200)
        // 50 is the difference between the two relationships (0 = 200*5 - 10*100)


        dividendProof = proof.dividendComputation.constructProof(notes, za, zb, accounts[1])

        //console.log('Dividend proof constructed: ', dividendProof)
    })


    it('can commit to vote', async () => {

        zkdao = await ZKDAO.at(ZKDAO_Address);
        
        // format

        let proofDataRaw = dividendProof.proofData;

        const proofDataRawFormatted = [proofDataRaw.slice(0, 6)].concat([proofDataRaw.slice(6, 12), proofDataRaw.slice(12, 18)]);

        const inputNotes = notes.slice(0, 1);
        const outputNotes = notes.slice(1, 3);

        const inputOwners = inputNotes.map(m => m.owner);
        const outputOwners = outputNotes.map(n => n.owner);

        proofData_encoded = aztec.abiEncoder.inputCoder.dividendComputation(
            proofDataRawFormatted,
            dividendProof.challenge,
            za,
            zb,
            inputOwners,
            outputOwners,
            outputNotes
        );

        await zkdao.commitVote(0, accounts[0], proofData_encoded)

    })

    it('can reveal the vote', async () => {

        await zkdao.revealVote(0, accounts[0], proofData_encoded)

    })
})