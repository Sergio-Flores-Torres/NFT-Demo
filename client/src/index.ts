    import {
        Cluster, Logs, Context,
        clusterApiUrl, ParsedInstruction,
        Connection, LAMPORTS_PER_SOL,
        PublicKey, NONCE_ACCOUNT_LENGTH,
        Keypair, NonceAccount,
        Transaction, AccountInfo,
        ParsedTransactionWithMeta,
        TransactionInstruction, sendAndConfirmRawTransaction,
        TransactionMessage, SYSVAR_RENT_PUBKEY, SystemProgram,
        VersionedTransaction, sendAndConfirmTransaction
    } from "@solana/web3.js";
    
    import {
        createFreezeAccountInstruction,
        AuthorityType, getAssociatedTokenAddress,
        createSetAuthorityInstruction,
        setAuthority, ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
    } from "@solana/spl-token";
    
    import * as fs from 'fs';
    import * as path from 'path';
  
    var connection: Connection;
    let adminAccount: Keypair;
    let secondAccount: Keypair;

    let nonceAccountPubkey: PublicKey;
    let nonceAccountInfo: AccountInfo<Buffer> | null;
    let nonceAccount: NonceAccount;

    let programId: PublicKey;

    function delay(time: number) {
        return new Promise(resolve => setTimeout(resolve, time));
    }

    function createKeypairFromFile(filePath: string): Keypair {
        const secretKeyString = fs.readFileSync(filePath, {encoding: 'utf8'});
        const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
        return Keypair.fromSecretKey(secretKey);
    }

    async function createNonceAccount(): Promise<PublicKey> {
        let nonceAccountKP = Keypair.generate();
        console.log(`Nonce account: ${nonceAccountKP.publicKey.toBase58()}`);
        console.log(`Nonce account size: ${NONCE_ACCOUNT_LENGTH}`);

        let tx = new Transaction().add(
            // create nonce account
            SystemProgram.createAccount({
            fromPubkey: adminAccount.publicKey,
            newAccountPubkey: nonceAccountKP.publicKey,
            lamports: await connection.getMinimumBalanceForRentExemption(
                NONCE_ACCOUNT_LENGTH
            ),
            space: NONCE_ACCOUNT_LENGTH,
            programId: SystemProgram.programId,
            }),
            // init nonce account
            SystemProgram.nonceInitialize({
            noncePubkey: nonceAccountKP.publicKey, // nonce account pubkey
            authorizedPubkey: adminAccount.publicKey, // nonce account authority (for advance and close)
            })
        );

        console.log(
            `Nonce creation txhash: ${await sendAndConfirmTransaction(connection, tx, [adminAccount, nonceAccountKP])}`
        );

        return nonceAccountKP.publicKey;
    }

    async function assembleTx(): Promise<Buffer> {
        // Derive the mint address and the associated token account address

        const mintKeypair: Keypair = Keypair.generate();
        const tokenAddress = await getAssociatedTokenAddress(
        mintKeypair.publicKey,
        adminAccount.publicKey
        );
        console.log(`New token: ${mintKeypair.publicKey}`);

        // Transact with our program

        const nonce_advance_instruction = 
             // nonce advance must be the first instruction
             SystemProgram.nonceAdvance({
                noncePubkey: nonceAccountPubkey,
                authorizedPubkey: adminAccount.publicKey,
              });
    
              const mint_instruction = new TransactionInstruction({
                keys: [
                    // Mint account
                    {
                        pubkey: mintKeypair.publicKey,
                        isSigner: true,
                        isWritable: true,
                    },
                    // Token account
                    {
                        pubkey: tokenAddress,
                        isSigner: false,
                        isWritable: true,
                    },
                    // Mint Authority
                    {
                        pubkey: adminAccount.publicKey,
                        isSigner: true,
                        isWritable: false,
                    },
                    // Rent account
                    {
                        pubkey: SYSVAR_RENT_PUBKEY,
                        isSigner: false,
                        isWritable: false,
                    },
                    // System program
                    {
                        pubkey: SystemProgram.programId,
                        isSigner: false,
                        isWritable: false,
                    },
                    // Token program
                    {
                        pubkey: TOKEN_PROGRAM_ID,
                        isSigner: false,
                        isWritable: false,
                    },
                    // Associated token program
                    {
                        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
                        isSigner: false,
                        isWritable: false,
                    },
                    // Second signer
                    {
                        pubkey: secondAccount.publicKey,
                        isSigner: true,
                        isWritable: false,
                    },
                ],
                programId: programId,
                data: Buffer.alloc(0),
            })
    
        const transaction = new Transaction();
    
        transaction.add(nonce_advance_instruction);
        transaction.add(mint_instruction);
    
        transaction.recentBlockhash = nonceAccount.nonce; // MAGIC HERE
        transaction.feePayer = adminAccount.publicKey;
        transaction.partialSign(adminAccount); // 1st signer here
        transaction.partialSign(mintKeypair); // Mint Auth sig here
    
        return transaction.serialize({requireAllSignatures: false, verifySignatures: false});
    }

  async function multiSigWithNonce() {
	// Create Nonce Account
	// 4 steps to it = 1. Create 2. Get Info 3.Get Data 4. Execute Advance in Transaction Instruction
	nonceAccountPubkey = await createNonceAccount();
	await delay(500); // Network sometimes doesn't get you the info back immediately
	nonceAccountInfo = await connection.getAccountInfo(nonceAccountPubkey, 'confirmed');

	while (nonceAccountInfo === null) {
		console.log("Nonce: Failed... Retrying")
		await delay(500);
		nonceAccountInfo = await connection.getAccountInfo(nonceAccountPubkey, 'confirmed');
	}

	nonceAccount = NonceAccount.fromAccountData(nonceAccountInfo!.data);
	console.log(`Nonce Account Ready ${nonceAccountPubkey}`);

    // This txBuffer is a serialized tx that can be saved elsewhere and sent 
    // in bs58 over https to the other signers. At this point it is signed by admin locally
	let txBuffer = await assembleTx();

    // **** HERE TX TRAVELS OVER HTTPS IN BS58, ETC ETC TIME PASSES ****

	console.log("Simulating Remote signing locally...")
	const transaction = Transaction.from(txBuffer);
	transaction.partialSign(secondAccount); // SECOND SIGNER
	await delay(500);

	let sig = await connection.sendRawTransaction(transaction.serialize());
	console.log(`success -> tx: ${sig}`); 

    // Don't forget to close the nonce here to recover its rent

  }


  (async () => {
 
    let rpcUrl = clusterApiUrl("devnet" as Cluster);
    //let rpcUrl: string = "http://localhost:8899";
   
    connection = new Connection(rpcUrl, "finalized");
    console.log(`Successfully connected to Solana `);

    // Has authority over stuff, pays for stuff
    adminAccount = createKeypairFromFile(
        path.join(
            path.resolve(__dirname, '../../keys/'), 
            'adminaccount.json'
    ));
    console.log(`Local account loaded successfully ${adminAccount.publicKey}.`);

    // Second signer, just to prove we can
    secondAccount = createKeypairFromFile(
        path.join(
            path.resolve(__dirname, '../../keys/'), 
            'secondaccount.json'
    ));
    console.log(`Local account 2 loaded successfully ${secondAccount.publicKey}`);

    const programKeypair = createKeypairFromFile(
        path.join(
            path.resolve(__dirname, '../../program/mint-nft/target/deploy'), 
            'mint_nft-keypair.json'
    ));
    programId = programKeypair.publicKey;
    console.log(`Program ID: ${programId.toBase58()}`);

    await multiSigWithNonce();
  })();
  