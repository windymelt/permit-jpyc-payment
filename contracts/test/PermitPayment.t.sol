// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { PermitPayment } from "../src/PermitPayment.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev テスト用 ERC-20 + ERC-2612 実装（fork 不要）
contract MockERC20Permit is ERC20Permit {
    constructor() ERC20("Mock Token", "MOCK") ERC20Permit("Mock Token") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract PermitPaymentTest is Test {
    PermitPayment internal permitPayment;
    MockERC20Permit internal token;

    // 送り手の秘密鍵（テスト用固定値）
    uint256 internal constant SENDER_PK =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address internal sender;
    address internal receiver;

    function setUp() public {
        permitPayment = new PermitPayment();
        token = new MockERC20Permit();

        sender = vm.addr(SENDER_PK);
        receiver = makeAddr("receiver");

        token.mint(sender, 1_000_000 ether);
    }

    /// @dev 正常系：receiver が呼び出すと転送される
    function test_permitAndTransfer_success() public {
        uint256 value = 1000 * 1e18;
        uint256 deadline = block.timestamp + 10 minutes;
        uint256 nonce = token.nonces(sender);

        bytes32 digest = _permitDigest(sender, address(permitPayment), value, nonce, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SENDER_PK, digest);

        vm.prank(receiver);
        permitPayment.permitAndTransfer(address(token), sender, receiver, value, deadline, v, r, s);

        assertEq(token.balanceOf(receiver), value);
        assertEq(token.balanceOf(sender), 1_000_000 ether - value);
    }

    /// @dev receiver 以外が呼び出すと revert する
    function test_permitAndTransfer_revertIfNotReceiver() public {
        uint256 value = 1000 * 1e18;
        uint256 deadline = block.timestamp + 10 minutes;
        uint256 nonce = token.nonces(sender);

        bytes32 digest = _permitDigest(sender, address(permitPayment), value, nonce, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SENDER_PK, digest);

        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert("PermitPayment: only receiver");
        permitPayment.permitAndTransfer(address(token), sender, receiver, value, deadline, v, r, s);
    }

    /// @dev deadline 超過後は revert する
    function test_permitAndTransfer_revertIfExpired() public {
        uint256 value = 1000 * 1e18;
        uint256 deadline = block.timestamp - 1; // 既に期限切れ
        uint256 nonce = token.nonces(sender);

        bytes32 digest = _permitDigest(sender, address(permitPayment), value, nonce, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SENDER_PK, digest);

        vm.prank(receiver);
        vm.expectRevert();
        permitPayment.permitAndTransfer(address(token), sender, receiver, value, deadline, v, r, s);
    }

    // --- ヘルパー ---

    function _permitDigest(
        address owner,
        address spender,
        uint256 value,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                owner,
                spender,
                value,
                nonce,
                deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
    }
}
