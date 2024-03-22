# NFT-Demo
A Solana based on-chain NFT tech demo

Program owner
8KwDbhAQGa2Upf9RVVHERDsvYvfY99E1xWHYXrz2RxUR - appowner.json

Program ID Devnet
J3YVmzu9vyWuGqZdUMTa7SRpSA5VaERYtVBvMy11Ncum

Useful
cargo build-bpf --manifest-path=./Cargo.toml --bpf-out-dir=./dist/program
solana program deploy --keypair=../../appowner.json dist/program/mint_nft.so
