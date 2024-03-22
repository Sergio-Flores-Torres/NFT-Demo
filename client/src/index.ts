import {
    Cluster, Logs, Context,
    clusterApiUrl, ParsedInstruction,
    Connection, LAMPORTS_PER_SOL,
    PublicKey,
    Keypair,
    Transaction,
    ParsedTransactionWithMeta,
    TransactionInstruction,
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

  function createKeypairFromFile(filePath: string): Keypair {
    const secretKeyString = fs.readFileSync(filePath, {encoding: 'utf8'});
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    return Keypair.fromSecretKey(secretKey);
  }

  (async () => {
 
    let rpcUrl = clusterApiUrl("devnet" as Cluster);
    //let rpcUrl: string = "http://localhost:8899";
   
    connection = new Connection(rpcUrl, "finalized");
    console.log(`Successfully connected to Solana `);

    const appowner = createKeypairFromFile(
        path.join(
            path.resolve(__dirname, '../../'), 
            'appowner.json'
    ));
    console.log(`Local account loaded successfully.`);

    const programKeypair = createKeypairFromFile(
        path.join(
            path.resolve(__dirname, '../../program/mint-nft/dist/program'), 
            'mint_nft-keypair.json'
    ));
    const programId = programKeypair.publicKey;
    console.log(`Program ID: ${programId.toBase58()}`);

    // Derive the mint address and the associated token account address

    const mintKeypair: Keypair = Keypair.generate();
    const tokenAddress = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      appowner.publicKey
    );
    console.log(`New token: ${mintKeypair.publicKey}`);

    // Transact with our program

    const instruction = new TransactionInstruction({
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
                pubkey: appowner.publicKey,
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
        ],
        programId: programId,
        data: Buffer.alloc(0),
    })
    await sendAndConfirmTransaction(
        connection,
        new Transaction().add(instruction),
        [appowner, mintKeypair],
    )
  })();
  