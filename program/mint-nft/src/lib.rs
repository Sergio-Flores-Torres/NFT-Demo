use {
    solana_program::{
        account_info::{next_account_info, AccountInfo}, 
        entrypoint, 
        entrypoint::ProgramResult, 
        msg, program_error::ProgramError,
        native_token::LAMPORTS_PER_SOL,
        program::invoke,
        pubkey::Pubkey,
        system_instruction,
    },
    spl_token::{
        instruction as token_instruction,
    },
    spl_associated_token_account::{
        instruction as token_account_instruction,
    },
};

/// 1st signer.  
/// Base58 repr of the address 32 bytes as &str.     
pub const ADMIN_PUBKEY_STR: &str = env!("ADMIN_PUBKEY_STR");

/// 2nd signer.
/// Base58 repr of the address 32 bytes as &str.    
pub const SECOND_PUBKEY_STR: &str = env!("SECOND_PUBKEY_STR");

entrypoint!(process_instruction);


fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> ProgramResult {

    let accounts_iter = &mut accounts.iter();

    let mint = next_account_info(accounts_iter)?;
    let token_account = next_account_info(accounts_iter)?;
    let mint_authority = next_account_info(accounts_iter)?;
    let rent = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;
    let token_program = next_account_info(accounts_iter)?;
    let associated_token_program = next_account_info(accounts_iter)?;
    let second_signer = next_account_info(accounts_iter)?;

    // SO, the whole point of multisig, is that here we look at our signers
    // and we compare them with our known accounts (or pubkeys in a data account)

    // Comparing the bs58 strings of the pubkeys 
	if mint_authority.key.to_string() != *ADMIN_PUBKEY_STR || 
        !mint_authority.is_signer {
        msg!("Unapproved Admin/Mint Auth");
        return Err(ProgramError::MissingRequiredSignature);
    } 

	if second_signer.key.to_string() != *SECOND_PUBKEY_STR || 
        !second_signer.is_signer {
        msg!("Unapproved Second Signer");
        return Err(ProgramError::MissingRequiredSignature);
    } 

    msg!("Creating mint account...");
    msg!("Mint: {}", mint.key);
    invoke(
        &system_instruction::create_account(
            &mint_authority.key,
            &mint.key,
            LAMPORTS_PER_SOL / 10,	// Rent, since this is a demo in devnet the exact amount doesn't really matter
            82,
            &token_program.key,	// Owned by the token program
        ),
        &[
            mint.clone(),
            mint_authority.clone(),
            token_program.clone(),
        ]
    )?;

    msg!("Initializing mint account...");
    msg!("Mint: {}", mint.key);
    invoke(
        &token_instruction::initialize_mint(
            &token_program.key,
            &mint.key,
            &mint_authority.key,
            Some(&mint_authority.key),
            0,
        )?,
        &[
            mint.clone(),
            mint_authority.clone(),
            token_program.clone(),
            rent.clone(),
        ]
    )?;

    msg!("Creating token account...");
    msg!("Token Address: {}", token_account.key);    
    invoke(
        &token_account_instruction::create_associated_token_account(
            &mint_authority.key,
            &mint_authority.key,
            &mint.key,
			&token_program.key,
        ),
        &[
            mint_authority.clone(),
            token_account.clone(),
			mint.clone(),
			system_program.clone(),
            token_program.clone(),
			associated_token_program.clone(),
			rent.clone(),
        ]
    )?;

    msg!("Minting token to token account...");
    msg!("Mint: {}", mint.key);   
    msg!("Token Address: {}", token_account.key);
    invoke(
        &token_instruction::mint_to(
            &token_program.key,
            &mint.key,
            &token_account.key,
            &mint_authority.key,
            &[&mint_authority.key],
            1,
        )?,
        &[
            mint.clone(),
            mint_authority.clone(),
            token_account.clone(),
            token_program.clone(),
            rent.clone(),
        ]
    )?;

    msg!("Token mint process completed successfully.");

    Ok(())
}
